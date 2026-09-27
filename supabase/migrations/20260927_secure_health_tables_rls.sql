-- ==============================================================================
-- FitWell Hub: Blindagem e Segurança de RLS para Tabelas de Saúde e Perfil
-- Data: 27/09/2026
--
-- Motivação:
-- As policies anteriores "telegram_*" continham 'OR EXISTS (SELECT 1 FROM telegram_integrations...)'
-- sem verificação de autenticação de sessão (auth.uid()), o que permitia que qualquer
-- chamada externa com a chave anônima/pública (publishable) lesse e gravasse dados
-- de qualquer usuário com Telegram vinculado.
--
-- Solução:
-- 1. Revogar todas as policies permissivas "telegram_*" de peso, medidas, bioimpedância,
--    perfil e metas.
-- 2. Garantir que cada usuário autenticado (auth.uid()) só acesse e altere seus próprios dados.
-- 3. O agente Hermes no Telegram opera através do server function (executeHermesAction)
--    usando a SUPABASE_SERVICE_ROLE_KEY no servidor (Cloudflare Worker / backend),
--    operando com total autoridade e isolamento multi-usuário.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABELA BODY_WEIGHTS (Pesagens)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "telegram_select_body_weights" ON public.body_weights;
DROP POLICY IF EXISTS "telegram_insert_body_weights" ON public.body_weights;
DROP POLICY IF EXISTS "telegram_update_body_weights" ON public.body_weights;
DROP POLICY IF EXISTS "telegram_delete_body_weights" ON public.body_weights;
DROP POLICY IF EXISTS "own body_weights all" ON public.body_weights;

ALTER TABLE public.body_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own body_weights all"
  ON public.body_weights
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. TABELA BODY_MEASUREMENTS (Medidas Corporais)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "telegram_select_body_measurements" ON public.body_measurements;
DROP POLICY IF EXISTS "telegram_insert_body_measurements" ON public.body_measurements;
DROP POLICY IF EXISTS "telegram_update_body_measurements" ON public.body_measurements;
DROP POLICY IF EXISTS "telegram_delete_body_measurements" ON public.body_measurements;
DROP POLICY IF EXISTS "own measurements all" ON public.body_measurements;

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own measurements all"
  ON public.body_measurements
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. TABELA BIOIMPEDANCE_LOGS (Bioimpedância)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "telegram_select_bioimpedance_logs" ON public.bioimpedance_logs;
DROP POLICY IF EXISTS "telegram_insert_bioimpedance_logs" ON public.bioimpedance_logs;
DROP POLICY IF EXISTS "telegram_update_bioimpedance_logs" ON public.bioimpedance_logs;
DROP POLICY IF EXISTS "telegram_delete_bioimpedance_logs" ON public.bioimpedance_logs;
DROP POLICY IF EXISTS "own bioimpedance_logs all" ON public.bioimpedance_logs;

ALTER TABLE public.bioimpedance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own bioimpedance_logs all"
  ON public.bioimpedance_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. TABELA PROFILES (Perfil do Usuário)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "telegram_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "telegram_update_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "own profile all" ON public.profiles;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- 5. TABELA GOALS (Metas Nutricionais e Calóricas)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "telegram_select_goals" ON public.goals;
DROP POLICY IF EXISTS "telegram_insert_goals" ON public.goals;
DROP POLICY IF EXISTS "telegram_update_goals" ON public.goals;
DROP POLICY IF EXISTS "own goals all" ON public.goals;

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own goals all"
  ON public.goals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
