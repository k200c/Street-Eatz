ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS flatbread_addon_enabled boolean NOT NULL DEFAULT true;