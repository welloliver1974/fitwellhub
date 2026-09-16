-- ==============================================================================
-- FitWell Hub: Vincular Telegram da Silvia ao FitWell Hub
-- Email: silvinhamsa@gmail.com
-- Telegram Chat ID: 8927954331
-- ==============================================================================

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- 1. Localizar o ID da Silvia pelo email
  SELECT id INTO v_user_id 
  FROM auth.users 
  WHERE lower(email) = 'silvinhamsa@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuária silvinhamsa@gmail.com não encontrada em auth.users. Certifique-se de que a conta existe.';
  END IF;

  -- 2. Inserir ou atualizar a integração com o Telegram
  INSERT INTO public.telegram_integrations (user_id, telegram_chat_id, updated_at)
  VALUES (v_user_id, 8927954331, NOW())
  ON CONFLICT (user_id) DO UPDATE 
  SET telegram_chat_id = EXCLUDED.telegram_chat_id,
      updated_at = NOW();

  RAISE NOTICE 'Sucesso! Telegram Chat ID 8927954331 vinculado à Silvia (UUID: %)', v_user_id;
END $$;
