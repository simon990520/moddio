require('dotenv').config();
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { createClerkClient } = require('@clerk/clerk-sdk-node');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = 3000;

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Game state
const waitingPlayers = [];
const activeRooms = new Map();
const userSockets = new Map(); // userId -> socketId (Enforce single session)

// Helper functions
function createPlayer(socketId, userId, imageUrl) {
    return {
        id: crypto.randomUUID(),
        userId,
        socketId,
        imageUrl,
        score: 0,
        choice: null,
        ready: true
    };
}

function createRoom(player1, player2) {
    const roomId = crypto.randomUUID();
    return {
        id: roomId,
        players: [player1, player2],
        round: 1,
        state: 'countdown',
        countdown: 3,
        winner: null,
        rematchRequested: false,
        rematchRequestedBy: null
    };
}

function determineWinner(choice1, choice2) {
    if (choice1 === choice2) return 'tie';
    if (
        (choice1 === 'rock' && choice2 === 'scissors') ||
        (choice1 === 'paper' && choice2 === 'rock') ||
        (choice1 === 'scissors' && choice2 === 'paper')
    ) {
        return 'player1';
    }
    return 'player2';
}

app.prepare().then(() => {
    const httpServer = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    const io = new Server(httpServer, {
        cors: {
            origin: process.env.NODE_ENV === 'production' ? process.env.PRODUCTION_URL : '*',
            methods: ['GET', 'POST']
        }
    });

    // Security Middleware: Validate Clerk Token
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('Authentication error: Token missing'));

            // Use verifyToken for faster, more robust JWT verification
            // This doesn't poll Clerk's API, it verifies the signature locally
            const payload = await clerkClient.verifyToken(token);

            if (!payload) {
                console.error('[SERVER_AUTH] Token verification failed for socket:', socket.id);
                return next(new Error('Authentication error: Invalid token'));
            }

            // The userId is in the 'sub' field of the JWT
            socket.userId = payload.sub;
            console.log('[SERVER_AUTH] User authenticated via JWT:', socket.userId);
            next();
        } catch (err) {
            console.error('[SERVER_AUTH] Socket Auth Error:', err.message);
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.userId;
        console.log('[SERVER_INFO] Player connected:', socket.id, 'User:', userId);

        // Enforce Single Session
        if (userSockets.has(userId)) {
            const oldSocketId = userSockets.get(userId);
            io.sockets.sockets.get(oldSocketId)?.disconnect();
            console.log('Multiple tabs detected. Disconnected old session for:', userId);
        }
        userSockets.set(userId, socket.id);

        socket.on('updateProfile', async (data) => {
            const { username, birthDate } = data;
            console.log('[SERVER_AUTH] Updating profile for:', userId, { username, birthDate });

            try {
                const { error } = await supabase
                    .from('profiles')
                    .upsert({
                        id: userId,
                        username,
                        birth_date: birthDate,
                        updated_at: new Date().toISOString()
                    });

                if (error) {
                    console.error('[SERVER_DB] Profile update error:', error.message);
                    socket.emit('profileUpdateError', error.message);
                } else {
                    socket.emit('profileUpdated');
                }
            } catch (err) {
                console.error('[SERVER_DB] Profile update exception:', err.message);
                socket.emit('profileUpdateError', 'Internal Error');
            }
        });

        socket.on('findMatch', (data) => {
            const userId = socket.userId;
            const imageUrl = data?.imageUrl;
            console.log('[SERVER_GAME] ═══════════════════════════════════');
            console.log('[SERVER_GAME] findMatch request from:', userId);
            console.log('[SERVER_GAME] Data received:', JSON.stringify(data));
            console.log('[SERVER_GAME] imageUrl extracted:', imageUrl);
            console.log('[SERVER_GAME] imageUrl type:', typeof imageUrl);
            console.log('[SERVER_GAME] ═══════════════════════════════════');

            // Check if player is already waiting
            if (waitingPlayers.some(p => p.socketId === socket.id || p.userId === userId)) {
                console.warn('[SERVER_GAME] Player already in queue or playing:', userId);
                return;
            }

            // Check if player was in a finished game (leaving for new match)
            if (activeRooms.has(socket.id)) {
                const room = activeRooms.get(socket.id);
                if (room.state === 'gameOver') {
                    const opponent = room.players.find(p => p.socketId !== socket.id);
                    if (opponent) {
                        io.to(opponent.socketId).emit('opponentLeft');
                        // Clean up room references for the opponent so they're free to match too
                        activeRooms.delete(opponent.socketId);
                    }
                    activeRooms.delete(socket.id);
                }
            }

            const player = createPlayer(socket.id, userId, imageUrl);
            console.log('[SERVER_GAME] Created player object for:', userId, 'with image:', !!imageUrl);

            // If someone is waiting, match them
            if (waitingPlayers.length > 0) {
                const opponent = waitingPlayers.shift();
                console.log('[SERVER_GAME] MATCH FOUND! Matching with opponent:', opponent.socketId, 'Image:', !!opponent.imageUrl);
                const room = createRoom(player, opponent);

                activeRooms.set(socket.id, room);
                activeRooms.set(opponent.socketId, room);

                // Join socket room
                socket.join(room.id);
                io.sockets.sockets.get(opponent.socketId)?.join(room.id);

                console.log('[SERVER_GAME] Unified Room joined:', room.id);

                // Notify both players
                const matchData0 = {
                    roomId: room.id,
                    playerIndex: 0,
                    opponentId: opponent.id,
                    opponentImageUrl: opponent.imageUrl || null
                };
                console.log('[SERVER_GAME] Emitting matchFound to P0:', socket.id, matchData0);
                socket.emit('matchFound', matchData0);

                const matchData1 = {
                    roomId: room.id,
                    playerIndex: 1,
                    opponentId: player.id,
                    opponentImageUrl: player.imageUrl || null
                };
                console.log('[SERVER_GAME] Emitting matchFound to P1:', opponent.socketId, matchData1);
                io.to(opponent.socketId).emit('matchFound', matchData1);

                // Start countdown after 1 second
                setTimeout(() => {
                    startCountdown(room.id);
                }, 1000);

            } else {
                // Add to waiting queue
                waitingPlayers.push(player);
                console.log('[SERVER_GAME] Added to queue. waitingPlayers size:', waitingPlayers.length);
                socket.emit('waiting');
            }
        });

        socket.on('makeChoice', (choice) => {
            const room = activeRooms.get(socket.id);
            if (!room || room.state !== 'playing') return;

            // Find which player made the choice
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex === -1) return;

            room.players[playerIndex].choice = choice;

            // Check if both players made their choice
            if (room.players[0].choice && room.players[1].choice) {
                resolveRound(room);
            }
        });

        socket.on('requestRematch', () => {
            const room = activeRooms.get(socket.id);
            if (!room || room.state !== 'gameOver') return;

            room.rematchRequested = true;
            room.rematchRequestedBy = socket.id;

            // Notify opponent
            const opponentSocket = room.players.find(p => p.socketId !== socket.id)?.socketId;
            if (opponentSocket) {
                io.to(opponentSocket).emit('rematchRequested');
            }
        });

        socket.on('rematchResponse', (accepted) => {
            const room = activeRooms.get(socket.id);
            if (!room || !room.rematchRequested) return;

            const requesterSocket = room.rematchRequestedBy;
            const opponentSocket = room.players.find(p => p.socketId !== socket.id)?.socketId;

            if (accepted && requesterSocket && opponentSocket) {
                // Notify both players
                io.to(requesterSocket).emit('rematchAccepted');
                io.to(opponentSocket).emit('rematchAccepted');

                // Reset room state
                setTimeout(() => {
                    room.players[0].score = 0;
                    room.players[1].score = 0;
                    room.players[0].choice = null;
                    room.players[1].choice = null;
                    room.round = 1;
                    room.state = 'countdown';
                    room.winner = null;
                    room.rematchRequested = false;
                    room.rematchRequestedBy = null;

                    startCountdown(room.id);
                }, 2000);
            } else {
                // Notify requester
                if (requesterSocket) {
                    io.to(requesterSocket).emit('rematchDeclined');
                }
                if (opponentSocket) {
                    io.to(opponentSocket).emit('rematchDeclined');
                }

                // Clean up room
                setTimeout(() => {
                    activeRooms.delete(room.players[0].socketId);
                    activeRooms.delete(room.players[1].socketId);
                }, 2000);
            }
        });

        socket.on('disconnect', () => {
            console.log('Player disconnected:', socket.id);

            // Handle session map
            if (userSockets.get(userId) === socket.id) {
                userSockets.delete(userId);
            }

            // Remove from waiting queue
            const waitingIndex = waitingPlayers.findIndex(p => p.socketId === socket.id);
            if (waitingIndex !== -1) {
                waitingPlayers.splice(waitingIndex, 1);
            }

            // Handle room disconnection
            const room = activeRooms.get(socket.id);
            if (room) {
                // Notify opponent
                const opponentSocket = room.players.find(p => p.socketId !== socket.id)?.socketId;
                if (opponentSocket) {
                    io.to(opponentSocket).emit('opponentDisconnected');
                    activeRooms.delete(opponentSocket);
                }
                activeRooms.delete(socket.id);
            }
        });
    });

    function startCountdown(roomId) {
        const room = Array.from(activeRooms.values()).find(r => r.id === roomId);
        if (!room) return;

        room.state = 'countdown';
        room.countdown = 3;

        io.to(roomId).emit('countdown', room.countdown);

        const countdownInterval = setInterval(() => {
            room.countdown--;

            if (room.countdown > 0) {
                io.to(roomId).emit('countdown', room.countdown);
            } else {
                clearInterval(countdownInterval);
                room.state = 'playing';
                io.to(roomId).emit('roundStart', room.round);
            }
        }, 1000);
    }

    function resolveRound(room) {
        const [player1, player2] = room.players;
        const result = determineWinner(player1.choice, player2.choice);

        // Update scores
        if (result === 'player1') {
            player1.score++;
        } else if (result === 'player2') {
            player2.score++;
        }

        room.state = 'roundResult';

        // Send results to each player
        io.to(player1.socketId).emit('roundResult', {
            playerChoice: player1.choice,
            opponentChoice: player2.choice,
            winner: result === 'player1' ? 'player' : result === 'player2' ? 'opponent' : 'tie',
            playerScore: player1.score,
            opponentScore: player2.score,
            round: room.round
        });

        io.to(player2.socketId).emit('roundResult', {
            playerChoice: player2.choice,
            opponentChoice: player1.choice,
            winner: result === 'player2' ? 'player' : result === 'player1' ? 'opponent' : 'tie',
            playerScore: player2.score,
            opponentScore: player1.score,
            round: room.round
        });

        // Reset choices
        player1.choice = null;
        player2.choice = null;

        // Check if game is over
        if (player1.score >= 3 || player2.score >= 3) {
            setTimeout(() => {
                endGame(room);
            }, 3000);
        } else {
            // Next round
            setTimeout(() => {
                room.round++;
                startCountdown(room.id);
            }, 3000);
        }
    }

    async function endGame(room) {
        const [player1, player2] = room.players;
        room.state = 'gameOver';

        const winner = player1.score > player2.score ? 'player1' : 'player2';
        const winnerId = winner === 'player1' ? player1.userId : player2.userId;

        io.to(player1.socketId).emit('gameOver', {
            winner: winner === 'player1' ? 'player' : 'opponent',
            finalScore: {
                player: player1.score,
                opponent: player2.score
            }
        });

        io.to(player2.socketId).emit('gameOver', {
            winner: winner === 'player2' ? 'player' : 'opponent',
            finalScore: {
                player: player2.score,
                opponent: player1.score
            }
        });

        // Background persistence to Supabase
        try {
            // 1. Record the match
            const { error: matchError } = await supabase.from('matches').insert({
                player1_id: player1.userId,
                player2_id: player2.userId,
                winner_id: winnerId,
                p1_score: player1.score,
                p2_score: player2.score
            });

            if (matchError) throw matchError;

            // 2. Update profiles (Atomic increment)
            // Note: In Supabase/PostgREST we use .rpc() for true atomic increments 
            // but for this PoC we'll do a simple update or assume the user exists.

            const updateStats = async (userId, isWinner) => {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('total_wins, total_games')
                    .eq('id', userId)
                    .single();

                if (profile) {
                    await supabase.from('profiles').update({
                        total_wins: isWinner ? profile.total_wins + 1 : profile.total_wins,
                        total_games: profile.total_games + 1
                    }).eq('id', userId);
                } else {
                    // Create profile if doesn't exist
                    await supabase.from('profiles').insert({
                        id: userId,
                        total_wins: isWinner ? 1 : 0,
                        total_games: 1
                    });
                }
            };

            await updateStats(player1.userId, winner === 'player1');
            await updateStats(player2.userId, winner === 'player2');

            console.log('Match recorded successfully in Supabase');
        } catch (err) {
            console.error('Error recording match in Supabase:', err.message);
        }
    }

    httpServer
        .once('error', (err) => {
            console.error(err);
            process.exit(1);
        })
        .listen(port, () => {
            console.log(`> Ready on http://${hostname}:${port}`);
        });
});
