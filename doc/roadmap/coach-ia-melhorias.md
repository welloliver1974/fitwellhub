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

### Feature: Meta de proteína configurável por estratégia

**Motivação**: A meta de proteína sugerida era fixa em `2 g/kg`. O usuário não podia escolher a estratégia sem editar os campos manualmente.

**Arquivos alterados**:

#### `supabase/migrations/20260808190000_add_goal_protein_factor.sql` *(novo)*
```sql
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS protein_factor NUMERIC NOT NULL DEFAULT 2.0;
```
> ⚠️ Esta migração precisa ser aplicada com `supabase db push` antes do próximo deploy.

#### `src/lib/nutrition-goals.ts`
- Exporta `DEFAULT_PROTEIN_FACTOR = 2`
- `suggestGoals(tdee, weightKg, proteinFactor = DEFAULT_PROTEIN_FACTOR)` — terceiro argumento opcional
- `matchesSuggestion(g, tdee, weightKg, proteinFactor = DEFAULT_PROTEIN_FACTOR)` — idem
- `suggestGoals` agora retorna `protein_factor` no objeto resultado

#### `src/integrations/supabase/types.ts`
- `protein_factor?: number` adicionado nos tipos `Insert` e `Update` da tabela `goals`

#### `src/components/goals-page.tsx`
- Estado `strategy: string` ("1.6" | "1.8" | "2.0" | "2.2" | "manual")
- Dropdown `<Select>` com 5 opções de estratégia
- `handleStrategyChange(value)` — ao escolher estratégia numérica, recalcula macros via `suggestGoals`
- Qualquer edição direta nos campos de macro muda `strategy` para `"manual"`
- Botão "Usar calculada" restaura os macros e a estratégia ativa
- Salva `protein_factor` no banco via upsert

#### `src/routes/app.index.tsx` (Home)
- Lê `protein_factor` da meta salva
- Usa o fator ao sincronizar automaticamente (`suggestGoals`, `matchesSuggestion`)

#### `src/components/goals-page.component.test.tsx`
- Mocks adicionados: `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`, `scrollIntoView` (necessários para Radix Select em jsdom)
- 2 novos testes: seleção de estratégia recalcula macros + edição manual muda estratégia para "Manual"
- **Total: 103 testes passando** ✅

---

## 3. Problemas identificados no Coach IA

### 3.1 Coach não conhece o `protein_factor` (PRIORIDADE ALTA)

**Onde**: `src/routes/app.coach.tsx` → `generate()` → monta o `summary` e chama `coachAdvice`

**Problema**: O prompt enviado para a IA inclui `Metas: X kcal · P Yg · C Zg · G Wg` mas não indica a estratégia de proteína. A IA não sabe se o usuário está em "Conservador (1.6 g/kg)" ou "Preservação agressiva (2.2 g/kg)".

**Solução**:
1. Na linha 69 de `app.coach.tsx`, adicionar `protein_factor` ao select:
```ts
// ANTES
.select("calories,protein_g,carbs_g,fat_g")
// DEPOIS
.select("calories,protein_g,carbs_g,fat_g,protein_factor")
```

2. No `summary` (dentro do array que gera as linhas), adicionar:
```ts
`Estratégia de proteína: ${goals?.protein_factor ?? 2.0} g/kg por kg de peso`
```

3. No `coachSchema` em `nutrition.functions.ts` (linhas 172-178), aceitar `protein_factor`:
```ts
goals: z.object({
  calories: z.number().nonnegative().optional(),
  protein_g: z.number().nonnegative().optional(),
  carbs_g: z.number().nonnegative().optional(),
  fat_g: z.number().nonnegative().optional(),
  protein_factor: z.number().min(1).max(3).optional(), // ADICIONAR
}).optional(),
```

---

### 3.2 `inferCoachObjective` ignora o `protein_factor` (PRIORIDADE MÉDIA)

**Onde**: `src/lib/coach-plan.ts` → `inferCoachObjective(goals)` (linha 38-46)

**Problema**: Usa apenas `calories` e `protein_g` absoluto. Um usuário de 80kg em "Preservação agressiva" (2.2 g/kg = 176g) é classificado como Hipertrofia mesmo com calorias baixas.

