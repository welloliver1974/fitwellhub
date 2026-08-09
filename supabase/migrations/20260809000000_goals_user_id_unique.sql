-- Fix: "no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- O app faz upsert em `goals` com `{ onConflict: "user_id" }` (artificial `id` é a
-- PK criada pelo schema_completo.sql), mas `user_id` NÃO tem constraint única no
-- banco aplicado, então o ON CONFLICT quebra com o erro acima em home/páginas.
-- Esta migration garante uma única meta por usuário.

-- 1) Elimina eventuais duplicatas (mais de uma linha por user_id), mantendo a
--    linha mais recente (updated_at desc, ctid desc como desempate determinístico).
--    Usa ctid + window function para funcionar em qualquer shape da tabela.
WITH ranked AS (
  SELECT ctid,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY updated_at DESC, ctid DESC
         ) AS rn
  FROM public.goals
)
DELETE FROM public.goals
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

-- 2) Unicidade real para o ON CONFLICT (user_id). Se já existir (ex.: user_id
--    já era PK num banco criado via migrations), o IF NOT EXISTS ignora.
CREATE UNIQUE INDEX IF NOT EXISTS goals_user_id_key ON public.goals(user_id);