-- ==============================================================================
-- FitWell Hub: Liberar RLS para UPDATE e DELETE em favorite_foods
-- Permite que o Hermes (Telegram) e rotinas atualizem e removam alimentos favoritos
-- para usuários vinculados pelo telegram_chat_id (igual a meals e workouts).
-- ==============================================================================

-- 1. Permissão de INSERT para favorite_foods
DROP POLICY IF EXISTS "telegram_insert_favorite_foods" ON public.favorite_foods;
CREATE POLICY "telegram_insert_favorite_foods"
  ON public.favorite_foods
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = favorite_foods.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

-- 2. Permissão de UPDATE para favorite_foods
DROP POLICY IF EXISTS "telegram_update_favorite_foods" ON public.favorite_foods;
CREATE POLICY "telegram_update_favorite_foods"
  ON public.favorite_foods
  FOR UPDATE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = favorite_foods.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );

-- 3. Permissão de DELETE para favorite_foods
DROP POLICY IF EXISTS "telegram_delete_favorite_foods" ON public.favorite_foods;
CREATE POLICY "telegram_delete_favorite_foods"
  ON public.favorite_foods
  FOR DELETE
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.telegram_integrations ti 
      WHERE ti.user_id = favorite_foods.user_id 
        AND ti.telegram_chat_id IS NOT NULL
    )
  );
