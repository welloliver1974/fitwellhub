-- =============================================
-- Migration: Workout History (Sessions & Logs)
-- Cole este SQL no SQL Editor do Supabase e execute-o.
-- =============================================

-- 1. Tabela de Sessões de Treino (Cabeçalho do log)
CREATE TABLE IF NOT EXISTS public.workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS para workout_sessions
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;

-- Criar política RLS
CREATE POLICY "own workout_sessions all" 
  ON public.workout_sessions 
  FOR ALL 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_date 
  ON public.workout_sessions(user_id, completed_at DESC);


-- 2. Tabela de Séries Realizadas (Corpo do log)
CREATE TABLE IF NOT EXISTS public.workout_session_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  weight_kg NUMERIC(6,2) NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS para workout_session_sets
ALTER TABLE public.workout_session_sets ENABLE ROW LEVEL SECURITY;

-- Criar política RLS
CREATE POLICY "own workout_session_sets all" 
  ON public.workout_session_sets 
  FOR ALL 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_workout_session_sets_session 
  ON public.workout_session_sets(session_id);


-- 3. Bloco de Migração de Dados (Migra os sets marcados como completed antigos para o novo formato)
DO $$
DECLARE
  r RECORD;
  sess_id UUID;
BEGIN
  -- Verifica se a tabela 'sets' e a coluna 'completed' existem
  IF EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'sets' AND column_name = 'completed'
  ) THEN
    -- Varre agrupando treinos concluídos pelo usuário por dia
    FOR r IN 
      SELECT DISTINCT 
        s.user_id, 
        e.workout_id, 
        w.name as workout_name, 
        s.created_at::date as comp_date
      FROM public.sets s
      JOIN public.exercises e ON s.exercise_id = e.id
      JOIN public.workouts w ON e.workout_id = w.id
      WHERE s.completed = true
    LOOP
      -- Insere a sessão correspondente no novo histórico
      INSERT INTO public.workout_sessions (user_id, workout_id, name, completed_at)
      VALUES (r.user_id, r.workout_id, r.workout_name, r.comp_date)
      RETURNING id INTO sess_id;

      -- Insere todas as séries que foram concluídas naquele dia/treino
      INSERT INTO public.workout_session_sets (session_id, user_id, exercise_name, set_number, reps, weight_kg, completed, created_at)
      SELECT 
        sess_id, 
        s.user_id, 
        e.name, 
        s.set_number, 
        s.reps, 
        s.weight_kg, 
        true, 
        s.created_at
      FROM public.sets s
      JOIN public.exercises e ON s.exercise_id = e.id
      WHERE e.workout_id = r.workout_id 
        AND s.user_id = r.user_id 
        AND s.completed = true 
        AND s.created_at::date = r.comp_date;
    END LOOP;
  END IF;
END $$;
