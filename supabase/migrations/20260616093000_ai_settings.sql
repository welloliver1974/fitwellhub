CREATE TABLE IF NOT EXISTS public.ai_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'groq',
  groq_api_key TEXT,
  openrouter_api_key TEXT,
  omniroute_api_key TEXT,
  omniroute_base_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_settings_provider_check CHECK (provider IN ('groq', 'openrouter', 'omniroute'))
);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own ai_settings all"
  ON public.ai_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ai_settings_provider_idx
  ON public.ai_settings(provider);
