-- Descanso configurável por exercício da ficha.
-- Aditivo e retrocompatível: fichas existentes recebem 90 s por padrão.
alter table public.exercises
  add column if not exists rest_seconds integer not null default 90;

-- Sanidade: evita valores absurdos vindos de payloads antigos.
alter table public.exercises
  drop constraint if exists exercises_rest_seconds_check;

alter table public.exercises
  add constraint exercises_rest_seconds_check
  check (rest_seconds between 0 and 900);

comment on column public.exercises.rest_seconds is
  'Descanso entre séries em segundos para este exercício (0 = sem timer, ex.: cardio).';
