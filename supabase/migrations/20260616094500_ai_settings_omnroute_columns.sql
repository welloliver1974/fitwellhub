ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS omniroute_api_key TEXT;

ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS omniroute_base_url TEXT;

ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_provider_check;

ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_provider_check
  CHECK (provider IN ('groq', 'openrouter', 'omniroute'));
