-- ==============================================================================
-- FitWell Hub: Adicionar Oxigenação (SpO2) e Pressão Arterial em daily_health_metrics
-- Data: 03/11/2026
-- ==============================================================================

ALTER TABLE public.daily_health_metrics
    ADD COLUMN IF NOT EXISTS spo2_percentage NUMERIC(4, 1),
    ADD COLUMN IF NOT EXISTS spo2_min_percentage NUMERIC(4, 1),
    ADD COLUMN IF NOT EXISTS blood_pressure_systolic INTEGER,
    ADD COLUMN IF NOT EXISTS blood_pressure_diastolic INTEGER,
    ADD COLUMN IF NOT EXISTS blood_pressure_time TIMESTAMPTZ;

COMMENT ON COLUMN public.daily_health_metrics.spo2_percentage IS 'Última saturação de oxigênio no sangue (SpO2) aferida no dia em %';
COMMENT ON COLUMN public.daily_health_metrics.spo2_min_percentage IS 'Saturação mínima de oxigênio (SpO2) registrada no dia/sono em %';
COMMENT ON COLUMN public.daily_health_metrics.blood_pressure_systolic IS 'Pressão arterial sistólica em mmHg (ex: 120)';
COMMENT ON COLUMN public.daily_health_metrics.blood_pressure_diastolic IS 'Pressão arterial diastólica em mmHg (ex: 80)';
COMMENT ON COLUMN public.daily_health_metrics.blood_pressure_time IS 'Data e hora da medição da pressão arterial';
