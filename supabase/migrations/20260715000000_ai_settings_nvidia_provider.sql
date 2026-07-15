-- Adiciona 'nvidia' ao check constraint de provider na tabela ai_settings
ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_provider_check,
  ADD CONSTRAINT ai_settings_provider_check
    CHECK (provider IN ('groq', 'openrouter', 'omniroute', 'nvidia'));
