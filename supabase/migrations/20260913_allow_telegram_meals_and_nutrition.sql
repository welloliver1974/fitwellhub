-- ==============================================================================
-- FitWell Hub: Liberar RLS para Hermes Agent (Telegram) em Refeições, Água e Treinos
-- Permite que o Hermes registre, altere, atualize e apague itens do diário
-- com segurança para usuários vinculados pelo telegram_chat_id.
-- ==============================================================================

-- 1. TABELA MEALS (Refeições - SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "telegram_insert_meals" ON public.meals;
CREATE POLICY "telegram_insert_meals"
  ON public.meals
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = meals.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_select_meals" ON public.meals;
CREATE POLICY "telegram_select_meals"
  ON public.meals
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = meals.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_update_meals" ON public.meals;
CREATE POLICY "telegram_update_meals"
  ON public.meals
  FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = meals.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_delete_meals" ON public.meals;
CREATE POLICY "telegram_delete_meals"
  ON public.meals
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = meals.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

-- 2. TABELA MEAL_ITEMS (Alimentos - SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "telegram_insert_meal_items" ON public.meal_items;
CREATE POLICY "telegram_insert_meal_items"
  ON public.meal_items
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = meal_items.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_select_meal_items" ON public.meal_items;
CREATE POLICY "telegram_select_meal_items"
  ON public.meal_items
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = meal_items.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_update_meal_items" ON public.meal_items;
CREATE POLICY "telegram_update_meal_items"
  ON public.meal_items
  FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = meal_items.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_delete_meal_items" ON public.meal_items;
CREATE POLICY "telegram_delete_meal_items"
  ON public.meal_items
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = meal_items.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

-- 3. TABELA WATER_LOGS (Registro de Hidratação / Água - SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "telegram_insert_water_logs" ON public.water_logs;
CREATE POLICY "telegram_insert_water_logs"
  ON public.water_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = water_logs.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_select_water_logs" ON public.water_logs;
CREATE POLICY "telegram_select_water_logs"
  ON public.water_logs
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = water_logs.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_delete_water_logs" ON public.water_logs;
CREATE POLICY "telegram_delete_water_logs"
  ON public.water_logs
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = water_logs.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

-- 4. TABELA FAVORITE_FOODS (Consulta de Favoritos pelo Hermes)
DROP POLICY IF EXISTS "telegram_select_favorite_foods" ON public.favorite_foods;
CREATE POLICY "telegram_select_favorite_foods"
  ON public.favorite_foods
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = favorite_foods.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

-- 5. TABELA GOALS (Consulta de Metas Nutricionais)
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

-- 6. TABELAS DE TREINO (Check-in, criação e desmarcação de treinos via Telegram)
DROP POLICY IF EXISTS "telegram_insert_workout_sessions" ON public.workout_sessions;
CREATE POLICY "telegram_insert_workout_sessions"
  ON public.workout_sessions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = workout_sessions.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_delete_workout_sessions" ON public.workout_sessions;
CREATE POLICY "telegram_delete_workout_sessions"
  ON public.workout_sessions
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = workout_sessions.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_insert_workout_session_sets" ON public.workout_session_sets;
CREATE POLICY "telegram_insert_workout_session_sets"
  ON public.workout_session_sets
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = workout_session_sets.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_delete_workout_session_sets" ON public.workout_session_sets;
CREATE POLICY "telegram_delete_workout_session_sets"
  ON public.workout_session_sets
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = workout_session_sets.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_all_workouts" ON public.workouts;
CREATE POLICY "telegram_all_workouts"
  ON public.workouts
  FOR ALL
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = workouts.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_all_exercises" ON public.exercises;
CREATE POLICY "telegram_all_exercises"
  ON public.exercises
  FOR ALL
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = exercises.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "telegram_all_sets" ON public.sets;
CREATE POLICY "telegram_all_sets"
  ON public.sets
  FOR ALL
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = sets.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );
