'use client';

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser, SignInButton, UserButton, SignedIn, SignedOut, useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import type { Choice, GameState, RoundResult, GameOverData } from '@/lib/types';

// Supabase Read-Only Client (Public ANON key)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CHOICE_EMOJIS = {
    rock: '✊',
    paper: '✋',
    scissors: '✌️'
};

// Helper for vibrant harmonic random colors
const getRandomColors = () => {
    const baseHue = Math.floor(Math.random() * 360);
    // Two hues that are close to each other for harmony
    const h1 = baseHue;
    const h2 = (baseHue + 40) % 360;

    const s1 = 60 + Math.floor(Math.random() * 20); // 60-80% saturation
    const l1 = 20 + Math.floor(Math.random() * 15); // 20-35% lightness

    const s2 = 50 + Math.floor(Math.random() * 20);
    const l2 = 15 + Math.floor(Math.random() * 15);

    return {
        c1: `hsl(${h1}, ${s1}%, ${l1}%)`,
        c2: `hsl(${h2}, ${s2}%, ${l2}%)`
    };
};

export default function Home() {
    const { user, isSignedIn } = useUser();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [gameState, setGameState] = useState<GameState>('lobby');
    const [countdown, setCountdown] = useState<number>(3);
    const [playerScore, setPlayerScore] = useState<number>(0);
    const [opponentScore, setOpponentScore] = useState<number>(0);
    const [round, setRound] = useState<number>(1);
    const [playerChoice, setPlayerChoice] = useState<Choice | null>(null);
    const [opponentChoice, setOpponentChoice] = useState<Choice | null>(null);
    const [roundWinner, setRoundWinner] = useState<'player' | 'opponent' | 'tie' | null>(null);
    const [gameWinner, setGameWinner] = useState<'player' | 'opponent' | null>(null);
    const [choiceMade, setChoiceMade] = useState<boolean>(false);
    const [showCollision, setShowCollision] = useState<boolean>(false);

    // Rematch states
    const [rematchRequested, setRematchRequested] = useState<boolean>(false);
    const [rematchStatus, setRematchStatus] = useState<string>('');

    // Leaderboard State
    const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
    const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);

    const fetchLeaderboard = async () => {
        setLoadingLeaderboard(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('total_wins', { ascending: false })
            .limit(10);

        if (!error && data) {
            setLeaderboardData(data);
        }
        setLoadingLeaderboard(false);
    };

    useEffect(() => {
        if (showLeaderboard) {
            fetchLeaderboard();
        }
    }, [showLeaderboard]);

    // Infinite Hue Cycle Background (60fps)
    const hueRef = useRef(Math.floor(Math.random() * 360));

    useEffect(() => {
        let frameId: number;

        const updateBackground = () => {
            // Increment hue slowly (speed: ~3 degrees per second)
            hueRef.current = (hueRef.current + 0.05) % 360;

            const h1 = hueRef.current;
            const h2 = (h1 + 60) % 360; // 60 deg offset for nice harmony

            const c1 = `hsl(${h1}, 65%, 20%)`;
            const c2 = `hsl(${h2}, 55%, 15%)`;

            document.documentElement.style.setProperty('--bg-1', c1);
            document.documentElement.style.setProperty('--bg-2', c2);

            frameId = requestAnimationFrame(updateBackground);
        };

        frameId = requestAnimationFrame(updateBackground);
        return () => cancelAnimationFrame(frameId);
    }, []);

    const { getToken, sessionId } = useAuth();

    useEffect(() => {
        if (!isSignedIn || !sessionId) return;

        let socketIo: Socket;

        const connectSocket = async () => {
            const token = await getToken();
            const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

            socketIo = io(socketUrl, {
                auth: { token, sessionId }
            });

            setSocket(socketIo);

            socketIo.on('waiting', () => {
                setGameState('waiting');
            });

            socketIo.on('matchFound', () => {
                setGameState('countdown');
                setPlayerScore(0);
                setOpponentScore(0);
                setRound(1);
                setRematchRequested(false);
                setRematchStatus('');
            });

            socketIo.on('countdown', (count: number) => {
                setCountdown(count);
                setGameState('countdown');
            });

            socketIo.on('roundStart', (roundNum: number) => {
                setRound(roundNum);
                setGameState('playing');
                setChoiceMade(false);
                setPlayerChoice(null);
                setOpponentChoice(null);
                setRoundWinner(null);
                setShowCollision(false);
            });

            socketIo.on('roundResult', (result: RoundResult) => {
                setPlayerChoice(result.playerChoice);
                setOpponentChoice(result.opponentChoice);
                setRoundWinner(result.winner);
                setPlayerScore(result.playerScore);
                setOpponentScore(result.opponentScore);
                setGameState('roundResult');

                // Trigger collision animation
                setShowCollision(true);
                setTimeout(() => setShowCollision(false), 600);
            });

            socketIo.on('gameOver', (data: GameOverData) => {
                setGameWinner(data.winner);
                setGameState('gameOver');
            });

            socketIo.on('rematchRequested', () => {
                setRematchStatus('Opponent wants a rematch!');
            });

            socketIo.on('rematchAccepted', () => {
                setRematchStatus('Rematch accepted! Starting new game...');
                setTimeout(() => {
                    setGameState('countdown');
                    setPlayerScore(0);
                    setOpponentScore(0);
                    setRound(1);
                    setPlayerChoice(null);
                    setOpponentChoice(null);
                    setRoundWinner(null);
                    setGameWinner(null);
                    setChoiceMade(false);
                    setRematchRequested(false);
                    setRematchStatus('');
                }, 2000);
            });

            socketIo.on('rematchDeclined', () => {
                setRematchStatus('Opponent declined the rematch');
                setTimeout(() => {
                    setGameState('lobby');
                }, 2000);
            });

            socketIo.on('opponentDisconnected', () => {
                alert('Opponent disconnected!');
                setGameState('lobby');
                setRematchRequested(false);
                setRematchStatus('');
            });
        };

        connectSocket();

        return () => {
            if (socketIo) socketIo.disconnect();
        };
    }, [isSignedIn, sessionId, getToken]);

    const handleFindMatch = () => {
        if (socket && isSignedIn) {
            socket.emit('findMatch');
        }
    };

    const handleChoice = (choice: Choice) => {
        if (socket && !choiceMade) {
            setChoiceMade(true);
            setPlayerChoice(choice);
            socket.emit('makeChoice', choice);
        }
    };

    const handleRequestRematch = () => {
        if (socket) {
            socket.emit('requestRematch');
            setRematchRequested(true);
            setRematchStatus('Waiting for opponent response...');
        }
    };

    const handleRematchResponse = (accepted: boolean) => {
        if (socket) {
            socket.emit('rematchResponse', accepted);
            if (accepted) {
                setRematchStatus('Rematch accepted! Starting new game...');
            } else {
                setRematchStatus('You declined the rematch');
                setTimeout(() => {
                    setGameState('lobby');
                }, 2000);
            }
        }
    };

    const handlePlayAgain = () => {
        setGameState('lobby');
        setPlayerScore(0);
        setOpponentScore(0);
        setRound(1);
        setPlayerChoice(null);
        setOpponentChoice(null);
        setRoundWinner(null);
        setGameWinner(null);
        setChoiceMade(false);
        setRematchRequested(false);
        setRematchStatus('');
    };

    return (
        <>
            <div className={`game-container ${(gameState === 'roundResult' && roundWinner === 'player') || (gameState === 'gameOver' && gameWinner === 'player')
                ? 'victory-reward' : ''
                } ${(gameState === 'roundResult' && roundWinner === 'opponent') || (gameState === 'gameOver' && gameWinner === 'opponent')
                    ? 'shake' : ''
                }`}>
                {/* Header with User Profile and Leaderboard Toggle */}
                <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000, display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <button
                        className="leaderboard-toggle"
                        onClick={() => setShowLeaderboard(true)}
                    >
                        🏆 Rankings
                    </button>
                    <SignedIn>
                        <UserButton afterSignOutUrl="/" />
                    </SignedIn>
                </div>

                {/* Leaderboard Overlay */}
                {showLeaderboard && (
                    <div className="leaderboard-overlay">
                        <div className="leaderboard-header">
                            <h2 className="leaderboard-title">HALL OF FAME</h2>
                            <button className="close-btn" onClick={() => setShowLeaderboard(false)}>&times;</button>
                        </div>
                        <div className="leaderboard-list">
                            {loadingLeaderboard ? (
                                <div style={{ textAlign: 'center', padding: '40px' }}>Loading legends...</div>
                            ) : leaderboardData.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', opacity: 0.5 }}>No legends yet. Start playing!</div>
                            ) : (
                                leaderboardData.map((player, index) => (
                                    <div key={player.id} className="leaderboard-item">
                                        <div className={`rank-badge ${index < 3 ? `rank-${index + 1}` : ''}`}>
                                            {index + 1}
                                        </div>
                                        <div className="player-info">
                                            <div className="player-name">{player.username || `Player ${player.id.substring(0, 5)}`}</div>
                                            <div className="player-stats">{player.total_games} games played</div>
                                        </div>
                                        <div className="win-count">{player.total_wins} W</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Score bars */}
                <div className="score-container">
                    {/* Left score bar (Player - Red) */}
                    <div className="score-bar left">
                        <div
                            className="score-fill red"
                            style={{ height: `${(playerScore / 3) * 100}%` }}
                        />
                    </div>

                    {/* Right score bar (Opponent - Blue) */}
                    <div className="score-bar right">
                        <div
                            className="score-fill blue"
                            style={{ height: `${(opponentScore / 3) * 100}%` }}
                        />
                    </div>

                    {/* Score icons */}
                    <div className="score-icon top-left" style={{ color: 'var(--score-blue)' }}>🔵</div>
                    <div className="score-icon bottom-left" style={{ color: 'var(--score-red)' }}>🔴</div>
                    <div className="score-icon top-right" style={{ color: 'var(--score-blue)' }}>🔵</div>
                    <div className="score-icon bottom-right" style={{ color: 'var(--score-orange)' }}>🟠</div>
                </div>

                {/* Hands visual with collision animation */}
                {(gameState === 'countdown' || gameState === 'playing' || gameState === 'roundResult') && (
                    <div className="hands-container">
                        <div className={`hand top ${showCollision ? 'collide-top' : ''}`}>
                            {gameState === 'roundResult' && opponentChoice ? CHOICE_EMOJIS[opponentChoice] : '✊'}
                        </div>
                        <div className={`hand bottom ${showCollision ? 'collide-bottom' : ''}`}>
                            {gameState === 'roundResult' && playerChoice ? CHOICE_EMOJIS[playerChoice] : '✊'}
                        </div>
                    </div>
                )}

                {/* Timer */}
                {(gameState === 'playing' || gameState === 'roundResult') && (
                    <div className="timer">
                        {gameState === 'playing' ? `0:${String(round).padStart(2, '0')}` : `Score: ${playerScore}-${opponentScore}`}
                    </div>
                )}

                {/* Center content */}
                <div className="center-content">
                    {gameState === 'lobby' && (
                        <div style={{ textAlign: 'center' }}>
                            <h1 className="game-title" style={{ marginBottom: '40px' }}>
                                ROCK<br />PAPER<br />SCISSORS
                            </h1>

                            <SignedOut>
                                <SignInButton mode="modal">
                                    <button className="btn-primary">
                                        START
                                    </button>
                                </SignInButton>
                                <p style={{ marginTop: '15px', opacity: 0.6, fontSize: '0.9rem' }}>
                                    Sign in required to play
                                </p>
                            </SignedOut>

                            <SignedIn>
                                <button className="btn-primary" onClick={handleFindMatch}>
                                    START
                                </button>
                                <p style={{ marginTop: '15px', opacity: 0.8, fontSize: '1rem', fontWeight: 700 }}>
                                    Welcome, {user?.firstName || 'Player'}!
                                </p>
                            </SignedIn>
                        </div>
                    )}

                    {gameState === 'waiting' && (
                        <div>
                            <h1 className="game-title waiting-dots" style={{ marginBottom: '20px' }}>
                                ROCK<br />PAPER<br />SCISSORS
                            </h1>
                            <p style={{ fontSize: '1.2rem', opacity: 0.8, textAlign: 'center' }}>
                                Searching for opponent<span className="waiting-dots"></span>
                            </p>
                        </div>
                    )}

                    {gameState === 'countdown' && (
                        <div className="countdown">{countdown}</div>
                    )}

                    {gameState === 'playing' && (
                        <h1 className="game-subtitle">FIGHT</h1>
                    )}

                    {gameState === 'roundResult' && (
                        <div>
                            <div className="result-display">
                                <div className="result-choice">
                                    <div className="result-emoji">{playerChoice && CHOICE_EMOJIS[playerChoice]}</div>
                                    <div className="result-label">You</div>
                                </div>
                                <div className="vs-text">VS</div>
                                <div className="result-choice">
                                    <div className="result-emoji">{opponentChoice && CHOICE_EMOJIS[opponentChoice]}</div>
                                    <div className="result-label">Opponent</div>
                                </div>
                            </div>
                            <div className={`result-message ${roundWinner === 'player' ? 'win' : roundWinner === 'opponent' ? 'lose' : 'tie'}`}>
                                {roundWinner === 'player' ? '🎉 You Won!' : roundWinner === 'opponent' ? '😢 You Lost' : '🤝 Tie!'}
                            </div>
                        </div>
                    )}

                    {gameState === 'gameOver' && (
                        <div style={{ textAlign: 'center' }}>
                            <h1 className="game-title" style={{ marginBottom: '30px' }}>
                                {gameWinner === 'player' ? '🏆 VICTORY!' : '💔 DEFEAT'}
                            </h1>
                            <div style={{ fontSize: '2rem', marginBottom: '30px' }}>
                                Final Score: {playerScore} - {opponentScore}
                            </div>

                            {/* Rematch System */}
                            {/* Rematch System */}
                            {rematchStatus === 'Opponent wants a rematch!' ? (
                                <div className="rematch-container">
                                    <div className="rematch-status">{rematchStatus}</div>
                                    <div className="rematch-buttons">
                                        <button className="btn-small accept" onClick={() => handleRematchResponse(true)}>
                                            ✓ Accept Rematch
                                        </button>
                                        <button className="btn-small decline" onClick={() => handleRematchResponse(false)}>
                                            🏠 Find New Match
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="rematch-container">
                                    {rematchRequested ? (
                                        <div className="rematch-status">Waiting for opponent response...</div>
                                    ) : (
                                        <>
                                            <div className="rematch-message">Play this opponent again?</div>
                                            <div className="rematch-buttons">
                                                <button className="btn-small accept" onClick={handleRequestRematch}>
                                                    🔁 Request Rematch
                                                </button>
                                                <button className="btn-small" onClick={handlePlayAgain}>
                                                    🏠 Find New Match
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Choice buttons */}
                {(gameState === 'playing' || gameState === 'roundResult') && (
                    <div className="choice-buttons">
                        <button
                            className="choice-btn"
                            onClick={() => handleChoice('rock')}
                            disabled={choiceMade || gameState === 'roundResult'}
                            title="Rock"
                        >
                            ✊
                        </button>
                        <button
                            className="choice-btn"
                            onClick={() => handleChoice('paper')}
                            disabled={choiceMade || gameState === 'roundResult'}
                            title="Paper"
                        >
                            ✋
                        </button>
                        <button
                            className="choice-btn"
                            onClick={() => handleChoice('scissors')}
                            disabled={choiceMade || gameState === 'roundResult'}
                            title="Scissors"
                        >
                            ✌️
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
