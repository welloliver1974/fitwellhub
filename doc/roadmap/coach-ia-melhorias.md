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

## 4. Backlog de Entregas Realizadas

| # | Item | Arquivos afetados | Esforço | Impacto | Status |
|---|---|---|---|---|---|
| 1 | Passar `protein_factor` no contexto do Coach semanal | `app.coach.tsx`, `nutrition.functions.ts` | XS | 🔴 Alto | ✅ Concluído |
| 2 | Injetar snapshot "hoje" no Chat | `chat.functions.ts` | XS | 🔴 Alto | ✅ Concluído |
| 3 | System prompt dinâmico do Coach | `nutrition.functions.ts` | S | 🟡 Médio | ✅ Concluído |
| 4 | `inferCoachObjective` usar `protein_factor` | `coach-plan.ts`, `coach-plan.test.ts` | S | 🟡 Médio | ✅ Concluído |
| 5 | Coach semanal ler medidas corporais + extrair `format-measurements.ts` | `app.coach.tsx`, `chat.functions.ts` | M | 🟡 Médio | ✅ Concluído |
| 6 | `buildCoachPlan` gerado pela IA via structured output | `nutrition.functions.ts`, `coach-plan.ts` | L | 🔴 Alto | ✅ Concluído |
| 5.1 | Registro de Alimentação por Áudio / Voz (Voice-to-Meal) | `voice-meal-recorder.tsx`, `audio.functions.ts`, `app.nutricao.tsx` | M | 🔴 Alto | ✅ Concluído |
| 5.2 | Checklist Interativo no Plano do Coach | `app.coach.tsx` | S | 🟡 Médio | ✅ Concluído |
| 5.3 | Sugestão Inteligente por Macros Restantes do Dia | `suggest-meal-dialog.tsx`, `nutrition.functions.ts`, `app.nutricao.tsx` | M | 🔴 Alto | ✅ Concluído |
| 5.4 | Substituição Inteligente de Exercícios por IA | `workout.functions.ts`, `exercise-substitute-dialog.tsx`, `app.treinos.$id.foco.tsx` | M | 🔴 Alto | ✅ Concluído |
| 5.5 | Responsividade e Ajustes Mobile (360-390px) | `styles.css`, `app.nutricao.tsx`, `dialog.tsx`, `app.tsx` | XS | 🔴 Alto | ✅ Concluído |
| **AI-5** | **Coach Semanal — Recomendação Proativa de Ajuste de Meta** | `coach-plan.ts`, `nutrition.functions.ts`, `app.coach.tsx` | M | 🔴 Alto | ✅ Concluído |
| **AI-2** | **Chat — Registro de Água por Conversa (`record_water`)** | `chat.functions.ts`, `chat.functions.test.ts` | S | 🔴 Alto | ✅ Concluído |

---

### AI-5: Coach Semanal — Recomendação Proativa de Ajuste de Meta ✅ CONCLUÍDO (2026-08-09)

**Conceito**: O Coach IA analisa a tendência de peso das últimas 2–4 semanas (28 dias) e, quando detecta estagnação ou perda excessiva, sugere um ajuste específico de calorias (ex: `-150 kcal/dia`). O usuário pode aplicar esse ajuste diretamente em suas metas com um único clique.

**Implementado em**:
- `src/lib/coach-plan.ts` — tipo `CalorieAdjustment` exportado com campos `recommendedAction`, `calorieDelta` e `reasoning`; adicionado como campo opcional em `CoachPlan`
- `src/server-fns/nutrition.functions.ts` — `coachPlanTool` schema expandido com objeto `calorieAdjustment`; system prompt instrui a IA a analisar tendência de 2–4 semanas e sugerir ajuste de 100–250 kcal quando necessário
- `src/routes/app.coach.tsx`:
  - Query de `body_weights` expandida de 7 para **28 dias**
  - `handleApplyCalorieAdjustment(delta)`: busca a meta atual, recalcula macros com `suggestGoals()` e faz upsert atômico na tabela `goals`
  - Card **"Ajuste Proativo Recomendado"** renderizado condicionalmente com badge de delta (`+150 kcal/dia` ou `-150 kcal/dia`), reasoning da IA e botão **"Aplicar ajuste nas metas"**

**Lógica do ajuste**:
| Cenário | Ação recomendada | Delta sugerido |
|---|---|---|
| Perda de peso estagnada (< 0.2kg/sem) | `reduzir_calorias` | -100 a -200 kcal |
| Perda muito rápida (> 1kg/sem) | `aumentar_calorias` | +150 a +250 kcal |
| Ganho de massa estagnado | `aumentar_calorias` | +100 a +200 kcal |
| Proteína baixa para o objetivo | `aumentar_proteina` | ajuste de fator |
| Tudo dentro do esperado | `manter` | 0 |

