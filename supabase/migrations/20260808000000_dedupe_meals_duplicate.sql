-- 20260808000000_dedupe_meals_unique.sql
-- ---------------------------------------------------------------------------
-- Corrige a causa-raiz das calorias duplicadas no card do dia / coach:
--   não existia nenhuma constraint única em meals(user_id, meal_date,
--   meal_type). Caminhos como "Copiar de ontem", o guard desatualizado da
--   tela e o chat (record_meal) conseguiam criar DUAS refeições do mesmo
--   tipo no mesmo dia. A tela de Nutrição só renderiza a primeira
--   (meals.find(meal_type)), então a duplicada ficava invisível — mas o card
--   de calorias do dia e o coach somavam os itens das DUAS.
--
-- 1. Reponta os meal_items das refeições duplicadas para a refeição mais
--    antiga do mesmo (user_id, meal_date, meal_type).
-- 2. Apaga as refeições duplicadas (a mais antiga é mantida).
-- 3. Deduplica meal_items idênticos dentro da mesma refeição (efeito de
--    "salvar 2x" / double-tap).
-- 4. Cria UNIQUE INDEX em meals(user_id, meal_date, meal_type) — proteção
--    definitiva, já as correções de código (+ inclusões nas server-fns)
--    impedem novos duplicados no futuro.
--
-- Idempotente: roda sem efeito se já houver sido aplicada.
-- ---------------------------------------------------------------------------

-- 1) Reponta itens das refeições duplicadas para a refeição "mãe" (mais antiga).
--    Correlated-subquery simples (sem CTE/JOIN no FROM) para não esbarrar na
--    limitação de escopo de alias do UPDATE...FROM no PostgreSQL.
UPDATE public.meal_items mi
   SET meal_id = (
         SELECT k.id
           FROM public.meals k
          WHERE k.user_id   = (SELECT m.user_id   FROM public.meals m WHERE m.id = mi.meal_id)
            AND k.meal_date = (SELECT m.meal_date FROM public.meals m WHERE m.id = mi.meal_id)
            AND k.meal_type = (SELECT m.meal_type FROM public.meals m WHERE m.id = mi.meal_id)
          ORDER BY k.created_at, k.id
          LIMIT 1
       )
 WHERE mi.meal_id IN (
         SELECT dup.id
           FROM public.meals dup
           JOIN public.meals oldest
             ON oldest.user_id   = dup.user_id
            AND oldest.meal_date = dup.meal_date
            AND oldest.meal_type = dup.meal_type
            AND (oldest.created_at, oldest.id) < (dup.created_at, dup.id)
       );

-- 2) Deleta as refeições duplicadas, mantendo a mais antiga por grupo.
DELETE FROM public.meals m
 USING public.meals older
 WHERE older.user_id   = m.user_id
   AND older.meal_date = m.meal_date
   AND older.meal_type = m.meal_type
   AND (older.created_at, older.id) < (m.created_at, m.id);

-- 3) Deduplica itens EXATAMENTE idênticos dentro da mesma refeição.
DELETE FROM public.meal_items newer
 USING public.meal_items older
 WHERE older.meal_id  = newer.meal_id
   AND older.grams    = newer.grams
   AND older.calories = newer.calories
   AND older.protein_g = newer.protein_g
   AND older.carbs_g   = newer.carbs_g
   AND older.fat_g     = newer.fat_g
   AND COALESCE(older.name, '') = COALESCE(newer.name, '')
   AND older.id < newer.id;

-- 4) Index UNIQUE — a proteção definitiva contra refeições duplicadas.
-- O índice antigo meals_user_date_idx (user_id, meal_date DESC) torna-se
-- redundante: (user_id, meal_date, meal_type) cobre os mesmos acessos.
DROP INDEX IF EXISTS public.meals_user_date_idx;
CREATE UNIQUE INDEX IF NOT EXISTS meals_user_date_type_uniq
  ON public.meals(user_id, meal_date, meal_type);