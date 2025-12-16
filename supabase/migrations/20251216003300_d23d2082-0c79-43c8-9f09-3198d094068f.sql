-- 1. Relax Legacy Constraints (Stop the 400 Error)
ALTER TABLE social_media_posts ALTER COLUMN content_idea DROP NOT NULL;
ALTER TABLE social_media_posts ALTER COLUMN brief DROP NOT NULL;

-- 2. Ensure New Columns Exist (Safe to run multiple times)
ALTER TABLE social_media_posts ADD COLUMN IF NOT EXISTS idea TEXT;
ALTER TABLE social_media_posts ADD COLUMN IF NOT EXISTS visual_prompt TEXT;
ALTER TABLE social_media_posts ADD COLUMN IF NOT EXISTS ai_preference TEXT DEFAULT 'upload_media';
ALTER TABLE social_media_posts ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'single';

-- 3. Fix Status Constraint to allow 'generating'
ALTER TABLE social_media_posts DROP CONSTRAINT IF EXISTS social_media_posts_status_check;
ALTER TABLE social_media_posts 
ADD CONSTRAINT social_media_posts_status_check 
CHECK (status IN ('draft', 'generating', 'scheduled', 'published', 'failed'));

-- 4. Ensure media_urls is an Array
ALTER TABLE social_media_posts 
ALTER COLUMN media_urls TYPE TEXT[] USING string_to_array(media_urls::text, ',');