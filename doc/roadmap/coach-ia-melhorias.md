# FitWellHub — Roadmap de Melhorias do Coach IA

> Documento gerado em 2026-08-08. Serve como referência de contexto completo para qualquer agente ou desenvolvedor que continue o trabalho neste projeto.

---

## 1. Contexto: o que o app é

FitWellHub é um app de fitness e nutrição construído com:
- **Framework**: TanStack Start (React + Vite + SSR)
- **Banco**: Supabase (PostgreSQL)
- **IA**: multi-provider (Groq, OpenRouter, OmniRoute, NVIDIA) — chaves configuradas pelo usuário
- **Estilização**: Tailwind CSS v4 + shadcn/ui (Radix primitives)
- **Testes**: Vitest + Testing Library

### Rotas principais
| Rota | Arquivo | Função |
|---|---|---|
| `/app` | `src/routes/app.index.tsx` | Home — totais do dia, progresso de metas |
| `/app/nutricao` | `src/routes/app.nutricao.tsx` | Registro de refeições e busca de alimentos |
| `/app/treinos` | `src/routes/app.treinos.*.tsx` | Treinos e sessões com cargas |
| `/app/corpo` | `src/routes/app.corpo.tsx` | TDEE, medidas corporais, peso |
| `/app/metas` | `src/routes/app.metas.tsx` → `src/components/goals-page.tsx` | Metas diárias de macros |
| `/app/coach` | `src/routes/app.coach.tsx` | Análise semanal gerada pela IA |
| `/app/chat` | `src/routes/app.chat.tsx` | Chat livre com o Coach IA |
| `/app/ia` | `src/routes/app.ia.tsx` | Configurações de provedores de IA |

### Arquitetura da IA
```
src/server-fns/
  ai-settings.functions.ts   — resolução de provider/key/model
  nutrition.functions.ts     — lookupNutrition, analyzePhoto, coachAdvice
  chat.functions.ts          — sendChat, fetchUserContext, executeRecordMeal
  corpo.functions.ts         — calculateTdee

src/lib/
  coach-plan.ts              — lógica pura: inferCoachObjective, buildCoachPlan,
                               confidenceFromStats, nextActionFromStats
  nutrition-goals.ts         — suggestGoals, matchesSuggestion, isDefaultGoals,
                               DEFAULT_PROTEIN_FACTOR, shouldAutoUpdateGoal
```

---

## 2. O que foi implementado na última sessão (2026-08-08)

### Feature 1: Meta de proteína configurável por estratégia

**Motivação**: A meta de proteína sugerida era fixa em `2 g/kg`. O usuário não podia escolher a estratégia sem editar os campos manualmente.

**Arquivos alterados**:
- `supabase/migrations/20260808190000_add_goal_protein_factor.sql`: Adiciona coluna `protein_factor NUMERIC NOT NULL DEFAULT 2.0`.
- `src/lib/nutrition-goals.ts`: Exporta `DEFAULT_PROTEIN_FACTOR = 2`, aceita `proteinFactor` em `suggestGoals` e `matchesSuggestion`.
- `src/components/goals-page.tsx`: Seletor de estratégia com 5 opções (Conservador 1.6, Moderado 1.8, Padrão 2.0, Agressivo 2.2, Manual) com recálculo automático.
- `src/routes/app.index.tsx`: Sincronização automática com `protein_factor`.

---

### Feature 2: Integração da estratégia de proteína e snapshot diário no Coach IA ✅ (CONCLUÍDO)

**Motivação**: O Coach IA não tinha acesso ao `protein_factor` nem aos totais consumidos no dia atual.

**Implementações feitas**:
1. **Coach com Fator de Proteína** (`src/routes/app.coach.tsx` & `src/server-fns/nutrition.functions.ts`):
   - Adicionado `protein_factor` na query de metas do Coach.
   - Incluído `Estratégia de proteína: X g/kg` no resumo e no payload `goals`.
   - Updated `coachSchema` com `protein_factor?: number`.

