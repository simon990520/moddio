-- Migration script to add Coins and Gems to profiles table

-- 1. Add columns to the profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS coins BIGINT DEFAULT 500,
ADD COLUMN IF NOT EXISTS gems BIGINT DEFAULT 50;

-- 2. (Optional) Initialize existing users with default values if columns were already null
UPDATE profiles SET coins = 500 WHERE coins IS NULL;
UPDATE profiles SET gems = 50 WHERE gems IS NULL;

-- 3. Verify the columns exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='coins') THEN
        RAISE NOTICE 'Column coins was not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='gems') THEN
        RAISE NOTICE 'Column gems was not created';
    END IF;
END $$;