---


## 5. Próximas Funcionalidades / Roadmap Futuro

### ~~5.1 Registro de Alimentação por Áudio / Voz (Voice-to-Meal)~~ ✅ CONCLUÍDO (2026-08-08)

**Conceito**: O usuário clica no botão de microfone 🎙️ no header da tela de Nutrição, fala naturalmente o que comeu e/ou quanta água bebeu, e a IA transcreve, separa as refeições (uma ou mais) e/ou registra a hidratação no diário.

**Implementado em**:
- `src/components/voice-meal-recorder.tsx` — componente React com gravação via `MediaRecorder` + fallback `webkitSpeechRecognition`, suporte a toasts combinados (água + refeições)
- `src/server-fns/audio.functions.ts` — `transcribeAudio` (Groq Whisper `whisper-large-v3-turbo`) + `parseAndRecordVoiceMeal` com ferramenta `record_voice_intake` (extrai `water_ml` para `water_logs` e array de `meals` para `meals`/`meal_items`)
- `src/server-fns/audio.functions.test.ts` — testes de unidade cobrindo parsing de água e múltiplas refeições
- `src/routes/app.nutricao.tsx` — botão `<Mic>` no header; `<VoiceMealRecorder>` renderizado controlado com `onSaved={load}`

**Fluxo**:
1. Usuário clica no ícone 🎙️ no header → abre Dialog
2. Dialog inicia `MediaRecorder` + `webkitSpeechRecognition` (se disponível)
3. Ao parar: se texto do Speech API tiver >3 chars, usa direto; senão envia áudio para Groq Whisper
4. Usuário revisa/edita texto transcrito (ex: *"Bebi 500ml de água e no almoço comi 200g de arroz com frango"*)
5. Clica "Salvar" → `parseAndRecordVoiceMeal` → IA extrai `water_ml` (insere em `water_logs`) e refeição(ões) (insere em `meals`/`meal_items`)
6. Toast de confirmação unificado (ex: *"💧 500ml de água + 🍽️ Almoço (450 kcal)"*); página recarrega automaticamente


---

### AI-2: Chat — Registro de Água por Conversa 💧 ✅ CONCLUÍDO (2026-08-09)

**Conceito**: O usuário pode dizer no Chat *"Bebi 500ml de água"* ou *"Tomei um copo d'água"* e a IA chama automaticamente a ferramenta `record_water`, que insere ou acumula ml no `water_logs` do dia. Funciona exatamente como `record_meal` e `record_workout` já funcionavam.

**Implementado em**:
- `src/server-fns/chat.functions.ts`:
  - `executeRecordWater(supabase, userId, today, { ml })` — insere novo registro ou acumula ml ao existente; retorna confirmação com emoji 💧 e total do dia
  - Ferramenta `record_water` adicionada ao array `tools` do agent loop, com conversão automática (copos → 240ml, garrafinhas → 500ml)
  - System prompt atualizado com seção *"REGISTRO POR CONVERSA"* listando explicitamente as 3 ferramentas e seus gatilhos de uso
- `src/server-fns/chat.functions.test.ts` — 5 testes unitários: insert novo, acumulação, validação de ml inválido, erro de insert e erro de update

**Exemplos de comandos funcionais**:
- `"Bebi 500ml de água"` → insere 500ml
- `"Tomei dois copos de água"` → insere 480ml (2 × 240ml)
- `"Acabei minha garrafa"` → insere 500ml
- `"Bebi 1 litro de água"` → insere 1000ml

---

### ~~5.2 Checklist Interativo no Plano do Coach~~ 📋 ✅ CONCLUÍDO (2026-08-08)



**Conceito**: Permitir que o usuário toque nos itens da checklist semanal do Coach no card de plano semanal para marcar/desmarcar como concluídos.

**Implementado em**:
- `src/routes/app.coach.tsx` — estado `completedChecklist` (persistido via `localStorage` com chave individual por usuário e plano)
- Checkbox interativo em cada item da lista com efeito de riscado (line-through), contagem `"X de Y concluídos"` e barra de progresso visual

---

### ~~5.3 Sugestão Inteligente por Macros Restantes do Dia~~ 🥗 ✅ CONCLUÍDO (2026-08-08)

**Conceito**: Botão *"O que posso comer agora?"* (✨) no header da tela de Nutrição (`/app/nutricao`).

