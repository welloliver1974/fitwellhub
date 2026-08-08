-- Migration: 20260808130000_add_goal_auto.sql
-- Marca se a meta de calorias/macros é GERENCIADA automaticamente pelo app
-- (sincronizada com o TDEE atual) ou FOI EDITADA MANUALMENTE pelo usuário.
--
-- DEPOIS desta migration, o app:
--   - grava goal_auto = TRUE quando regrava a meta a partir da sugestão
--     (TDEE) — seja no 1º acesso (meta padrão do signup) seja na sync
--     automática quando a sugestão muda;
--   - grava goal_auto = FALSE quando o usuário edita em "Metas" e salva
--     com valores DIFERENTES da sugestão — aí o app nunca mais mexe sozinho.
--
-- DEFAULT FALSE preserva as metas JÁ gravadas: o que foi editado à mão
-- continua manual; o que ainda é o padrão de registro é detectado no 1º
-- acesso do novo build e marcado automático ali.

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS goal_auto BOOLEAN NOT NULL DEFAULT FALSE;