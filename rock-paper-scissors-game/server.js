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
const port = process.env.PORT || 3000;

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Game state
const waitingPlayers = {
    10: [],
    100: [],
    500: [],
    1000: []
};

const RANK_CONFIG = {
    'BRONCE': { min: 0, max: 100, stake: 1 },
    'PLATA': { min: 101, max: 300, stake: 2 },
    'ORO': { min: 301, max: 600, stake: 5 },
    'PLATINO': { min: 601, max: 1000, stake: 10 },
    'DIAMANTE': { min: 1001, max: 2000, stake: 25 },
    'LEYENDA': { min: 2001, max: 999999, stake: 50 }
};

const waitingRanked = {
    'BRONCE': [],
    'PLATA': [],
    'ORO': [],
    'PLATINO': [],
    'DIAMANTE': [],
    'LEYENDA': []
};
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

function getRankByRp(rp) {
    for (const [rank, config] of Object.entries(RANK_CONFIG)) {
        if (rp >= config.min && rp <= config.max) return rank;
    }
    return 'BRONCE';
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

        socket.on('purchase', async (data) => {
            const { type, amount } = data;
            const userId = socket.userId;
            console.log('[SERVER_ECONOMY] Purchase request:', { userId, type, amount });

            try {
                // Get current balance FIRST to ensure consistency
                const { data: profile, error: fetchError } = await supabase
                    .from('profiles')
                    .select('coins, gems')
                    .eq('id', userId)
                    .single();

                if (fetchError) {
                    console.error('[SERVER_DB] Fetch balance error:', fetchError.message);
                    socket.emit('purchaseError', 'User profile not found');
                    return;
                }

                const currentAmount = type === 'coins' ? (profile.coins || 0) : (profile.gems || 0);
                const newValue = parseInt(currentAmount) + parseInt(amount);

                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({ [type]: newValue })
                    .eq('id', userId);

                if (updateError) {
                    console.error('[SERVER_DB] Update balance error:', updateError.message);
                    socket.emit('purchaseError', updateError.message);
                } else {
                    console.log(`[SERVER_ECONOMY] SUCCESS: Purchased ${amount} ${type} for ${userId}. New total: ${newValue}`);
                    socket.emit('purchaseSuccess', { type, newValue });
                }
            } catch (err) {
                console.error('[SERVER_DB] Purchase exception:', err.message);
                socket.emit('purchaseError', 'Internal Economy Error');
            }
        });

        socket.on('findMatch', async (data) => {
            const userId = socket.userId;
            const imageUrl = data?.imageUrl;
            const mode = data?.mode || 'casual';
            const stakeTier = data?.stakeTier || 10;

            console.log('[SERVER_GAME] findMatch request:', { userId, mode, stakeTier });

            // 1. Fetch Profile for validation
            let profile;
            try {
                const { data: p, error } = await supabase.from('profiles').select('coins, gems, rp').eq('id', userId).single();
                if (error) throw error;
                profile = p;
            } catch (err) {
                console.error('[SERVER_GAME] Profile fetch error:', err.message);
                socket.emit('matchError', 'Error al cargar perfil.');
                return;
            }

            // 2. Resource Validation
            let currentStake = stakeTier;
            let currentRank = null;

            if (mode === 'casual') {
                if (profile.coins < stakeTier) {
                    socket.emit('matchError', 'No tienes suficientes monedas para esta Arena.');
                    return;
                }
            } else {
                currentRank = getRankByRp(profile.rp || 0);
                currentStake = RANK_CONFIG[currentRank].stake;
                if (profile.gems < currentStake) {
                    socket.emit('matchError', `Necesitas ${currentStake} gemas para jugar en el rango ${currentRank}.`);
                    return;
                }
            }

            // 3. Clear Stale Rooms
            if (activeRooms.has(socket.id)) {
                const room = activeRooms.get(socket.id);
                if (room.state === 'gameOver') {
                    const opponent = room.players.find(p => p.socketId !== socket.id);
                    if (opponent) {
                        io.to(opponent.socketId).emit('opponentLeft');
                        activeRooms.delete(opponent.socketId);
                    }
                    activeRooms.delete(socket.id);
                }
            }

            // 4. Prevent duplicate queue
            const isWaiting = (Object.values(waitingPlayers).flat().some(p => p.userId === userId)) ||
                (Object.values(waitingRanked).flat().some(p => p.userId === userId));
            if (isWaiting) {
                console.warn('[SERVER_GAME] Player already in queue:', userId);
                return;
            }

            const player = createPlayer(socket.id, userId, imageUrl);
            player.mode = mode;
            player.stakeTier = currentStake;
            player.rank = currentRank;

            // 5. Matchmaking logic
            const queueMap = mode === 'casual' ? waitingPlayers : waitingRanked;
            const queueKey = mode === 'casual' ? currentStake : currentRank;

            if (queueMap[queueKey] && queueMap[queueKey].length > 0) {
                const opponent = queueMap[queueKey].shift();
                console.log(`[SERVER_GAME] MATCH FOUND: ${mode} mode (${queueKey})!`);

                const room = createRoom(player, opponent);
                room.mode = mode;
                room.stakeTier = currentStake;
                room.rank = currentRank;

                activeRooms.set(socket.id, room);
                activeRooms.set(opponent.socketId, room);
                socket.join(room.id);
                io.sockets.sockets.get(opponent.socketId)?.join(room.id);

                // DEDUCT ENTRY FEES
                const currency = mode === 'casual' ? 'coins' : 'gems';
                const deductEntry = async (uId) => {
                    try {
                        const { data: p } = await supabase.from('profiles').select(currency).eq('id', uId).single();
                        if (p) {
                            await supabase.from('profiles').update({ [currency]: p[currency] - currentStake }).eq('id', uId);
                        }
                    } catch (e) { console.error('[SERVER_ECONOMY] Deduction failed:', e.message); }
                };
                await deductEntry(player.userId);
                await deductEntry(opponent.userId);

                // Notify both players
                socket.emit('matchFound', {
                    roomId: room.id,
                    playerIndex: 0,
                    opponentId: opponent.id,
                    opponentImageUrl: opponent.imageUrl || null,
                    stakeTier: currentStake,
                    mode: mode,
                    rank: currentRank
                });

                io.to(opponent.socketId).emit('matchFound', {
                    roomId: room.id,
                    playerIndex: 1,
                    opponentId: player.id,
                    opponentImageUrl: player.imageUrl || null,
                    stakeTier: currentStake,
                    mode: mode,
                    rank: currentRank
                });

                setTimeout(() => { startCountdown(room.id); }, 1000);
            } else {
                if (!queueMap[queueKey]) queueMap[queueKey] = [];
                queueMap[queueKey].push(player);
                console.log(`[SERVER_GAME] Added to ${mode} queue (${queueKey}). Size:`, queueMap[queueKey].length);
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

            // Remove from waiting queue (Casual)
            Object.values(waitingPlayers).forEach(queue => {
                const index = queue.findIndex(p => p.socketId === socket.id);
                if (index !== -1) {
                    queue.splice(index, 1);
                    console.log('[SERVER_GAME] Removed from Casual queue:', socket.id);
                }
            });

            // Remove from waiting queue (Ranked)
            Object.values(waitingRanked).forEach(queue => {
                const index = queue.findIndex(p => p.socketId === socket.id);
                if (index !== -1) {
                    queue.splice(index, 1);
                    console.log('[SERVER_GAME] Removed from Ranked queue:', socket.id);
                }
            });

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
                activeRooms.delete(socket.id);
            }
        });

        socket.on('leaveQueue', () => {
            console.log('[SERVER_GAME] leaveQueue request from:', socket.id);

            // Remove from Casual queue
            Object.values(waitingPlayers).forEach(queue => {
                const index = queue.findIndex(p => p.socketId === socket.id);
                if (index !== -1) {
                    queue.splice(index, 1);
                    console.log('[SERVER_GAME] User left Casual queue');
                }
            });

            // Remove from Ranked queue
            Object.values(waitingRanked).forEach(queue => {
                const index = queue.findIndex(p => p.socketId === socket.id);
                if (index !== -1) {
                    queue.splice(index, 1);
                    console.log('[SERVER_GAME] User left Ranked queue');
                }
            });

            // Confirm to client
            socket.emit('queueLeft');
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

        // PRE-CALCULATE UPDATES & PERSIST
        const getUpdateData = async (player, isWinner) => {
            let resultData = { rpChange: 0, newRp: 0, newRank: 'BRONCE', prize: 0 };
            try {
                const { data: profile } = await supabase.from('profiles').select('*').eq('id', player.userId).single();
                if (!profile) return resultData;

                let updates = {
                    total_wins: isWinner ? (profile.total_wins || 0) + 1 : (profile.total_wins || 0),
                    total_games: (profile.total_games || 0) + 1
                };

                // Handle Ranked Mode
                if (room.mode === 'ranked') {
                    const rpChange = isWinner ? 20 : -15;
                    const newRp = Math.max(0, (profile.rp || 0) + rpChange);
                    const newRank = getRankByRp(newRp);

                    updates.rp = newRp;
                    updates.rank_name = newRank;
                    resultData.rpChange = rpChange;
                    resultData.newRp = newRp;
                    resultData.newRank = newRank;

                    if (isWinner) {
                        const prize = room.stakeTier * 2;
                        updates.gems = (profile.gems || 0) + prize;
                        resultData.prize = prize;
                    }
                }
                // Handle Casual Mode
                else if (isWinner && room.stakeTier) {
                    const prize = room.stakeTier * 2;
                    updates.coins = (profile.coins || 0) + prize;
                    resultData.prize = prize;
                }

                await supabase.from('profiles').update(updates).eq('id', player.userId);
                return resultData;
            } catch (e) {
                console.error('[SERVER_GAME] Profile update failed:', e.message);
                return resultData;
            }
        };

        const p1Data = await getUpdateData(player1, winner === 'player1');
        const p2Data = await getUpdateData(player2, winner === 'player2');

        // RECORD MATCH
        try {
            await supabase.from('matches').insert({
                player1_id: player1.userId,
                player2_id: player2.userId,
                winner_id: winnerId,
                p1_score: player1.score,
                p2_score: player2.score,
                mode: room.mode || 'casual',
                stake: room.stakeTier || 0
            });
            console.log('Match recorded successfully in Supabase');
        } catch (err) {
            console.error('Error recording match in Supabase:', err.message);
        }

        // EMIT EVENTS WITH DATA
        io.to(player1.socketId).emit('gameOver', {
            winner: winner === 'player1' ? 'player' : 'opponent',
            finalScore: { player: player1.score, opponent: player2.score },
            rpChange: p1Data.rpChange,
            newRp: p1Data.newRp,
            newRank: p1Data.newRank,
            prize: p1Data.prize,
            mode: room.mode
        });

        io.to(player2.socketId).emit('gameOver', {
            winner: winner === 'player2' ? 'player' : 'opponent',
            finalScore: { player: player2.score, opponent: player1.score },
            rpChange: p2Data.rpChange,
            newRp: p2Data.newRp,
            newRank: p2Data.newRank,
            prize: p2Data.prize,
            mode: room.mode
        });
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
