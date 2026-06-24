-- Migration: 20260623000001_add_profile_columns.sql
-- Add sex, height_cm, and birth_date columns to profiles table

ALTER TABLE public.profiles ADD COLUMN sex TEXT CHECK (sex IN ('male', 'female'));
ALTER TABLE public.profiles ADD COLUMN height_cm NUMERIC(5,1);
ALTER TABLE public.profiles ADD COLUMN birth_date DATE;
