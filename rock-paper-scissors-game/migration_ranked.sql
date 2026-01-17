-- Safe restart for matches table to avoid schema conflicts
DROP TABLE IF EXISTS matches CASCADE;

-- Add rank and rp columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rank_name TEXT DEFAULT 'BRONCE';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rp INTEGER DEFAULT 0;

-- Optional: Add a check for minimum RP
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS rp_min_check;
ALTER TABLE profiles ADD CONSTRAINT rp_min_check CHECK (rp >= 0);

-- Create matches table for game history
CREATE TABLE matches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    player1_id UUID REFERENCES auth.users(id),
    player2_id UUID REFERENCES auth.users(id),
    winner_id UUID REFERENCES auth.users(id),
    p1_score INTEGER,
    p2_score INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    mode TEXT DEFAULT 'casual',
    stake INTEGER DEFAULT 0
);

-- Enable RLS for matches
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own matches
CREATE POLICY "Users can view their own matches" 
ON matches FOR SELECT 
USING (
    auth.uid()::uuid = player1_id 
    OR 
    auth.uid()::uuid = player2_id
);
