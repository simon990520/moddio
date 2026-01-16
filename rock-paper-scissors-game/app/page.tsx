'use client';

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser, SignInButton, UserButton, SignedIn, SignedOut, useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import confetti from 'canvas-confetti';
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
    const [choiceMade, setChoiceMade] = useState(false);
    const [opponentImageUrl, setOpponentImageUrl] = useState<string | null>(null);
    const [showCollision, setShowCollision] = useState<boolean>(false);

    // Rematch states
    const [rematchRequested, setRematchRequested] = useState<boolean>(false);
    const [rematchStatus, setRematchStatus] = useState<string>('');

    // Economy State
    const [coins, setCoins] = useState<number>(0);
    const [gems, setGems] = useState<number>(0);
    const [showCoinShop, setShowCoinShop] = useState<boolean>(false);
    const [showGemShop, setShowGemShop] = useState<boolean>(false);

    // Audio & Music State
    // Audio & Music State
    const musicRef = useRef<HTMLAudioElement | null>(null);
    const musicVolumeRef = useRef<number>(0.5);
    const sfxVolumeRef = useRef<number>(0.7);
    const announcerVolumeRef = useRef<number>(0.8);
    const isMutedRef = useRef<boolean>(false);

    // Onboarding State
    const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
    const [username, setUsername] = useState('');
    const [birthDate, setBirthDate] = useState('');

    // Leaderboard State
    const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
    const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
    const [timeFilter, setTimeFilter] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
    const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);

    // Audio State
    const [isMuted, setIsMuted] = useState<boolean>(false);
    const [musicVolume, setMusicVolume] = useState<number>(0.5);
    const [sfxVolume, setSfxVolume] = useState<number>(0.7);
    const [announcerVolume, setAnnouncerVolume] = useState<number>(0.8);
    const [showSettings, setShowSettings] = useState<boolean>(false);

    // Audio Persistence: Load on mount
    useEffect(() => {
        const savedMusicVol = localStorage.getItem('musicVolume');
        const savedSfxVol = localStorage.getItem('sfxVolume');
        const savedAnnouncerVol = localStorage.getItem('announcerVolume');
        const savedMute = localStorage.getItem('isMuted');

        if (savedMusicVol !== null) setMusicVolume(parseFloat(savedMusicVol));
        if (savedSfxVol !== null) setSfxVolume(parseFloat(savedSfxVol));
        if (savedAnnouncerVol !== null) setAnnouncerVolume(parseFloat(savedAnnouncerVol));
        if (savedMute !== null) setIsMuted(savedMute === 'true');
    }, []);

    // Audio Persistence: Save on change
    useEffect(() => {
        localStorage.setItem('musicVolume', musicVolume.toString());
        localStorage.setItem('sfxVolume', sfxVolume.toString());
        localStorage.setItem('announcerVolume', announcerVolume.toString());
        localStorage.setItem('isMuted', isMuted.toString());
    }, [musicVolume, sfxVolume, announcerVolume, isMuted]);

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

    // Sync volume refs with state to avoid stale closures in socket listeners
    useEffect(() => {
        musicVolumeRef.current = musicVolume;
        sfxVolumeRef.current = sfxVolume;
        announcerVolumeRef.current = announcerVolume;
        isMutedRef.current = isMuted;
    }, [musicVolume, sfxVolume, announcerVolume, isMuted]);

    // Centralized Audio Manager
    const playSound = (soundPath: string, volumeOverride?: number) => {
        if (isMutedRef.current) return;
        try {
            const audio = new Audio(soundPath);

            // Handle volume by category
            let baseVolume = sfxVolumeRef.current;
            if (soundPath.includes('/voices/announcer/')) {
                baseVolume = announcerVolumeRef.current;
            }

            audio.volume = volumeOverride !== undefined ? volumeOverride : baseVolume;
            audio.play().catch(err => console.warn('[AUDIO] Play failed:', err));
        } catch (error) {
            console.error('[AUDIO] Error playing sound:', error);
        }
    };

    const playMusic = (soundPath: string, loop: boolean = true) => {
        if (isMutedRef.current) return;
        try {
            const audio = new Audio(soundPath);
            audio.volume = musicVolumeRef.current * 0.6; // Background music at 60% of music volume
            audio.loop = loop;
            audio.play().catch(err => console.warn('[AUDIO] Music play failed:', err));
            return audio;
        } catch (error) {
            console.error('[AUDIO] Error playing music:', error);
            return null;
        }
    };

    // Dedicated Music Volume Sync (Ensures real-time sliding works)
    useEffect(() => {
        if (musicRef.current) {
            if (isMuted) {
                musicRef.current.volume = 0;
            } else {
                musicRef.current.volume = musicVolume * 0.4;
            }
        }
    }, [musicVolume, isMuted]);

    // Background Music Controller
    useEffect(() => {
        if (isMuted) {
            if (musicRef.current) {
                musicRef.current.pause();
                musicRef.current = null;
            }
            return;
        }

        const playTheme = (path: string) => {
            // Check if we are already trying to play this exact file
            const currentSrc = musicRef.current?.src || '';
            if (currentSrc.includes(path)) {
                // UPDATE VOLUME REAL-TIME if same file
                if (musicRef.current) {
                    musicRef.current.volume = isMutedRef.current ? 0 : musicVolumeRef.current * 0.4;
                    // If it's already the current ref but it's paused (due to autoplay block), try playing again
                    if (musicRef.current.paused) {
                        musicRef.current.play().catch(() => { });
                    }
                }
                return;
            }

            if (musicRef.current) {
                musicRef.current.pause();
            }

            const audio = new Audio(path);
            audio.volume = musicVolumeRef.current * 0.4;
            audio.loop = true;

            const startAttempt = () => {
                audio.play().catch(e => {
                    console.warn('[AUDIO] Autoplay standby for:', path);
                    // Global interaction listener to unlock ANY audio context including battle_theme
                    const unlock = () => {
                        audio.play().catch(() => { });
                        window.removeEventListener('mousedown', unlock);
                        window.removeEventListener('touchstart', unlock);
                        window.removeEventListener('click', unlock);
                    };
                    window.addEventListener('mousedown', unlock);
                    window.addEventListener('touchstart', unlock);
                    window.addEventListener('click', unlock);
                });
            };

            startAttempt();
            musicRef.current = audio;
        };

        if (gameState === 'lobby') {
            playTheme('/sounds/music/battle_theme.mp3');
        } else if (gameState === 'waiting') {
            playTheme('/sounds/music/menu_theme.mp3');
        } else if (gameState === 'countdown' || gameState === 'playing' || gameState === 'roundResult' || gameState === 'gameOver') {
            playTheme('/sounds/music/battle_theme.mp3');
        }
    }, [gameState, isMuted, musicVolume]);

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

    // Check Profile on Load
    useEffect(() => {
        if (!isSignedIn || !user) return;

        const checkProfile = async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            // If profile missing or incomplete (no username or birth_date)
            if (error || !data || !data.username || !data.birth_date) {
                setShowOnboarding(true);
                if (data?.username) setUsername(data.username);
                // Don't set birthDate if it's null
            }

            // Always update coins/gems if data exists
            if (data) {
                setCoins(data.coins || 0);
                setGems(data.gems || 0);
            }
        };

        checkProfile();
    }, [isSignedIn, user]);

    const handleSaveProfile = () => {
        if (!username.trim() || !birthDate) {
            alert('Please fill in all fields');
            return;
        }
        if (socket) {
            socket.emit('updateProfile', { username, birthDate });
        }
    };

    const handlePurchase = async (type: 'coins' | 'gems', amount: number) => {
        if (!isSignedIn || !user) {
            console.error('[ECONOMY] Purchase failed: User not signed in');
            return;
        }

        playSound('/sounds/sfx/click.mp3');

        // Functional updates to avoid stale state issues
        let currentVal = type === 'coins' ? coins : gems;
        const newValue = currentVal + amount;

        console.log(`[ECONOMY] Attempting to update ${type}: ${currentVal} -> ${newValue}`);

        const { error } = await supabase
            .from('profiles')
            .update({ [type]: newValue })
            .eq('id', user.id);

        if (!error) {
            if (type === 'coins') setCoins(newValue);
            else setGems(newValue);
            console.log(`[ECONOMY] SUCCESS: Purchased ${amount} ${type}. New total: ${newValue}`);
        } else {
            console.error('[ECONOMY] DB UPDATE FAILED:', error);
            alert(`Error updating balance: ${error.message}. Did you run the migration_economy.sql script?`);
        }
    };

    useEffect(() => {
        if (!isSignedIn || !sessionId) return;

        let socketIo: Socket;

        const connectSocket = async () => {
            const token = await getToken();
            console.log('[SOCKET_INFO] Initializing connection...', { hasToken: !!token, sessionId });

            // Dynamically determine the socket URL (defaults to current origin for ngrok/production)
            const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
            console.log('[SOCKET_INFO] Socket URL:', socketUrl);

            socketIo = io(socketUrl, {
                auth: { token, sessionId }
            });

            setSocket(socketIo);

            socketIo.on('connect', () => {
                console.log('%c[SOCKET_INFO] CONNECTED SUCCESSFULLY!', 'color: #00ff00; font-weight: bold;');
                console.log('%c[TIP] To hide noisy extension messages, type "-content.js" in the console Filter box.', 'color: #888; font-style: italic;');
            });

            socketIo.on('disconnect', (reason) => {
                console.warn('[SOCKET_INFO] Disconnected:', reason);
            });

            socketIo.on('connect_error', async (error) => {
                console.error('%c[SOCKET_INFO] CONNECTION ERROR:', 'color: #ff0000; font-weight: bold;', error.message);

                if (error.message === 'Authentication error' || error.message === 'Invalid token') {
                    console.log('[SOCKET_INFO] Retrying with fresh token...');
                    const newToken = await getToken();
                    socketIo.auth = { token: newToken, sessionId };
                    socketIo.connect();
                }
            });

            socketIo.on('waiting', () => {
                console.log('[GAME_STATUS] Waiting in queue...');
                setGameState('waiting');
            });

            socketIo.on('matchFound', (data: { opponentImageUrl?: string }) => {
                console.log('[GAME_STATUS] Match found! Data:', data);
                setGameState('countdown');
                setPlayerScore(0);
                setOpponentScore(0);
                setRound(1);
                setRematchRequested(false);
                setRematchStatus('');
                if (data?.opponentImageUrl) {
                    console.log('[AVATAR] Setting opponent image:', data.opponentImageUrl);
                    setOpponentImageUrl(data.opponentImageUrl);
                } else {
                    console.warn('[AVATAR] No opponent image received, using fallback');
                    setOpponentImageUrl(null);
                }
            });

            socketIo.on('countdown', (count: number) => {
                setCountdown(count);
                setGameState('countdown');
                if (count === 3) {
                    playSound('/sounds/sfx/countdown.mp3');
                }
            });

            socketIo.on('roundStart', (roundNum: number) => {
                setRound(roundNum);
                setGameState('playing');
                setChoiceMade(false);
                setPlayerChoice(null);
                setOpponentChoice(null);
                setRoundWinner(null);
                setShowCollision(false);
                playSound('/sounds/sfx/fight.mp3');
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

                // Play collision sound
                playSound('/sounds/sfx/collision.mp3');

                // Play result sound based on winner
                setTimeout(() => {
                    if (result.winner === 'player') {
                        playSound('/sounds/sfx/win_round.mp3');
                    } else if (result.winner === 'opponent') {
                        playSound('/sounds/sfx/lose_round.mp3');
                    } else {
                        playSound('/sounds/sfx/tie.mp3');
                    }
                }, 400); // Reduced delay since announcer voices are now earlier
            });

            socketIo.on('gameOver', (data: GameOverData) => {
                setGameWinner(data.winner);
                setGameState('gameOver');

                // Play final game voice
                setTimeout(() => {
                    if (data.winner === 'player') {
                        playSound('/sounds/voices/announcer/win_game.mp3');
                    } else {
                        playSound('/sounds/voices/announcer/lose_game.mp3');
                    }
                }, 500);
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

            socketIo.on('profileUpdated', () => {
                setShowOnboarding(false);
                // Trigger Confetti Celebration
                const duration = 3000;
                const end = Date.now() + duration;

                const frame = () => {
                    confetti({
                        particleCount: 5,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0 },
                        colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00']
                    });
                    confetti({
                        particleCount: 5,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1 },
                        colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00']
                    });

                    if (Date.now() < end) {
                        requestAnimationFrame(frame);
                    }
                };
                frame();
            });

            socketIo.on('profileUpdateError', (msg: string) => {
                alert('Error updating profile: ' + msg);
            });

            socketIo.on('opponentDisconnected', () => {
                console.warn('[GAME_STATUS] Opponent disconnected mid-game');
                setGameState('gameOver');
                setRematchStatus('Opponent disconnected!');
                setRematchRequested(false);
            });

            socketIo.on('opponentLeft', () => {
                setRematchStatus('Opponent left for a new game.');
                setRematchRequested(false);
            });
        };

        connectSocket();

        return () => {
            if (socketIo) socketIo.disconnect();
        };
    }, [isSignedIn, sessionId, getToken]);

    const handleFindMatch = () => {
        console.log('[GAME_ACTION] Start button clicked');
        if (!isSignedIn) {
            console.warn('[GAME_ACTION] User not signed in');
            return;
        }
        if (!socket) {
            console.error('[GAME_ACTION] Socket not initialized');
            return;
        }
        if (!socket.connected) {
            console.error('[GAME_ACTION] Socket disconnected');
            return;
        }

        // Leaderboard access moved to Settings or Side Button? User asked to remove it from header.
        // I will keep Rankings button as a small side button or move it inside the modal?
        // Let's move it to a floating button on the left or keep it in header.
        // User didn't specify what to do with Rankings but gave a new order.
        // I will add another button for Rankings elsewhere if needed, or put it in the modal.

        console.log('[GAME_ACTION] Emitting findMatch...');
        console.log('[DEBUG_AVATAR] Full user object:', user);
        console.log('[DEBUG_AVATAR] user.imageUrl:', user?.imageUrl);
        console.log('[DEBUG_AVATAR] Sending imageUrl to server:', user?.imageUrl || 'UNDEFINED/NULL');
        playSound('/sounds/sfx/click.mp3');
        socket.emit('findMatch', { imageUrl: user?.imageUrl });
    };

    const handleChoice = (choice: Choice) => {
        if (socket && !choiceMade) {
            setChoiceMade(true);
            setPlayerChoice(choice);
            playSound('/sounds/sfx/click.mp3');
            playSound(`/sounds/voices/announcer/${choice}.mp3`);
            socket.emit('makeChoice', choice);
        }
    };

    const handleRequestRematch = () => {
        if (socket) {
            playSound('/sounds/sfx/click.mp3');
            socket.emit('requestRematch');
            setRematchRequested(true);
            setRematchStatus('Waiting for opponent response...');
        }
    };

    const handleRematchResponse = (accepted: boolean) => {
        if (socket) {
            playSound('/sounds/sfx/click.mp3');
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
        setGameState('waiting');
        setPlayerScore(0);
        setOpponentScore(0);
        setRound(1);
        setPlayerChoice(null);
        setOpponentChoice(null);
        setRoundWinner(null);
        setGameWinner(null);
        setChoiceMade(false);
        setOpponentImageUrl(null);
        setRematchRequested(false);
        setRematchStatus('');

        // Directly enter queue
        handleFindMatch();
    };

    return (
        <>
            {/* Header with User Profile, Economy and Settings - Outside Shake Container */}
            <div className="main-header">
                {/* Settings Toggle (Leftmost) */}
                <button
                    className="icon-btn settings-btn"
                    onClick={() => setShowSettings(true)}
                    title="Settings"
                >
                    ⚙️
                </button>

                {/* Gems (Visual Only) */}
                <div
                    className="economy-item gem interactive"
                    onClick={() => setShowGemShop(true)}
                    title="Open Gem Shop"
                >
                    <span className="economy-icon">💎</span>
                    <span className="economy-value">{gems.toLocaleString()}</span>
                </div>

                {/* Coins (Visual Only) */}
                <div
                    className="economy-item coin interactive"
                    onClick={() => setShowCoinShop(true)}
                    title="Open Coin Shop"
                >
                    <span className="economy-icon">🪙</span>
                    <span className="economy-value">{coins.toLocaleString()}</span>
                </div>

                {/* Rankings Button */}
                <button
                    className="leaderboard-toggle"
                    onClick={() => setShowLeaderboard(true)}
                    style={{ margin: 0 }}
                >
                    🏆 Rankings
                </button>

                {/* User Profile (Rightmost) */}
                <SignedIn>
                    <UserButton afterSignOutUrl="/" />
                </SignedIn>
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div className="leaderboard-overlay" style={{ zIndex: 10001 }}>
                    <div className="leaderboard-card" style={{ maxWidth: '400px' }}>
                        <div className="leaderboard-header">
                            <div className="leaderboard-logo">⚙️</div>
                            <h2 className="leaderboard-title">SETTINGS</h2>
                            <button className="close-btn" onClick={() => setShowSettings(false)}>×</button>
                        </div>

                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
                            {/* Mute Toggle */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600 }}>Master Mute</span>
                                <button
                                    className={`btn-${isMuted ? 'primary' : 'secondary'}`}
                                    onClick={() => setIsMuted(!isMuted)}
                                    style={{ padding: '8px 20px', fontSize: '0.9rem' }}
                                >
                                    {isMuted ? 'UNMUTE' : 'MUTE'}
                                </button>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

                            {/* Music Volume */}
                            <div className="volume-control">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span>🎵 Music</span>
                                    <span>{Math.round(musicVolume * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max="1" step="0.01"
                                    value={musicVolume}
                                    onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                                    className="volume-slider"
                                />
                            </div>

                            {/* SFX Volume */}
                            <div className="volume-control">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span>💥 Effects</span>
                                    <span>{Math.round(sfxVolume * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max="1" step="0.01"
                                    value={sfxVolume}
                                    onChange={(e) => setSfxVolume(parseFloat(e.target.value))}
                                    className="volume-slider"
                                />
                            </div>

                            {/* Announcer Volume */}
                            <div className="volume-control">
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span>🎙️ Announcer</span>
                                    <span>{Math.round(announcerVolume * 100)}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0" max="1" step="0.01"
                                    value={announcerVolume}
                                    onChange={(e) => setAnnouncerVolume(parseFloat(e.target.value))}
                                    className="volume-slider"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Coin Shop Modal */}
            {showCoinShop && (
                <div className="leaderboard-overlay" style={{ zIndex: 10002 }}>
                    <div className="leaderboard-card shop-card" style={{ maxWidth: '400px' }}>
                        <div className="leaderboard-header">
                            <div className="leaderboard-logo">🪙</div>
                            <h2 className="leaderboard-title">COIN SHOP</h2>
                            <button className="close-btn" onClick={() => setShowCoinShop(false)}>×</button>
                        </div>
                        <div className="shop-grid">
                            {[10, 50, 100, 250, 500, 1000].map((amount) => (
                                <button
                                    key={amount}
                                    className="shop-item-btn coin"
                                    onClick={() => handlePurchase('coins', amount)}
                                >
                                    <span className="shop-item-icon">🪙</span>
                                    <span className="shop-item-amount">+{amount}</span>
                                    <span className="shop-item-price">RELOAD</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Gem Shop Modal */}
            {showGemShop && (
                <div className="leaderboard-overlay" style={{ zIndex: 10003 }}>
                    <div className="leaderboard-card shop-card" style={{ maxWidth: '400px' }}>
                        <div className="leaderboard-header">
                            <div className="leaderboard-logo">💎</div>
                            <h2 className="leaderboard-title" style={{ background: 'linear-gradient(to bottom, #00ffff, #008b8b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>GEM SHOP</h2>
                            <button className="close-btn" onClick={() => setShowGemShop(false)}>×</button>
                        </div>
                        <div className="shop-grid">
                            {[10, 50, 100, 250, 500, 1000].map((amount) => (
                                <button
                                    key={amount}
                                    className="shop-item-btn gem"
                                    onClick={() => handlePurchase('gems', amount)}
                                >
                                    <span className="shop-item-icon">💎</span>
                                    <span className="shop-item-amount">+{amount}</span>
                                    <span className="shop-item-price">RELOAD</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Leaderboard Overlay */}
            {showLeaderboard && (
                <div className="leaderboard-overlay">
                    <div className="leaderboard-card">
                        <div className="leaderboard-header">
                            <div className="leaderboard-logo">🏆</div>
                            <h2 className="leaderboard-title">HALL OF FAME</h2>
                            <button className="close-btn" onClick={() => setShowLeaderboard(false)}>×</button>
                        </div>

                        <div className="filter-tabs">
                            <button
                                className={`tab-btn ${timeFilter === 'daily' ? 'active' : ''}`}
                                onClick={() => setTimeFilter('daily')}
                            >
                                Daily
                            </button>
                            <button
                                className={`tab-btn ${timeFilter === 'weekly' ? 'active' : ''}`}
                                onClick={() => setTimeFilter('weekly')}
                            >
                                Weekly
                            </button>
                            <button
                                className={`tab-btn ${timeFilter === 'monthly' ? 'active' : ''}`}
                                onClick={() => setTimeFilter('monthly')}
                            >
                                Monthly
                            </button>
                        </div>

                        <div className="top-three-container">
                            {[1, 0, 2].map((orderIndex) => {
                                const player = leaderboardData[orderIndex];
                                if (!player && leaderboardData.length > orderIndex) return null;

                                if (!player) return (
                                    <div key={`placeholder-${orderIndex}`} className={`rank-card rank-${orderIndex + 1}`} style={{ opacity: 0.3 }}>
                                        <div className="rank-avatar">?</div>
                                        <div className="rank-name">Empty</div>
                                        <div className="rank-score">--</div>
                                    </div>
                                );

                                return (
                                    <div key={player.id} className={`rank-card rank-${orderIndex + 1}`}>
                                        <div className="rank-avatar">{orderIndex + 1}</div>
                                        <div className="rank-name">{player.username || `Player ${player.id.substring(0, 4)}`}</div>
                                        <div className="rank-score">{player.total_wins} W</div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="leaderboard-list">
                            {leaderboardData.slice(3).length === 0 ? (
                                <div style={{ textAlign: 'center', opacity: 0.5, padding: '20px', fontSize: '0.9rem' }}>
                                    {leaderboardData.length <= 3 ? "No other contenders..." : "Loading..."}
                                </div>
                            ) : (
                                leaderboardData.slice(3).map((player, index) => (
                                    <div key={player.id} className="leaderboard-item">
                                        <div className="rank-badge" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', width: '30px', height: '30px', fontSize: '0.9rem' }}>
                                            {index + 4}
                                        </div>
                                        <div className="player-info">
                                            <div className="player-name">{player.username || `Player ${player.id.substring(0, 5)}`}</div>
                                            <div className="player-stats">{player.total_games} games</div>
                                        </div>
                                        <div className="win-count" style={{ fontSize: '1rem' }}>{player.total_wins} W</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}



            <div className={`game-container 
                ${(gameState === 'roundResult' && showCollision) ? 'shake' : ''}
                `}>

                {/* Integrated Vertical Score Bars */}
                {(gameState === 'playing' || gameState === 'roundResult' || gameState === 'countdown' || gameState === 'gameOver') && (
                    <>
                        <div className="score-bar score-bar-left">
                            <div className="score-text" style={{ color: 'var(--score-green)' }}>{playerScore}</div>
                            <div className="score-track">
                                <div className="score-fill fill-left" style={{ height: `${(playerScore / 3) * 100}%` }}></div>
                            </div>
                            <div className="score-avatar">
                                {user?.imageUrl ? <img src={user.imageUrl} className="avatar-img" alt="You" /> : <span style={{ fontSize: '1.5rem' }}>😎</span>}
                            </div>
                        </div>
                        <div className="score-bar score-bar-right">
                            <div className="score-text" style={{ color: 'var(--score-red)' }}>{opponentScore}</div>
                            <div className="score-track">
                                <div className="score-fill fill-right" style={{ height: `${(opponentScore / 3) * 100}%` }}></div>
                            </div>
                            <div className="score-avatar">
                                {opponentImageUrl ? <img src={opponentImageUrl} className="avatar-img" alt="Opponent" /> : <span style={{ fontSize: '1.5rem' }}>🤖</span>}
                            </div>
                        </div>
                    </>
                )}

                {/* Simplified Top Info Bar */}
                {(gameState === 'playing' || gameState === 'roundResult' || gameState === 'gameOver') && (
                    <div className="top-info-bar" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                        {gameState === 'playing' && (
                            <div className="game-status-text" style={{ fontSize: '1.5rem', fontWeight: 900 }}>ROUND {round}</div>
                        )}
                        {(gameState === 'roundResult') && (
                            <div className="game-status-text result" style={{ fontSize: '2.5rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '4px' }}>
                                {roundWinner === 'player' ? 'WIN' : roundWinner === 'opponent' ? 'LOSS' : 'TIE'}
                            </div>
                        )}
                    </div>
                )}

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

                {/* Countdown Overlay */}
                {gameState === 'countdown' && (
                    <div className="countdown-overlay">
                        <div className="countdown">{countdown}</div>
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
                            {/* Simplified result display, visuals only as text is now at top */}
                            {/* Clean display without extra outcome text */}
                        </div>
                    )}

                    {gameState === 'gameOver' && (
                        <div style={{ textAlign: 'center' }}>
                            {/* Intuitive and simplified GameOver screen */}
                            <div style={{ marginTop: '25vh' }}>
                                {/* Rematch System */}
                                <div className="rematch-card">
                                    <div className="game-status-text result" style={{
                                        fontSize: '2.5rem',
                                        fontWeight: 900,
                                        textTransform: 'uppercase',
                                        marginBottom: '20px',
                                        color: gameWinner === 'player' ? 'var(--score-green)' : 'var(--score-red)'
                                    }}>
                                        {gameWinner === 'player' ? 'VICTORY' : 'DEFEAT'}
                                    </div>

                                    <p style={{ marginBottom: '25px', fontSize: '1.1rem', opacity: 0.9 }}>
                                        Play this opponent again?
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                        <button
                                            className="btn-primary"
                                            onClick={handleRequestRematch}
                                            disabled={rematchRequested || rematchStatus === 'Opponent disconnected!'}
                                        >
                                            {rematchRequested ? 'WAITING...' : 'REMATCH'}
                                        </button>
                                        <button className="btn-secondary" onClick={handlePlayAgain}>
                                            START
                                        </button>
                                    </div>

                                    {rematchStatus && (
                                        <div className="rematch-status" style={{ marginTop: '20px', color: 'var(--primary)', fontWeight: 600 }}>
                                            {rematchStatus}
                                            {rematchStatus.includes('wants a rematch') && (
                                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
                                                    <button className="btn-primary" onClick={() => handleRematchResponse(true)} style={{ padding: '8px 20px', fontSize: '0.9rem' }}>Accept</button>
                                                    <button className="btn-secondary" onClick={() => handleRematchResponse(false)} style={{ padding: '8px 20px', fontSize: '0.9rem' }}>Decline</button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
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

            {/* Onboarding Modal */}
            {showOnboarding && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2 className="modal-title">WELCOME PLAYER</h2>
                        <div className="input-group">
                            <label className="input-label">Choose your fighter name</label>
                            <input
                                type="text"
                                className="modal-input"
                                placeholder="Username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                maxLength={15}
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Date of Birth</label>
                            <input
                                type="date"
                                className="modal-input"
                                value={birthDate}
                                onChange={(e) => setBirthDate(e.target.value)}
                            />
                        </div>
                        <button className="btn-enter-arena" onClick={handleSaveProfile}>
                            ENTER ARENA
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
