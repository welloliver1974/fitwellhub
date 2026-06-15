# FitWell Hub

Aplicação full-stack para acompanhamento de **treinos, nutrição e medidas corporais** com inteligência artificial.

## Funcionalidades

- **Treinos**: Criação de fichas de treino (templates), execução com modo foco, histórico de sessões realizadas, progressão de carga e duplicação de treinos.
- **Nutrição**: Registro de refeições com busca no Open Food Facts, leitura de código de barras, análise de foto do prato via IA, receitas e metas nutricionais.
- **Medidas Corporais**: Registro e gráficos de evolução de medidas (cintura, braços, coxas etc.) com análise do Coach IA.
- **Peso**: Acompanhamento de peso corporal com gráfico histórico.
- **Coach IA**: Assistente conversacional com IA (Groq LLaMA 3.3 70B) que analisa treinos, medidas e nutrição, além de registrar refeições e treinos por comando de voz/texto.
- **Relatórios PDF**: Exportação de relatório completo de progresso.
- **Lembretes**: Configuração de notificações para água, refeições e treinos.
- **Catálogo de Exercícios**: Base pré-definida com 30 exercícios e busca inteligente.

## Tecnologias

- **Frontend**: React 19, TanStack Start (full-stack), Tailwind CSS v4, shadcn/ui, Recharts
- **Backend**: Supabase (PostgreSQL, Auth, RLS), Cloudflare Workers
- **IA**: Groq API (LLaMA 3.3 70B), OpenRouter (Qwen VL 72B para análise de fotos)
- **Dados Nutricionais**: Open Food Facts API
- **Build**: Vite, TypeScript 5.8

## Estrutura

```
src/
├── routes/          # Páginas e layouts (file-based routing)
├── components/      # Componentes reutilizáveis (shadcn/ui + BarcodeScanner)
├── server-fns/      # Server functions (nutrição, chat, medidas)
├── integrations/    # Clientes Supabase e Lovable
├── hooks/           # Hooks customizados
└── lib/             # Contextos de autenticação e tema
supabase/
├── migrations/      # Migrações SQL do banco
└── schema_completo.sql
```

## Deploy

Hospedado como Cloudflare Worker. Build com `npm run build` e deploy via Wrangler.
