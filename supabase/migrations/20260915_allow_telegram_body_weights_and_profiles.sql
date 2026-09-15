-- ==============================================================================
-- FitWell Hub: Liberar RLS para Hermes Agent (Telegram) em Peso, Medidas, Bioimpedância e Metas
-- Permite que o Hermes leia histórico de peso, medidas corporais, perfil e metas
-- para os usuários devidamente vinculados pelo telegram_chat_id.
-- ==============================================================================

-- 1. TABELA BODY_WEIGHTS (Pesagens - SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "telegram_select_body_weights" ON public.body_weights;
CREATE POLICY "telegram_select_body_weights"
  ON public.body_weights
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = body_weights.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_insert_body_weights" ON public.body_weights;
CREATE POLICY "telegram_insert_body_weights"
  ON public.body_weights
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = body_weights.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_update_body_weights" ON public.body_weights;
CREATE POLICY "telegram_update_body_weights"
  ON public.body_weights
  FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = body_weights.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_delete_body_weights" ON public.body_weights;
CREATE POLICY "telegram_delete_body_weights"
  ON public.body_weights
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = body_weights.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );


-- 2. TABELA BODY_MEASUREMENTS (Medidas Corporais - SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "telegram_select_body_measurements" ON public.body_measurements;
CREATE POLICY "telegram_select_body_measurements"
  ON public.body_measurements
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = body_measurements.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_insert_body_measurements" ON public.body_measurements;
CREATE POLICY "telegram_insert_body_measurements"
  ON public.body_measurements
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = body_measurements.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_update_body_measurements" ON public.body_measurements;
CREATE POLICY "telegram_update_body_measurements"
  ON public.body_measurements
  FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = body_measurements.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_delete_body_measurements" ON public.body_measurements;
CREATE POLICY "telegram_delete_body_measurements"
  ON public.body_measurements
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = body_measurements.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );


-- 3. TABELA BIOIMPEDANCE_LOGS (Bioimpedância - SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "telegram_select_bioimpedance_logs" ON public.bioimpedance_logs;
CREATE POLICY "telegram_select_bioimpedance_logs"
  ON public.bioimpedance_logs
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = bioimpedance_logs.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_insert_bioimpedance_logs" ON public.bioimpedance_logs;
CREATE POLICY "telegram_insert_bioimpedance_logs"
  ON public.bioimpedance_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = bioimpedance_logs.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_update_bioimpedance_logs" ON public.bioimpedance_logs;
CREATE POLICY "telegram_update_bioimpedance_logs"
  ON public.bioimpedance_logs
  FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = bioimpedance_logs.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_delete_bioimpedance_logs" ON public.bioimpedance_logs;
CREATE POLICY "telegram_delete_bioimpedance_logs"
  ON public.bioimpedance_logs
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = bioimpedance_logs.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );


-- 4. TABELA PROFILES (Perfil do Usuário: peso, altura, sexo, data nascimento - SELECT e UPDATE)
-- Nota: Na tabela profiles a chave primária é 'id' (correspondente ao auth.uid)
DROP POLICY IF EXISTS "telegram_select_profiles" ON public.profiles;
CREATE POLICY "telegram_select_profiles"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = profiles.id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_update_profiles" ON public.profiles;
CREATE POLICY "telegram_update_profiles"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = profiles.id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );


-- 5. TABELA GOALS (Metas nutricionais e calóricas - SELECT, INSERT, UPDATE)
DROP POLICY IF EXISTS "telegram_select_goals" ON public.goals;
CREATE POLICY "telegram_select_goals"
  ON public.goals
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = goals.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_insert_goals" ON public.goals;
CREATE POLICY "telegram_insert_goals"
  ON public.goals
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = goals.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_update_goals" ON public.goals;
CREATE POLICY "telegram_update_goals"
  ON public.goals
  FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = goals.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );
