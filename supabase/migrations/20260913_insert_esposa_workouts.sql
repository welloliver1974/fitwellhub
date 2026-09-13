-- ==============================================================================
-- Script para cadastrar a divisão A, B, C e D no cadastro da esposa
-- Execute no SQL Editor do Supabase substituindo o email dela abaixo:
-- ==============================================================================

DO $$
DECLARE
  -- >>> SUBSTITUA ABAIXO PELO EMAIL DA SUA ESPOSA CADASTRADO NO FITWELL <<<
  v_target_email TEXT := 'EMAIL_DA_SUA_ESPOSA_AQUI';
  
  v_user_id UUID;
  v_workout_id UUID;
  v_exercise_id UUID;
BEGIN
  -- 1. Localizar o ID da usuária pelo email
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(trim(v_target_email));

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário com o email "%" não foi encontrado no Supabase. Verifique o email digitado.', v_target_email;
  END IF;

  RAISE NOTICE 'Criando treinos A, B, C e D para: % (ID: %)', v_target_email, v_user_id;

  -- =========================================================================
  -- TREINO A (Inferiores / Glúteo & Posterior)
  -- =========================================================================
  INSERT INTO public.workouts (user_id, name, workout_date, notes)
  VALUES (v_user_id, 'Treino A - Inferiores', CURRENT_DATE, '4 séries de 8 a 12 reps + 20-30 min de cardio')
  RETURNING id INTO v_workout_id;

  -- 1. Elevação pélvica
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Elevação pélvica', 1) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 2. Cadeira flexora
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Cadeira flexora', 2) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 3. Stiff
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Stiff', 3) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 4. Flexão de perna em pé
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Flexão de perna em pé', 4) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 5. Cadeira abdutora
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Cadeira abdutora', 5) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 6. Agachamento búlgaro
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Agachamento búlgaro', 6) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 7. Coice no aparelho
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Coice no aparelho', 7) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 8. Cardio
  INSERT INTO public.exercises (workout_id, user_id, name, position, notes) VALUES (v_workout_id, v_user_id, 'Cardio (20 a 30 min)', 8, '20 a 30 minutos de cardio') RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES (v_exercise_id, v_user_id, 1, 1, 0);


  -- =========================================================================
  -- TREINO B (Superiores / Peito, Ombros e Braços)
  -- =========================================================================
  INSERT INTO public.workouts (user_id, name, workout_date, notes)
  VALUES (v_user_id, 'Treino B - Superiores', CURRENT_DATE, '4 séries de 8 a 12 reps + 20-30 min de cardio')
  RETURNING id INTO v_workout_id;

  -- 1. Supino sentado
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Supino sentado', 1) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 2. Crucifixo
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Crucifixo', 2) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 3. Desenvolvimento de ombros
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Desenvolvimento de ombros', 3) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 4. Elevação lateral
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Elevação lateral', 4) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 5. Elevação frontal
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Elevação frontal', 5) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 6. Rosca Bíceps
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Rosca Bíceps', 6) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 7. Rosca martelo
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Rosca martelo', 7) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 8. Tríceps francês
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Tríceps francês', 8) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 9. Tríceps no cross
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Tríceps no cross (corda/barra)', 9) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 10. Elevação de ombros
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Elevação de ombros (encolhimento)', 10) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 11. Cardio
  INSERT INTO public.exercises (workout_id, user_id, name, position, notes) VALUES (v_workout_id, v_user_id, 'Cardio (20 a 30 min)', 11, '20 a 30 minutos de cardio') RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES (v_exercise_id, v_user_id, 1, 1, 0);


  -- =========================================================================
  -- TREINO C (Inferiores / Quadríceps & Panturrilha)
  -- =========================================================================
  INSERT INTO public.workouts (user_id, name, workout_date, notes)
  VALUES (v_user_id, 'Treino C - Quadríceps & Panturrilha', CURRENT_DATE, '4 séries de 8 a 12 reps + 20-30 min de cardio')
  RETURNING id INTO v_workout_id;

  -- 1. Leg press 45º
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Leg press 45º', 1) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 2. Agachamento rack
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Agachamento rack', 2) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 3. Agachamento sumô
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Agachamento sumô', 3) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 4. Cadeira extensora
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Cadeira extensora', 4) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 5. Cadeira adutora
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Cadeira adutora', 5) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 6. Leg press horizontal unilateral e panturrilha
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Leg press horizontal unilateral e panturrilha', 6) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 7. Cardio
  INSERT INTO public.exercises (workout_id, user_id, name, position, notes) VALUES (v_workout_id, v_user_id, 'Cardio (20 a 30 min)', 7, '20 a 30 minutos de cardio') RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES (v_exercise_id, v_user_id, 1, 1, 0);


  -- =========================================================================
  -- TREINO D (Costas & Posterior de Ombro)
  -- =========================================================================
  INSERT INTO public.workouts (user_id, name, workout_date, notes)
  VALUES (v_user_id, 'Treino D - Costas & Ombros', CURRENT_DATE, '4 séries de 8 a 12 reps + 20-30 min de cardio')
  RETURNING id INTO v_workout_id;

  -- 1. Puxada pronada
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Puxada pronada', 1) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 2. Puxada supinada
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Puxada supinada', 2) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 3. Puxada triângulo
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Puxada triângulo', 3) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 4. Remada na polia
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Remada na polia', 4) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 5. Remada curvada
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Remada curvada', 5) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 6. Crucifixo invertido
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Crucifixo invertido', 6) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 7. Serrote
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Serrote (Remada unilateral)', 7) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 8. Pull down no cross
  INSERT INTO public.exercises (workout_id, user_id, name, position) VALUES (v_workout_id, v_user_id, 'Pull down no cross', 8) RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES
    (v_exercise_id, v_user_id, 1, 10, 0), (v_exercise_id, v_user_id, 2, 10, 0), (v_exercise_id, v_user_id, 3, 10, 0), (v_exercise_id, v_user_id, 4, 10, 0);

  -- 9. Cardio
  INSERT INTO public.exercises (workout_id, user_id, name, position, notes) VALUES (v_workout_id, v_user_id, 'Cardio (20 a 30 min)', 9, '20 a 30 minutos de cardio') RETURNING id INTO v_exercise_id;
  INSERT INTO public.sets (exercise_id, user_id, set_number, reps, weight_kg) VALUES (v_exercise_id, v_user_id, 1, 1, 0);

  RAISE NOTICE 'Treinos A, B, C e D criados com sucesso para %!', v_target_email;
END $$;
