-- ==============================================================================
-- FitWell Hub: Integração Telegram & Hermes Agent
-- Tabela para pareamento seguro entre Usuários Supabase e Telegram Chat IDs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.telegram_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT UNIQUE,
  telegram_username TEXT,
  link_token TEXT UNIQUE,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_user_telegram UNIQUE (user_id)
);

-- Habilitar RLS
ALTER TABLE public.telegram_integrations ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Usuário pode visualizar seu pareamento telegram"
  ON public.telegram_integrations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuário pode criar/atualizar seu pareamento telegram"
  ON public.telegram_integrations
  FOR ALL
  USING (auth.uid() = user_id);

-- Índice para busca rápida por chat_id e por token
CREATE INDEX IF NOT EXISTS idx_telegram_integrations_chat_id ON public.telegram_integrations(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_integrations_token ON public.telegram_integrations(link_token);