**Implementado em**:
- `src/server-fns/nutrition.functions.ts` — `suggestMealByRemainingMacros` com Structured Output (tool `report_suggested_meals`) gerando 3 refeições/lanches brasileiros equilibrados com porção e gramas dos ingredientes
- `src/server-fns/suggest-meal.test.ts` — testes unitários para o schema Zod e cálculo de macros restantes
- `src/components/suggest-meal-dialog.tsx` — Dialog interativo com resumo dos macros restantes atuais, seletor de tipo de refeição (Café, Almoço, Jantar, Lanche), 3 opções detalhadas e botão **"Registrar em [Refeição]"** para inserir diretamente no Supabase
- `src/routes/app.nutricao.tsx` — botão `<Sparkles>` no header da tela de Nutrição, cálculo dinâmico de `remainingMacros` (`Meta - Consumido`) e reload automático após inserção

---

### ~~5.4 Substituição Inteligente de Exercícios por IA~~ 🏋️ ✅ CONCLUÍDO (2026-08-08)

**Conceito**: Durante um treino no modo foco (`/app/treinos/$id/foco`), o usuário clica no botão "Substituir exercício" (🔀) ao lado do nome do exercício. A IA sugere 3 alternativas equivalentes no mesmo grupo muscular, considerando o motivo (ex: *aparelho ocupado*, *treinando em casa*, *desconforto/dor*).

**Implementado em**:
- `src/server-fns/workout.functions.ts` — `suggestExerciseSubstitute` com Structured Output (tool `suggest_substitutes`) retornando 3 sugestões com nome, músculos, motivo/descrição e dica de execução (💡)
- `src/server-fns/workout.functions.test.ts` — testes unitários para o schema Zod e validações
- `src/components/exercise-substitute-dialog.tsx` — Dialog interativo com seletor de motivos (presets + campo livre), estado de carregamento e cards detalhados das alternativas
- `src/routes/app.treinos.$id.foco.tsx` — botão `<Shuffle>` no header da tela de foco com substituição local (`nameOverrides` em estado), preservando intacto o template original do treino

---

### ~~5.5 Ajustes de Responsividade e UX Mobile~~📱 ✅ CONCLUÍDO (2026-08-08)

**Conceito**: Eliminação de scroll lateral/overflow horizontal em telas mobile de 360px a 390px.

**Implementado em**:
- `src/styles.css` — Regra global `html, body { max-width: 100vw; overflow-x: hidden; }`
- `src/routes/app.nutricao.tsx` — Header com toolbar flex-wrap e contenção proporcional `max-w-[56%]` para ícones de ação
- `src/components/ui/dialog.tsx` — Atualização da classe base `DialogContent` para `w-[calc(100vw-2rem)] sm:w-full max-w-lg`
- `src/routes/app.tsx` — Redução do padding horizontal do container principal para `px-3 sm:px-5`

---

## 6. Contexto técnico para qualquer agente

### Como rodar os testes
```powershell
npx vitest run                                                        # todos (118 testes)
npx vitest run src/lib/coach-plan.test.ts                            # lógica do Coach
npx vitest run src/lib/format-measurements.test.ts                   # formatação de medidas
npx vitest run src/components/goals-page.component.test.tsx          # tela de metas
npx vitest run src/server-fns/audio.functions.test.ts                # audio/voice logging
npx vitest run src/server-fns/workout.functions.test.ts              # substituição de exercícios
npx vitest run src/server-fns/suggest-meal.test.ts                   # sugestão por macros restantes
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

---

## 7. Oportunidades Futuras de Melhorias (Próxima Fase) 💡

Como todas as tarefas do plano inicial foram concluídas com sucesso, registramos aqui as principais ideias de evolução do app para consultas futuras:

| # | Ideia | Descrição | Esforço | Impacto |
|---|---|---|---|---|
| **7.1** | **Scanner de Rótulo por IA (Vision OCR)** | Tirar foto da tabela de informação nutricional no verso da embalagem para preenchimento automático | M | 🔴 Alto |
| **7.2** | **Progressão Inteligente de Cargas** | Sugestão automática de incremento de carga no treino quando a IA detectar estagnação nas séries anteriores | M | 🔴 Alto |
| **7.3** | **Gerador de Cardápio Semanal PDF** | Gerar um menu de refeições de 7 dias alinhado às metas de macros e exportável para PDF ou lista de compras | L | 🟡 Médio |
| **7.4** | **Notificações / Alertas Inteligentes** | Alertas no app quando o usuário estiver longe da meta de proteína no final da tarde ou sem registrar água | S | 🟡 Médio |
| **7.5** | **Integração com Wearables (Apple Health / Google Fit)** | Sincronização automática de passos diários, gasto calórico ativo e batimentos cardíacos | L | 🔴 Alto |