2. **Snapshot "Consumido Hoje" no Chat** (`src/server-fns/chat.functions.ts`):
   - O Chat injeta no topo do contexto um resumo do dia atual (Calorias consumidas/meta, %, Proteína, Carbo, Gordura e Água).

3. **System Prompt Dinâmico por Objetivo** (`src/server-fns/nutrition.functions.ts`):
   - Prompt do sistema ajustado dinamicamente de acordo com o objetivo selecionado (Emagrecimento, Hipertrofia, Recomposição, Manutenção).

4. **Inferência de Objetivo Ajustada** (`src/lib/coach-plan.ts` & `src/lib/coach-plan.test.ts`):
   - `inferCoachObjective` atualizada para verificar `protein_factor` mantendo fallback retrocompatível com `protein_g`.

---

## 4. Backlog priorizado

| # | Item | Arquivos afetados | Esforço | Impacto | Status |
|---|---|---|---|---|---|
| 1 | Passar `protein_factor` no contexto do Coach semanal | `app.coach.tsx`, `nutrition.functions.ts` | XS | 🔴 Alto | ✅ Concluído |
| 2 | Injetar snapshot "hoje" no Chat | `chat.functions.ts` | XS | 🔴 Alto | ✅ Concluído |
| 3 | System prompt dinâmico do Coach | `nutrition.functions.ts` | S | 🟡 Médio | ✅ Concluído |
| 4 | `inferCoachObjective` usar `protein_factor` | `coach-plan.ts`, `coach-plan.test.ts` | S | 🟡 Médio | ✅ Concluído |
| 5 | Coach semanal ler medidas corporais + extrair `format-measurements.ts` | `app.coach.tsx`, `chat.functions.ts` | M | 🟡 Médio | ⏳ Pendente |
| 6 | `buildCoachPlan` gerado pela IA via structured output | `nutrition.functions.ts`, `coach-plan.ts` | L | 🔴 Alto | ⏳ Pendente |

---

## 5. Contexto técnico para qualquer agente

### Como rodar os testes
```powershell
npx vitest run                                              # todos
npx vitest run src/lib/coach-plan.test.ts                  # lógica do Coach
npx vitest run src/components/goals-page.component.test.tsx # tela de metas
```

### Radix Select em testes jsdom — mocks obrigatórios
```ts
// Deve estar no topo do arquivo de teste, ANTES dos imports de componentes
if (typeof window !== "undefined") {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
```
Já implementado em `src/components/goals-page.component.test.tsx`.

### Como a IA é chamada
Toda chamada passa por `callAiChatCompletion` em `src/server-fns/ai-settings.functions.ts`.
Server functions usam `createServerFn` do TanStack Start — rodam no servidor (Cloudflare Workers ou Node), nunca no browser.

### Tabela `goals` — colunas relevantes
```sql
calories        INTEGER
protein_g       INTEGER
carbs_g         INTEGER
fat_g           INTEGER
goal_auto       BOOLEAN  -- true = sincroniza automaticamente com TDEE
protein_factor  NUMERIC  -- novo (2026-08-08), default 2.0
user_id         UUID     -- primary key / unique constraint
```

### Constantes e defaults
- `DEFAULT_PROTEIN_FACTOR = 2` em `src/lib/nutrition-goals.ts`
- Valores de estratégia predefinidos: `1.6`, `1.8`, `2.0`, `2.2`
- Upserts sempre com `{ onConflict: "user_id" }`

### Convenções
- **Shell Windows**: usar `;` como separador (não `&&`)
- **Commits**: em português, descritivos
- **Strings para IA**: evitar acentos em prompts hardcoded (alguns providers cortam UTF-8)
- **Testes de componente**: `*.component.test.tsx`; testes de lib pura: `*.test.ts`
- **Auth**: todas as server functions usam `.middleware([requireSupabaseAuth])`
