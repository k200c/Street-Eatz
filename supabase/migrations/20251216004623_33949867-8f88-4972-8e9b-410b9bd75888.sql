-- 1. DROP the old strict constraint
ALTER TABLE social_media_posts 
DROP CONSTRAINT IF EXISTS social_media_posts_post_type_check;

-- 2. ADD the new flexible constraint (Allowing 'single', 'carousel', 'video')
ALTER TABLE social_media_posts 
ADD CONSTRAINT social_media_posts_post_type_check 
CHECK (post_type IN ('single', 'image', 'carousel', 'video', 'reel'));

-- 3. (Safety) Fix the Status constraint as well to prevent the next error
ALTER TABLE social_media_posts 
DROP CONSTRAINT IF EXISTS social_media_posts_status_check;

ALTER TABLE social_media_posts 
ADD CONSTRAINT social_media_posts_status_check 
CHECK (status IN ('draft', 'generating', 'scheduled', 'published', 'failed'));