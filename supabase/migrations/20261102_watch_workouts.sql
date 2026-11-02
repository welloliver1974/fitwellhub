-- ==============================================================================
-- FitWell Hub & FitWell Bridge: Tabela de Treinos do Galaxy Watch
-- Data: 02/11/2026
--
-- Armazena sessões de exercício/treino individuais sincronizadas do Galaxy Watch:
-- Esteira, Corrida, Musculação, Caminhada, Ciclismo, Natação, etc.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.watch_workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    log_date DATE NOT NULL,
    exercise_type TEXT NOT NULL,
    exercise_type_code INTEGER,
    title TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER,
    calories_kcal INTEGER,
    distance_meters DOUBLE PRECISION,
    avg_heart_rate INTEGER,
    max_heart_rate INTEGER,
    min_heart_rate INTEGER,
    source TEXT DEFAULT 'galaxy_watch',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

    CONSTRAINT watch_workouts_user_session_key UNIQUE (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_workouts_user_date
    ON public.watch_workouts (user_id, log_date DESC);

ALTER TABLE public.watch_workouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own watch_workouts all" ON public.watch_workouts;
CREATE POLICY "own watch_workouts all"
    ON public.watch_workouts
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.watch_workouts IS 'Sessões de exercícios e treinos gravadas pelo Samsung Galaxy Watch via Health Connect';