**Solução**:
```ts
// ANTES
export function inferCoachObjective(goals?: CoachGoals): CoachObjective {
  const calories = goals?.calories ?? 0;
  const protein = goals?.protein_g ?? 0;
  if (calories <= 1900 && protein >= 120) return "Emagrecimento";
  if (calories >= 2300 && protein >= 150) return "Hipertrofia";
  if (calories > 0 && calories < 2300) return "Recomposicao corporal";
  return "Manutencao";
}

// DEPOIS — protein_factor ajuda a distinguir estratégia de Emagrecimento vs Hipertrofia
export function inferCoachObjective(goals?: CoachGoals & { protein_factor?: number }): CoachObjective {
  const calories = goals?.calories ?? 0;
  const factor = goals?.protein_factor ?? 2.0;
  if (calories <= 1900 && factor >= 1.6) return "Emagrecimento";
  if (calories >= 2300 && factor >= 2.0) return "Hipertrofia";
  if (calories > 0 && calories < 2300 && factor >= 1.8) return "Recomposicao corporal";
  return "Manutencao";
}
```

> ⚠️ Atualizar os testes em `src/lib/coach-plan.test.ts` após a mudança.

---

### 3.3 O plano semanal é 100% hardcoded — a IA não o constrói (PRIORIDADE MÉDIA)

**Onde**: `src/lib/coach-plan.ts` → `buildCoachPlan()` + `src/server-fns/nutrition.functions.ts` → `coachAdvice`

**Problema**: A IA gera um `text` livre, mas o "Plano da semana" exibido na tela (com `trainingGoal`, `nutritionGoal`, `checklist`) é gerado por `buildCoachPlan()` com `if/else` estáticos. Dois usuários com os mesmos dados recebem o **mesmo plano**, independente da análise da IA.

**Solução**: Fazer a IA retornar o plano via tool call (structured output):

Em `nutrition.functions.ts`, dentro de `coachAdvice.handler`, trocar `callAiChatCompletion` para usar tools:
```ts
const res = await callAiChatCompletion({
  ...
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: data.summary },
  ],
  tools: [{
    type: "function",
    function: {
      name: "coach_plan",
      description: "Retorna análise e plano semanal estruturado",
      parameters: {
        type: "object",
        properties: {
          insight: { type: "string", description: "3-5 insights em markdown" },
          focus: { type: "string", description: "Foco principal da semana, ex: Criar rotina" },
          todaySummary: { type: "string", description: "O que fazer hoje em 1 frase" },
          trainingGoal: { type: "string" },
          nutritionGoal: { type: "string" },
          trackingGoal: { type: "string" },
          nextAction: { type: "string" },
          checklist: { type: "array", items: { type: "string" }, maxItems: 4 },
        },
        required: ["insight","focus","todaySummary","trainingGoal","nutritionGoal","trackingGoal","nextAction","checklist"],
      },
    },
  }],
  toolChoice: { type: "function", function: { name: "coach_plan" } },
});

// Parsear
const call = (res as any).choices?.[0]?.message?.tool_calls?.[0];
if (call) {
  const parsed = JSON.parse(call.function.arguments);
  text = parsed.insight;
  plan = { title: "Plano da próxima semana", objective, ...parsed };
} else {
  // Fallback: usar buildCoachPlan determinístico
  text = (res as any).choices?.[0]?.message?.content ?? "";
  plan = buildCoachPlan(data.stats ?? {}, data.goals, data.objective);
}
```

> Manter `buildCoachPlan` como fallback — nem todos os providers suportam tool calls (ex: alguns modelos Groq menores).

---

### 3.4 Chat não injeta snapshot "consumido hoje" automaticamente (PRIORIDADE ALTA)

**Onde**: `src/server-fns/chat.functions.ts` → `fetchUserContext` → `ctxText` (linhas 161-175)

**Problema**: O contexto passa histórico da semana, mas não mostra o total de hoje de forma destacada. O usuário pergunta "como estou hoje?" e a IA precisa somar manualmente.

