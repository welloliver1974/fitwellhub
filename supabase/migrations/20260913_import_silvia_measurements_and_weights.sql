-- ==============================================================================
-- FitWell Hub: Importação de Histórico de Medidas e Peso da Silvia (silvinhamsa@gmail.com)
-- Origem: AppControleTotal
-- Total de Pesos: 21 registros (2026-02-22 a 2026-09-04)
-- Total de Medidas: 234 registros (2026-03-30 a 2026-09-04)
-- ==============================================================================

DO $$
DECLARE
  v_user_id uuid;
  v_weights_count int := 0;
  v_meas_count int := 0;
BEGIN
  -- 1. Localizar o ID da usuária pelo email
  SELECT id INTO v_user_id 
  FROM auth.users 
  WHERE lower(email) = 'silvinhamsa@gmail.com' 
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário com email silvinhamsa@gmail.com não foi encontrado no banco de dados. Certifique-se de que a conta já foi criada/cadastrada no FitWell Hub.';
  END IF;

  RAISE NOTICE 'Usuária encontrada! UUID: %', v_user_id;

  -- 2. Atualizar altura no perfil (se ainda não configurada)
  UPDATE public.profiles
  SET height_cm = 165
  WHERE id = v_user_id AND (height_cm IS NULL OR height_cm = 0);

  -- 3. Inserir histórico de pesos (21 registros)
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-02-22', 80.8
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-02-22'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-03-30', 73.8
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-03-30'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-04-12', 71.7
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-04-12'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-04-26', 71.3
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-04-26'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-05-10', 69.8
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-05-10'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-05-17', 68.8
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-05-17'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-05-24', 68.8
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-05-24'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-05-31', 67.85
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-05-31'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-06-07', 67.4
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-06-07'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-06-14', 67.1
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-06-14'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-06-21', 66.6
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-06-21'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-06-28', 66.6
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-06-28'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-07-12', 66.2
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-07-12'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-07-19', 65.8
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-07-19'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-07-26', 65.8
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-07-26'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-08-02', 65.8
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-08-02'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-08-09', 66
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-08-09'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-08-16', 67
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-08-16'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-08-24', 66.3
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-08-24'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-08-30', 66.3
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-08-30'
  );
  INSERT INTO public.body_weights (user_id, log_date, weight_kg)
  SELECT v_user_id, '2026-09-04', 66.3
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_weights 
    WHERE user_id = v_user_id AND log_date = '2026-09-04'
  );

  -- 4. Inserir histórico de medidas (234 registros)
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Antebraço Esquerdo', 27
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Braço Direito', 32
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Braço Esquerdo', 33
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Coxa Direita', 58
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Coxa Esquerda', 58.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Panturrilha Direita', 41.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Panturrilha Esquerda', 40
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Cintura', 85
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Costas', 87
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Ombros', 37
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-03-30', 'Quadril', 108
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-03-30' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Antebraço Esquerdo', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Braço Direito', 34
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Braço Esquerdo', 33
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Coxa Direita', 59
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Coxa Esquerda', 59
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Panturrilha Direita', 36
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Panturrilha Esquerda', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Cintura', 81
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Costas', 88
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Ombros', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-12', 'Quadril', 105
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-12' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Antebraço Direito', 26.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Antebraço Esquerdo', 27.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Braço Direito', 33
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Braço Esquerdo', 33.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Coxa Direita', 58.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Coxa Esquerda', 59
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Panturrilha Direita', 40.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Panturrilha Esquerda', 40
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Cintura', 79
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Costas', 89.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Ombros', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-04-26', 'Quadril', 104
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-04-26' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Antebraço Direito', 27
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Antebraço Esquerdo', 27
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Braço Direito', 33
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Braço Esquerdo', 33
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Coxa Direita', 59
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Coxa Esquerda', 60
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Panturrilha Direita', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Panturrilha Esquerda', 40
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Cintura', 81
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Costas', 90
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Ombros', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-10', 'Quadril', 104
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-10' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Antebraço Esquerdo', 27
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Braço Direito', 33
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Braço Esquerdo', 32
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Coxa Direita', 60
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Coxa Esquerda', 59
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Panturrilha Direita', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Panturrilha Esquerda', 40
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Cintura', 81.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Costas', 88.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Ombros', 38.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-17', 'Quadril', 101.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-17' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Antebraço Direito', 25
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Antebraço Esquerdo', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Braço Direito', 33.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Braço Esquerdo', 32.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Coxa Direita', 59.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Coxa Esquerda', 60
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Panturrilha Direita', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Panturrilha Esquerda', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Cintura', 80
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Costas', 88.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Ombros', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-24', 'Quadril', 100.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-24' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Antebraço Esquerdo', 26.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Braço Direito', 32.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Braço Esquerdo', 32.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Coxa Direita', 59.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Coxa Esquerda', 60.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Panturrilha Direita', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Panturrilha Esquerda', 39.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Cintura', 79.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Costas', 88.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Ombros', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-05-31', 'Quadril', 103.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-05-31' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Antebraço Esquerdo', 26.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Braço Direito', 33
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Braço Esquerdo', 32
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Coxa Direita', 60
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Coxa Esquerda', 61
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Panturrilha Direita', 38.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Panturrilha Esquerda', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Cintura', 78
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Costas', 90
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Ombros', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-07', 'Quadril', 102
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-07' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Antebraço Esquerdo', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Braço Direito', 32
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Braço Esquerdo', 31.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Coxa Direita', 58.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Coxa Esquerda', 59
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Panturrilha Direita', 37
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Panturrilha Esquerda', 36.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Cintura', 77
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Costas', 87
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Ombros', 40
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-14', 'Quadril', 100.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-14' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Antebraço Esquerdo', 26.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Braço Direito', 32.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Braço Esquerdo', 32
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Coxa Direita', 61.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Coxa Esquerda', 59.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Panturrilha Direita', 38.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Panturrilha Esquerda', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Cintura', 80.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Costas', 88.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Ombros', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-21', 'Quadril', 100.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-21' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Antebraço Direito', 25.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Antebraço Esquerdo', 26.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Braço Direito', 33
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Braço Esquerdo', 31.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Coxa Direita', 58.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Coxa Esquerda', 60
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Panturrilha Direita', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Panturrilha Esquerda', 39.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Cintura', 79
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Costas', 91
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Ombros', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-06-28', 'Quadril', 100
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-06-28' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Antebraço Direito', 25.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Antebraço Esquerdo', 26.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Braço Direito', 31.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Braço Esquerdo', 30.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Coxa Direita', 57
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Coxa Esquerda', 59
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Panturrilha Direita', 36.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Panturrilha Esquerda', 38.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Cintura', 75.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Costas', 90
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Ombros', 40
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-12', 'Quadril', 100.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-12' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Antebraço Esquerdo', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Braço Direito', 31.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Braço Esquerdo', 31
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Coxa Direita', 56.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Coxa Esquerda', 57
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Panturrilha Direita', 37
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Panturrilha Esquerda', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Cintura', 76
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Costas', 88
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Ombros', 40
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-19', 'Quadril', 99
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-19' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-26', 'Antebraço Direito', 25.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-26' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-26', 'Antebraço Esquerdo', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-26' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-26', 'Braço Direito', 32
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-26' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-26', 'Braço Esquerdo', 31
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-26' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-26', 'Coxa Direita', 59
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-26' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-26', 'Coxa Esquerda', 58
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-26' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-26', 'Panturrilha Direita', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-26' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-26', 'Panturrilha Esquerda', 38.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-26' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-26', 'Cintura', 76
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-26' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-26', 'Costas', 89
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-26' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-07-26', 'Ombros', 40
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-07-26' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Antebraço Esquerdo', 26.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Braço Direito', 32
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Braço Esquerdo', 31
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Coxa Direita', 60
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Coxa Esquerda', 58.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Panturrilha Direita', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Panturrilha Esquerda', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Cintura', 81
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Costas', 90
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Ombros', 37
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Ombros'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-02', 'Quadril', 100
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-02' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-09', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-09' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-09', 'Antebraço Esquerdo', 26.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-09' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-09', 'Braço Direito', 32
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-09' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-09', 'Braço Esquerdo', 31
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-09' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-09', 'Coxa Direita', 59
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-09' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-09', 'Coxa Esquerda', 59
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-09' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-09', 'Panturrilha Direita', 38
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-09' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-09', 'Panturrilha Esquerda', 38.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-09' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-09', 'Cintura', 78
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-09' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-09', 'Costas', 89
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-09' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-09', 'Quadril', 100.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-09' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-16', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-16' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-16', 'Antebraço Esquerdo', 26.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-16' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-16', 'Braço Direito', 32
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-16' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-16', 'Braço Esquerdo', 31
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-16' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-16', 'Coxa Direita', 61.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-16' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-16', 'Coxa Esquerda', 60
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-16' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-16', 'Panturrilha Direita', 37.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-16' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-16', 'Panturrilha Esquerda', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-16' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-16', 'Cintura', 78
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-16' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-16', 'Costas', 88
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-16' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-16', 'Quadril', 99.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-16' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-24', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-24' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-24', 'Antebraço Esquerdo', 26.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-24' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-24', 'Braço Direito', 32.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-24' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-24', 'Braço Esquerdo', 31.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-24' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-24', 'Coxa Direita', 60
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-24' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-24', 'Coxa Esquerda', 49.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-24' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-24', 'Panturrilha Direita', 38.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-24' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-24', 'Panturrilha Esquerda', 39.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-24' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-24', 'Cintura', 76.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-24' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-24', 'Costas', 90
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-24' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-24', 'Quadril', 100
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-24' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-30', 'Antebraço Direito', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-30' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-30', 'Antebraço Esquerdo', 26.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-30' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-30', 'Braço Direito', 32.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-30' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-30', 'Braço Esquerdo', 30.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-30' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-30', 'Coxa Direita', 59
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-30' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-30', 'Coxa Esquerda', 58
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-30' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-30', 'Panturrilha Direita', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-30' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-30', 'Panturrilha Esquerda', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-30' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-30', 'Cintura', 77
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-30' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-30', 'Costas', 90.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-30' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-08-30', 'Quadril', 100
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-08-30' AND label = 'Quadril'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-09-04', 'Antebraço Direito', 25
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-09-04' AND label = 'Antebraço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-09-04', 'Antebraço Esquerdo', 26
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-09-04' AND label = 'Antebraço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-09-04', 'Braço Direito', 31
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-09-04' AND label = 'Braço Direito'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-09-04', 'Braço Esquerdo', 31.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-09-04' AND label = 'Braço Esquerdo'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-09-04', 'Coxa Direita', 56
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-09-04' AND label = 'Coxa Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-09-04', 'Coxa Esquerda', 58
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-09-04' AND label = 'Coxa Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-09-04', 'Panturrilha Direita', 39
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-09-04' AND label = 'Panturrilha Direita'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-09-04', 'Panturrilha Esquerda', 39.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-09-04' AND label = 'Panturrilha Esquerda'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-09-04', 'Cintura', 75
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-09-04' AND label = 'Cintura'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-09-04', 'Costas', 98
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-09-04' AND label = 'Costas'
  );
  INSERT INTO public.body_measurements (user_id, log_date, label, value_cm)
  SELECT v_user_id, '2026-09-04', 'Quadril', 100.5
  WHERE NOT EXISTS (
    SELECT 1 FROM public.body_measurements 
    WHERE user_id = v_user_id AND log_date = '2026-09-04' AND label = 'Quadril'
  );

  SELECT count(*) INTO v_weights_count FROM public.body_weights WHERE user_id = v_user_id;
  SELECT count(*) INTO v_meas_count FROM public.body_measurements WHERE user_id = v_user_id;

  RAISE NOTICE 'Importação concluída com sucesso!';
  RAISE NOTICE 'Total de pesos agora no perfil: %', v_weights_count;
  RAISE NOTICE 'Total de medidas agora no perfil: %', v_meas_count;
END $$;
