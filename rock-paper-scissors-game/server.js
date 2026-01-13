const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Game state
const waitingPlayers = [];
const activeRooms = new Map();

// Helper functions
function createPlayer(socketId) {
    return {
        id: Math.random().toString(36).substring(7),
        socketId,
        score: 0,
        choice: null,
        ready: true
    };
}

function createRoom(player1, player2) {
    const roomId = Math.random().toString(36).substring(7);
    return {
        id: roomId,
        players: [player1, player2],
        round: 1,
        state: 'countdown',
        countdown: 3,
        winner: null
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
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        console.log('Player connected:', socket.id);

        socket.on('findMatch', () => {
            console.log('Player looking for match:', socket.id);

            // Check if player is already waiting
            if (waitingPlayers.some(p => p.socketId === socket.id)) {
                return;
            }

            const player = createPlayer(socket.id);

            // If someone is waiting, match them
            if (waitingPlayers.length > 0) {
                const opponent = waitingPlayers.shift();
                const room = createRoom(player, opponent);

                activeRooms.set(socket.id, room);
                activeRooms.set(opponent.socketId, room);

                // Join socket room
                socket.join(room.id);
                io.sockets.sockets.get(opponent.socketId)?.join(room.id);

                // Notify both players
                socket.emit('matchFound', {
                    roomId: room.id,
                    playerIndex: 0,
                    opponentId: opponent.id
                });

                io.to(opponent.socketId).emit('matchFound', {
                    roomId: room.id,
                    playerIndex: 1,
                    opponentId: player.id
                });

                // Start countdown after 1 second
                setTimeout(() => {
                    startCountdown(room.id);
                }, 1000);

            } else {
                // Add to waiting queue
                waitingPlayers.push(player);
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

        socket.on('disconnect', () => {
            console.log('Player disconnected:', socket.id);

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

    function endGame(room) {
        const [player1, player2] = room.players;
        room.state = 'gameOver';

        io.to(player1.socketId).emit('gameOver', {
            winner: player1.score > player2.score ? 'player' : 'opponent',
            finalScore: {
                player: player1.score,
                opponent: player2.score
            }
        });

        io.to(player2.socketId).emit('gameOver', {
            winner: player2.score > player1.score ? 'player' : 'opponent',
            finalScore: {
                player: player2.score,
                opponent: player1.score
            }
        });

        // Clean up
        activeRooms.delete(player1.socketId);
        activeRooms.delete(player2.socketId);
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
