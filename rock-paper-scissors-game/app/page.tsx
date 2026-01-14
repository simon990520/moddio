'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Choice, GameState, RoundResult, GameOverData } from '@/lib/types';

const CHOICE_EMOJIS = {
    rock: '✊',
    paper: '✋',
    scissors: '✌️'
};

export default function Home() {
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

    useEffect(() => {
        const socketIo = io('http://localhost:3000');
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

        return () => {
            socketIo.disconnect();
        };
    }, []);

    const handleFindMatch = () => {
        if (socket) {
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
        <div className="game-container">
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
                        <button className="btn-primary" onClick={handleFindMatch}>
                            START
                        </button>
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
                        {rematchStatus ? (
                            <div className="rematch-container">
                                <div className="rematch-status">{rematchStatus}</div>
                                {rematchStatus === 'Opponent wants a rematch!' && (
                                    <div className="rematch-buttons">
                                        <button className="btn-small accept" onClick={() => handleRematchResponse(true)}>
                                            ✓ Accept
                                        </button>
                                        <button className="btn-small decline" onClick={() => handleRematchResponse(false)}>
                                            ✗ Decline
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="rematch-container">
                                {!rematchRequested ? (
                                    <>
                                        <div className="rematch-message">Want to play again with the same opponent?</div>
                                        <div className="rematch-buttons">
                                            <button className="btn-small accept" onClick={handleRequestRematch}>
                                                🔁 Request Rematch
                                            </button>
                                            <button className="btn-small" onClick={handlePlayAgain}>
                                                🏠 Find New Match
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="rematch-status">Waiting for opponent response...</div>
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
    );
}
