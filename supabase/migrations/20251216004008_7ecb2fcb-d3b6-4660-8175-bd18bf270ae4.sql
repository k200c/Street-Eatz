-- 1. ADD MISSING COLUMNS (Safe to run if they already exist)
ALTER TABLE social_media_posts ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'single';
ALTER TABLE social_media_posts ADD COLUMN IF NOT EXISTS ai_preference TEXT DEFAULT 'upload_media';
ALTER TABLE social_media_posts ADD COLUMN IF NOT EXISTS visual_prompt TEXT;
ALTER TABLE social_media_posts ADD COLUMN IF NOT EXISTS idea TEXT;
ALTER TABLE social_media_posts ADD COLUMN IF NOT EXISTS brief TEXT;

-- 2. RELAX OLD RESTRICTIONS (Stop 'content_idea' errors)
ALTER TABLE social_media_posts ALTER COLUMN content_idea DROP NOT NULL;

-- 3. FIX STATUS CONSTRAINT (Crucial for 'generating' status)
ALTER TABLE social_media_posts DROP CONSTRAINT IF EXISTS social_media_posts_status_check;
ALTER TABLE social_media_posts 
ADD CONSTRAINT social_media_posts_status_check 
CHECK (status IN ('draft', 'generating', 'scheduled', 'published', 'failed'));

-- 4. FIX MEDIA URLS (Ensure it holds a list of images)
ALTER TABLE social_media_posts 
ALTER COLUMN media_urls TYPE TEXT[] USING string_to_array(media_urls::text, ',');