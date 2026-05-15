-- Add completed column to sets table
ALTER TABLE public.sets ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;
