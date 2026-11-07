# AGENTS.md — FitWellHub

> Este é o web app do projeto. A documentação mestra (o que é o sistema inteiro, arquitetura, banco de dados, armadilhas e decisões) está em:
>
> **`E:\Apps\health-sync-clone\AGENTS.md`**
>
> Leia aquele arquivo primeiro. Este aqui cobre apenas o que é específico do web app.

---

## O que é

Aplicação full-stack para acompanhamento de **treinos, nutrição e medidas corporais** com IA.

- **Stack:** React 19, TanStack Start (full-stack), Tailwind CSS v4, shadcn/ui, Recharts, Supabase (PostgreSQL + Auth + RLS), Cloudflare Workers.
- **Deploy:** `https://fitwellhub.welloliver.workers.dev`

## Build e deploy

```powershell
cd E:\Apps\fitwell\fitwellhub
npm run build
cd dist\server
npx wrangler deploy --config E:\Apps\fitwell\fitwellhub\dist\server\wrangler.json
```

> ⚠️ O `wrangler.jsonc` da raiz aponta para o entry virtual `@tanstack/react-start/server-entry` e **falha**. O deploy precisa rodar de dentro de `dist/server` com o `wrangler.json` gerado pelo build. `git push` não publica.

## Navegação

Hoje, Treinos, Nutrição, Medidas, Corpo, Coach e Config (`src/routes/app.tsx`).

## Dados do Galaxy Watch / Samsung Health

O app **não lê** o relógio. Ele apenas exibe o que o **FitWell Bridge** (app Android em `E:\Apps\health-sync-clone\android-bridge`) grava no Supabase.

| Componente | Papel |
|---|---|
| `src/components/watch-vitals-summary.tsx` | Card compacto da Home (Sono, FC, SpO2, Pressão). Não renderiza sem dados. |
| `src/components/watch-mirror-card.tsx` | Card completo, na aba **Sinais Vitais** de Corpo. |
| `src/routes/app.corpo.tsx` | Abas Dados, Bioimpedância e Sinais Vitais. `?tab=vitals` abre direto na última. |

Tabelas lidas: `daily_health_metrics`, `watch_workouts`, `bioimpedance_logs`, `body_weights`.

> ⚠️ Em `watch_workouts`, a rota do Health Connect grava `source = 'galaxy_watch'`, **não** `'health_connect'`. Filtros pelo valor errado não retornam nada.

## Armadilhas

- **Erros antigos no `tsc` global** (`BarcodeScanner.tsx`, `charts/*`, `telegram.functions.ts`). Filtre pelos arquivos alterados antes de concluir que algo quebrou.
- **`validateSearch` do TanStack Router:** tipar uma chave como obrigatória faz todos os `<Link>` existentes exigirem `search`. Use opcional (`{ tab?: string }`).
- **SQL Editor do Supabase** mostra apenas o resultado do último `SELECT`.

## Regras

- **Responder em português.**
- **Diagnosticar antes de mudar código.**
- **Não alterar layout sem aprovação.**
- **Nunca prometer estresse ou ECG da Samsung** — não existem no Health Connect.
- **Registrar toda alteração** em `doc/changelog/AGENTS.md`.
