-- Biblioteca pessoal de alimentos do usuario (separada de favorite_foods).
-- Macros (calories/protein_g/carbs_g/fat_g) referem-se `grams` (default 100).
-- Ao adicionar a uma refeicao, recalcula proporcionalmente aos gramas digitados.
CREATE TABLE public.food_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  grams numeric NOT NULL DEFAULT 100,
  calories numeric NOT NULL DEFAULT 0,
  protein_g numeric NOT NULL DEFAULT 0,
  carbs_g numeric NOT NULL DEFAULT 0,
  fat_g numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.food_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own food_library all" ON public.food_library
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_food_library_user ON public.food_library(user_id);
