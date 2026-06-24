-- Migration: 20260623000002_bioimpedance_logs.sql
-- Create bioimpedance_logs table for tracking bioimpedance history

CREATE TABLE public.bioimpedance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC(5,1),
  body_fat_pct NUMERIC(4,1),
  muscle_mass_kg NUMERIC(5,1),
  bone_mass_kg NUMERIC(4,1),
  body_water_pct NUMERIC(4,1),
  visceral_fat NUMERIC(3,1),
  bmr_machine NUMERIC(6,0),
  metabolic_age INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bioimpedance_logs ENABLE ROW LEVEL SECURITY;

-- Policy: own bioimpedance all
CREATE POLICY "own bioimpedance all" ON public.bioimpedance_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Index for optimized queries
CREATE INDEX bioimpedance_user_date_idx ON public.bioimpedance_logs(user_id, log_date DESC);
