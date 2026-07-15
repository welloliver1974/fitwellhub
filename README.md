# FitWell Hub

Aplicação full-stack para acompanhamento de **treinos, nutrição e medidas corporais** com inteligência artificial.

## Funcionalidades

- **Treinos**: Criação de fichas de treino (templates), execução com modo foco, histórico de sessões realizadas, progressão de carga e duplicação de treinos.
- **Nutrição**: Registro de refeições com busca no Open Food Facts, leitura de código de barras (câmera nativa + BarcodeDetector API), análise de foto do prato via IA (OpenRouter Qwen VL), receitas e metas nutricionais.
- **Medidas Corporais**: Registro e gráficos de evolução de medidas (cintura, braços, coxas etc.) com análise do Coach IA e comparador IA entre datas.
- **Bioimpedância / Perfil Corporal**: Perfil com dados pessoais (sexo, altura, nascimento), cálculo de TMB/TDEE (Mifflin-St Jeor), scanner de laudo de bioimpedância por foto com IA Vision, gráficos evolutivos e diagnóstico IA.
- **Peso**: Acompanhamento de peso corporal com gráfico histórico.
- **Coach IA (Chat)**: Assistente conversacional com IA (Groq LLaMA 3.3 70B / OpenRouter) que analisa treinos, medidas e nutrição, registra refeições e treinos por comando de voz/texto, com suporte a imagens anexadas.
- **Coach IA (Análise Semanal)**: Geração de análise estruturada da última semana com nível de confiança, próximas ações, plano de treino/nutrição e checklist.
- **Relatórios PDF**: Exportação de relatório completo de progresso.
- **Lembretes**: Configuração de notificações para água, refeições e treinos.
- **Catálogo de Exercícios**: Base pré-definida com 30 exercícios e busca inteligente.
- **Metas Nutricionais**: Configuração de metas de calorias, proteínas, carboidratos e gorduras.
- **Receitas**: Criação e gerenciamento de receitas com cálculo de macros por porção.
- **Tela de IA**: Configuração do provedor de IA (Groq, OpenRouter, OmniRoute) e chaves de API diretamente pelo app.

## Tecnologias

- **Frontend**: React 19, TanStack Start (full-stack), Tailwind CSS v4, shadcn/ui, Recharts
- **Backend**: Supabase (PostgreSQL, Auth, RLS), Cloudflare Workers
- **IA**: Groq API (LLaMA 3.3 70B), OpenRouter (Qwen VL 72B para análise de fotos), OmniRoute
- **Dados Nutricionais**: Open Food Facts API
- **Scanner**: BarcodeDetector API nativa (Chrome Android 85+)
- **Build**: Vite, TypeScript 5.8

## Estrutura

```
src/
├── routes/              # Páginas e layouts (file-based routing)
│   ├── app.tsx          # Layout principal com navegação inferior
│   ├── app.index.tsx    # Dashboard (Hoje)
│   ├── app.treinos/     # Treinos, modo foco
│   ├── app.templates/   # Templates de treino
│   ├── app.nutricao.tsx # Nutrição com scanner
│   ├── app.nutricao-historico.tsx
│   ├── app.medidas.tsx  # Medidas corporais
│   ├── app.corpo.tsx    # Perfil corporal e bioimpedância
│   ├── app.peso.tsx     # Acompanhamento de peso
│   ├── app.coach.tsx    # Análise semanal do Coach IA
│   ├── app.chat.tsx     # Chat conversacional com IA
│   ├── app.receitas/    # Receitas
│   ├── app.exercicios.tsx / app.exercicios.$name.tsx
│   ├── app.metas.tsx    # Metas nutricionais
│   ├── app.ia.tsx       # Configuração de IA
│   ├── app.lembretes.tsx
│   └── app.relatorio.tsx # Relatório PDF
├── components/          # Componentes reutilizáveis
│   ├── ui/              # shadcn/ui
│   └── BarcodeScanner.tsx
├── server-fns/          # Server functions
│   ├── chat.functions.ts       # Coach IA conversacional
│   ├── nutrition.functions.ts  # Nutrição, fotos, coach analysis
│   ├── medidas.functions.ts    # Medidas e comparação IA
│   ├── corpo.functions.ts      # Perfil corporal e bioimpedância
│   └── ai-settings.functions.ts # Configuração centralizada de IA
├── integrations/        # Clientes Supabase e Lovable
├── hooks/               # Hooks customizados
└── lib/                 # Utilitários, autenticação, tema
    ├── auth-context.tsx
    ├── theme.tsx
    ├── utils.ts         # getLocalDate(), playBeep(), cn()
    └── use-reminders.tsx
supabase/
├── migrations/          # Migrações SQL do banco (14 migrations)
└── schema_completo.sql
```

## Documentação

A documentação completa está organizada em [doc/](./doc/INDEX.md):

- **[Changelog](./doc/changelog/)** — Histórico de alterações e correções
- **[Roadmap](./doc/roadmap/)** — Melhorias planejadas e status
- **[Planos](./doc/plans/)** — Planos de implementação

## Deploy

Hospedado como Cloudflare Worker. Build com `npm run build` e deploy via Wrangler.

### Secrets de produção (obrigatório configurar no Cloudflare)

As chaves de API não devem estar no `wrangler.jsonc`. Configure-as manualmente:

```bash
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put COACH_ALWAYS_SUGGEST
```

### Arquivos sensíveis

- `.env` — contém chaves de API (não versionado, no `.gitignore`)
- `wrangler.jsonc` — contém apenas variáveis públicas (VITE_)
