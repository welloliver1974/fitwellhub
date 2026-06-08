CREATE TABLE IF NOT EXISTS public.exercise_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exercise_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_catalog_select" ON public.exercise_catalog
  FOR SELECT TO authenticated
  USING (true);

INSERT INTO public.exercise_catalog (name) VALUES
  ('Agachamento hack'),
  ('Cadeira abdutora'),
  ('Cadeira extensora'),
  ('Crucifixo máquina'),
  ('Crucifixo máquina invertido'),
  ('Crossover'),
  ('Desenvolvimento na máquina'),
  ('Elevação frontal com halteres'),
  ('Elevação lateral'),
  ('Elevação lateral no cross'),
  ('Extensão lombar (superman)'),
  ('Facepull polia alta'),
  ('Flexora em pé'),
  ('Leg press 45º'),
  ('Mesa flexora'),
  ('Panturrilha na maquina'),
  ('Pulley aberto frente'),
  ('Pulley fechado pegada supinada'),
  ('Remada curvada maquina'),
  ('Remada fechada máquina'),
  ('Rosca alternada'),
  ('Rosca direta crossover'),
  ('Rosca direta na barra h'),
  ('Supino declinado barra'),
  ('Supino inclinado articulado'),
  ('Supino reto com halteres'),
  ('Tríceps coice unilateral'),
  ('Tríceps corda crossover'),
  ('Tríceps francês')
ON CONFLICT (name) DO NOTHING;