**Solução**: Antes de montar o `ctxText`, calcular os totais de hoje:
```ts
// Adicionar antes da linha 101 (dailyTotalsText)
const todayTotals = dailyTotals[today] ?? { kcal: 0, p: 0, c: 0, f: 0 };
const todayWater = (water ?? [])
  .filter((w: any) => w.log_date === today)
  .reduce((sum: number, w: any) => sum + Number(w.ml), 0);

const todaySnapshot = `Hoje (${today}) — consumido até agora:
  Calorias: ${Math.round(todayTotals.kcal)}/${goals?.calories ?? 2000} kcal (${Math.round((todayTotals.kcal / (goals?.calories ?? 2000)) * 100)}%)
  Proteína: ${Math.round(todayTotals.p)}/${goals?.protein_g ?? 140}g
  Carboidratos: ${Math.round(todayTotals.c)}/${goals?.carbs_g ?? 220}g
  Gorduras: ${Math.round(todayTotals.f)}/${goals?.fat_g ?? 65}g
  Água: ${Math.round(todayWater)}ml`;
```

E adicionar `${todaySnapshot}\n\n` no início do `ctxText` (linha 162).

---

### 3.5 Coach semanal não lê medidas corporais (PRIORIDADE BAIXA)

**Onde**: `src/routes/app.coach.tsx` → `generate()` — busca `goals`, `meals`, `workouts`, `body_weights`, `water_logs` mas não `body_measurements`.

**Contexto**: O Chat já busca e formata medidas em `fetchUserContext` (linhas 66, 111-135 de `chat.functions.ts`).

**Solução**:
1. Adicionar ao `Promise.all` em `generate()`:
```ts
supabase
  .from("body_measurements")
  .select("log_date, label, value_cm")
  .eq("user_id", user.id)
  .gte("log_date", start)
  .order("log_date"),
```

2. Extrair a função de formatação de medidas de `chat.functions.ts` (linhas 112-135) para `src/lib/format-measurements.ts`:
```ts
export function formatMeasurements(measurements: Array<{log_date: string, label: string, value_cm: number}>): string {
  // ... lógica atual de chat.functions.ts
}
```

3. Importar e usar em ambos `chat.functions.ts` e `app.coach.tsx`.

---

### 3.6 System prompt do Coach é genérico (PRIORIDADE BAIXA)

**Onde**: `src/server-fns/nutrition.functions.ts` linha 207-210

**Problema**: Prompt único para todos os objetivos — não menciona o objetivo nem instrui sobre prioridades.

**Solução**: Tornar dinâmico:
```ts
const objectiveLabel = data.objective ?? "saúde e performance geral";
const systemPrompt = `Você é um coach pessoal especializado em ${objectiveLabel}.
O objetivo declarado do usuário é: ${objectiveLabel}.
Analise os dados da última semana e retorne 3-5 insights práticos em português.
Conecte os achados a ações concretas para a próxima semana.
Use markdown simples (negrito e listas). Seja direto, sem clichês genéricos.
Priorize: (1) consistência nos registros, (2) aderência às metas, (3) tendência de peso.`;
```

---

## 4. Backlog priorizado

| # | Item | Arquivos afetados | Esforço | Impacto |
|---|---|---|---|---|
| 1 | Passar `protein_factor` no contexto do Coach semanal | `app.coach.tsx`, `nutrition.functions.ts` | XS | 🔴 Alto |
| 2 | Injetar snapshot "hoje" no Chat | `chat.functions.ts` | XS | 🔴 Alto |
| 3 | System prompt dinâmico do Coach | `nutrition.functions.ts` | S | 🟡 Médio |
| 4 | `inferCoachObjective` usar `protein_factor` | `coach-plan.ts`, `coach-plan.test.ts` | S | 🟡 Médio |
| 5 | Coach semanal ler medidas corporais + extrair `format-measurements.ts` | `app.coach.tsx`, `chat.functions.ts` | M | 🟡 Médio |
| 6 | `buildCoachPlan` gerado pela IA via structured output | `nutrition.functions.ts`, `coach-plan.ts` | L | 🔴 Alto |

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
