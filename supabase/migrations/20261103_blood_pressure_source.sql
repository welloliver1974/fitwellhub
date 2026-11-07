-- ==============================================================================
-- FitWell Hub: Origem da aferição de pressão arterial
-- Data: 03/11/2026
--
-- A Samsung Health NÃO exporta pressão arterial para o Health Connect em
-- diversas versões de firmware (ao contrário de SpO2, sono e FC). Para não
-- depender disso, o FitWellHub passa a permitir registro manual.
-- Esta coluna distingue a origem do valor exibido no card.
-- ==============================================================================

ALTER TABLE public.daily_health_metrics
    ADD COLUMN IF NOT EXISTS blood_pressure_source TEXT DEFAULT 'health_connect';

UPDATE public.daily_health_metrics
   SET blood_pressure_source = 'health_connect'
 WHERE blood_pressure_systolic IS NOT NULL
   AND blood_pressure_source IS NULL;

COMMENT ON COLUMN public.daily_health_metrics.blood_pressure_source IS
    'Origem da aferição de pressão: health_connect (Galaxy Watch) ou manual (digitada no app/Hermes)';
