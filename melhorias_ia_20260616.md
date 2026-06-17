# Melhorias de IA - 16/06/2026

## O que foi feito

- Criada a tela **IA** para configurar o provedor padrão e colar chaves sem editar `.env`.
- Mantido o visual simples, no mesmo estilo do app.
- Adicionado suporte a:
  - `Groq`
  - `OpenRouter`
  - `OmniRoute` com `endpoint próprio`
- Centralizada a leitura de configuração de IA em uma camada compartilhada.
- Ajustadas as chamadas do:
  - `Coach`
  - `Chat`
  - `Medidas`
  - `Nutrição`
  - `Receitas`
- Build de produção validado com sucesso.

## Arquivos principais

- [Tela de IA](/E:/Apps/fitwell/fitwellhub/src/routes/app.ia.tsx)
- [Camada compartilhada de IA](/E:/Apps/fitwell/fitwellhub/src/server-fns/ai-settings.functions.ts)
- [Menu inferior com acesso à IA](/E:/Apps/fitwell/fitwellhub/src/routes/app.tsx)
- [Configuração do Supabase](/E:/Apps/fitwell/fitwellhub/supabase/migrations/20260616093000_ai_settings.sql)
- [Colunas extras do OmniRoute](/E:/Apps/fitwell/fitwellhub/supabase/migrations/20260616094500_ai_settings_omnroute_columns.sql)

## Observações

- O app continua funcionando com os fluxos antigos de `Groq` e `OpenRouter`.
- O `OmniRoute` usa um `baseUrl` próprio quando preenchido.
- Se o banco não tiver as colunas novas, a tela pode dar erro até aplicar a migration.

## Status

- Pronto para subir no repositório.
- Build conferido.
