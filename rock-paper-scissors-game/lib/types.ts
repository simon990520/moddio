export type Choice = 'rock' | 'paper' | 'scissors';
export type GameState = 'lobby' | 'waiting' | 'countdown' | 'playing' | 'roundResult' | 'gameOver';

export interface Player {
    id: string;
    socketId: string;
    score: number;
    choice: Choice | null;
    ready: boolean;
}

export interface GameRoom {
    id: string;
    players: [Player, Player];
    round: number;
    state: GameState;
    countdown: number;
    winner: string | null;
}

export interface RoundResult {
    playerChoice: Choice;
    opponentChoice: Choice;
    winner: 'player' | 'opponent' | 'tie';
    playerScore: number;
    opponentScore: number;
}

export interface GameOverData {
    winner: 'player' | 'opponent';
    finalScore: {
        player: number;
        opponent: number;
    };
}
