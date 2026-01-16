-- SQL script to ensure RLS policies allow the system to work correctly

-- 1. Enable RLS on profiles if not already enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Policy: Allow users to view their own profile (READ)
-- If using Clerk JWT, this would be: auth.uid() = id
-- For now, we'll allow all authenticated reads if you don't have JWT sync, 
-- or a specific one if you want more security:
CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
USING (true); -- Simplified for this demo, usually: auth.uid()::text = id

-- 3. Policy: Allow the service role to do everything (Supabase default)
-- The backend uses the service_role key, so it bypasses these policies anyway.

-- 4. Verify columns again (just in case)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS coins BIGINT DEFAULT 500,
ADD COLUMN IF NOT EXISTS gems BIGINT DEFAULT 50;

UPDATE profiles SET coins = 500 WHERE coins IS NULL;
UPDATE profiles SET gems = 50 WHERE gems IS NULL;
