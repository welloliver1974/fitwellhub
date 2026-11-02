-- ==============================================================================
-- FitWell Hub & FitWell Bridge: Tabela de Métricas Avançadas de Saúde
-- Data: 02/11/2026
--
-- Armazena dados consolidados do Samsung Galaxy Watch / Health Connect:
-- 1. Sono consolidado (duração total, profundo, REM, leve, acordado, horários)
-- 2. Frequência cardíaca (repouso, média diária, mínima, máxima)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.daily_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,

    -- Métricas de Sono
    sleep_duration_seconds INTEGER,
    sleep_deep_seconds INTEGER,
    sleep_rem_seconds INTEGER,
    sleep_light_seconds INTEGER,
    sleep_awake_seconds INTEGER,
    sleep_start_time TIMESTAMPTZ,
    sleep_end_time TIMESTAMPTZ,

    -- Métricas Cardíacas
    resting_heart_rate INTEGER,
    avg_heart_rate INTEGER,
    min_heart_rate INTEGER,
    max_heart_rate INTEGER,

    -- Origem e Auditoria
    source TEXT DEFAULT 'health_connect',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

    CONSTRAINT daily_health_metrics_user_date_key UNIQUE (user_id, log_date)
);

-- Índices para buscas rápidas por data e usuário
CREATE INDEX IF NOT EXISTS idx_daily_health_metrics_user_date
    ON public.daily_health_metrics (user_id, log_date DESC);

-- ==============================================================================
-- Políticas de Segurança (Row Level Security - RLS)
-- ==============================================================================
ALTER TABLE public.daily_health_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own daily_health_metrics all" ON public.daily_health_metrics;

CREATE POLICY "own daily_health_metrics all"
    ON public.daily_health_metrics
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Comentários descritivos
COMMENT ON TABLE public.daily_health_metrics IS 'Métricas diárias consolidadas de sono, frequência cardíaca e saúde vindas do Galaxy Watch / Health Connect';
