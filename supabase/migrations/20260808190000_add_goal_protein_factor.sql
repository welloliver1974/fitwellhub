-- Keeps automatic nutrition goals configurable while preserving the current
-- default of 2.0 g/kg protein.
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS protein_factor NUMERIC NOT NULL DEFAULT 2.0;
