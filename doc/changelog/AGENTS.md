# AGENTS.md

Registro de ações realizadas por agentes autônomos (IA) no projeto FitWell Hub.

## [09/08/2026] - Claude Code (BUG: metas não salvavam — `ON CONFLICT (user_id)` sem constraint no banco real)
- **Ocorrência**: ao salvar a estratégia de proteína (conservador/moderado/padrão treino) na página de Metas, o app quebrava com `there is no unique or exclusion constraint matching the ON CONFLICT specification`.
- **Causa raiz**: a tabela `goals` **do banco real** (criada pelo `schema_completo.sql`) tem **PK artificial `id`** e **`user_id` SEM constraint única** — mas o app grava com `upsert(payload, { onConflict: "user_id" })` em **5 lugares** (home auto-sync `goal_auto`, página de Metas, Nutrição auto-sync, Coach ajuste de calorias). O Postgres exige `UNIQUE` em `user_id` para o `ON CONFLICT` funcionar. (`ai_settings` não quebra: o `user_id` É a PK lá.)
- **Fix — só banco, código intocado**: migration `20260809000000_goals_user_id_unique.sql` = **dedupe** de possíveis linhas repetidas por usuário (mantém a mais recente via `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC, ctid DESC)`) + **`CREATE UNIQUE INDEX goals_user_id_key`**. `schema_completo.sql` ganhou `UNIQUE` na coluna para recriações não voltarem a quebrar.
- **Validação**: aplicado pelo usuário no SQL Editor (dedupe + índice); salvar da estratégia passou a funcionar. Nenhuma mudança de TS/testes (SQL puro).

## [08/08/2026] - Claude Code (IA da foto do prato: erro 401 + provedor/modelo de visão dedicados)
- **Ocorrência**: usuário reportava câmera "quebrada" hoje (leitor CB "captura e não faz nada" + foto do prato com erro). Investigado: **o código da câmera não foi tocado hoje** (os commits de hoje são `goal_auto` e `MEAL_TYPES`). O leitor de código de barras voltou a funcionar com reload PWA (bump do service worker `fitwellhub-v2` em `public/sw.js` + endurecimento do loop de detecção em `BarcodeScanner.tsx`: RAF nunca morre em silêncio, hint de "stall" após 6s).
- **Causa raiz da foto**: `analyzePhoto` (`src/server-fns/nutrition.functions.ts`) **sempre chamava o OpenRouter** com `qwen2.5-vl-72b` — ignorava o provedor NVIDIA. Com `provider = nvidia`, a chave NVIDIA (guardada na coluna `openrouter_api_key`, onde a tela IA grava a chave NVIDIA) era mandada **pro OpenRouter**, que respondia **401 "No auth credentials found"** (o `callAiChatCompletion:91` faz `throw new Error(await response.text())` → o toast mostra o corpo cru da resposta). Sessão Supabase OK (a autenticação falha é só a da IA). Por isso SÓ a foto falhava: CB vai pelo **Open Food Facts** (sem IA) e Coach/chat usam o **provedor/texto**.
- **Feature nova (decisão do usuário "ter as duas opções")**: **Foto do prato agora tem provedor + modelo de visão dedicados**, independentes do Coach (que usa modelo de texto). Colunas novas em `ai_settings`: **`photo_provider` TEXT** e **`photo_model` TEXT** (migration `20260808160000_ai_settings_photo_provider.sql`). `NULL` = auto (NVIDIA/OmniRoute/OpenRouter conforme `provider` + `qwen2.5-vl-72b-instruct`). Tela `src/routes/app.ia.tsx` mostra o novo card "Foto do prato"; `analyzePhoto` usa `photo_provider ?? auto` e `photo_model ?? qwen2.5-vl`. `nvidia_model` (texto, p/ coach) fica intacto.
- **Validação**: `npx vitest run` **97/97** (+2 testes de normalize foto) + `tsc --noEmit` limpo nos tocados (inclui `types.ts` ai_settings Row/Insert/Update) + `npm run build` ok. **PENDENTE no usuário**: aplicar a migration no SQL Editor e re-escolher modelo de visão NVIDIA p/ foto se for usar NVIDIA.

## [08/08/2026] - Claude Code (Meta de calorias: auto-sync com o TDEE — recalcula sozinha quando muda)
- **Contexto**: o usuário perguntou se o app "vê" quando vai/não vai à academia. Esclarecido: o TDEE usa a **média de treinos dos últimos 28 dias** (fator de atividade 1.2–1.725), não o dia atual — faltar ontem/hoje não muda a meta. Antes, a meta gravada era "congelada" na 1ª visita (decisão anterior "só se ainda padrão").
- **Decisão do usuário**: **sincronizar automaticamente** — a meta se atualiza sozinha sempre que a sugestão (TDEE × peso × fator) muda; **mantém manual** no dia em que ele editar.
- **Coluna nova `goals.goal_auto BOOLEAN NOT NULL DEFAULT FALSE`** (migration `20260808130000_add_goal_auto.sql`): `TRUE` = veio de auto-seed/sugestão (home regrava quando a sugestão muda); `FALSE` = editada à mão (nunca mais sobrescreve). **Default FALSE preserva edições manuais já gravadas** — sem isso o "auto" varrerias metas customizadas antigas.
- **Home `src/routes/app.index.tsx`**: novo `shouldAutoUpdateGoal` (lib) → `!g || isDefaultGoals(g) || goal_auto===true`; quando auto **e** a sugestão mudou → `upsert` da nova sugestão com `goal_auto:true` (só grava se mudou; badge "Meta calculada" mantém). Meta manual → nunca toca.
- **Metas `src/components/goals-page.tsx`**: no "Salvar metas", `goal_auto = tdeeData && matchesSuggestion(campos, tdee, peso)` → salvou o mesmo da sugestão ("Usar calculada") = auto; editou qualquer campo = manual (`false`).
- **Tipos**: `src/integrations/supabase/types.ts` goals Row/Insert/Update + `goal_auto?: boolean` no `Goals` do home.
- **Validação**: `TZ=UTC npx vitest run` **95/95** (+4 `shouldAutoUpdateGoal`, +2 goal_auto no save da metas) + `tsc --noEmit` limpo nos tocados + `npm run build` ok. **PENDENTE no usuário**: aplicar a migration no SQL Editor antes de rodar o build novo (sem a coluna, o upsert falha).

## [08/08/2026] - Claude Code (Dividir "Lanche" em "Lanche da manhã" + "Lanche da tarde")
- **Escopo**: o tipo de refeição único "Lanche" virou **"Lanche da manhã"** e **"Lanche da tarde"** — o dropdown "Refeição" (Nutrição/Receitas/Foto) passa a oferecer 6 tipos; no MESMO dia agora cabem lanche da manhã E da tarde como linhas separadas (o `UNIQUE INDEX meals_user_date_type_uniq (user_id, meal_date, meal_type)` garante 1 por tipo/dia).
- **Decisão do usuário**: **não mexer nos dados antigos** — refeições gravadas como "Lanche" ficam como estão (não há migration: `meal_type` é TEXT sem CHECK constraint; os novos rótulos funcionam direto).
- **Fonte única nova `src/lib/meal-types.ts`**: a lista estava **3× duplicada** (`app.nutricao.tsx:84`, `app.receitas.$id.tsx:42`, `nutrition-day-detail.tsx:11`) + **enum divergente** no chat (`chat.functions.ts:377` tinha 4 itens, sem "Ceia"). Centralizado em `MEAL_TYPES` (ordem cronológica; `[0]`/`[1]` = defaults de Café da manhã/Almoço **preservados**); o enum do tool do LLM virou `[...MEAL_TYPES]` (ganha os 2 novos **e** "Ceia").
- **Legado visível**: `nutrition-day-detail.tsx` passou a agrupar no final qualquer `meal_type` fora de `MEAL_TYPES` (ex.: o antigo "Lanche") — o histórico não "some", só não é opção de novo registro.
- Toda escrita é por string (`ensureMeal`, `duplicateYesterday`, find por `meal_type === type`, Select, botões "X de ontem") — agnóstica, sem mudança de lógica além da constante.
- **Validação**: `TZ=UTC npx vitest run` **89/89** (+1 teste de fallback legado no `nutrition-day-detail.component.test.tsx`) + `tsc --noEmit` limpo nos tocados + `npm run build` ok. Smoke manual pendente no `Select` de refeição (6 tipos) e no registro de 2 lanches no mesmo dia.

## [08/08/2026] - Claude Code (Meta de calorias calculada automaticamente — TDEE no card do Home)
- **Escopo**: a meta de calorias do home agora **já vem calculada** a partir de peso, altura, sexo, nascimento e frequência de treinos — sem o usuário precisar preencher a meta na mão. Botação de edição (`Target` → `/app/metas`) continua intacta.
- **Decisão do usuário**: base = **manutenção (TDEE)** ("ali tenho a realidade, e vou controlando eu mesmo"); aplicação = **auto, só se ainda padrão** — substitui o default do signup (2000/140/220/65) na primeira visita ao home, **nunca** sobrescreve meta já editada.
- **Sem migration**: reutiliza o server fn existente `calculateTdee` (`src/server-fns/corpo.functions.ts`, Mifflin-St Jeor + fator de atividade por treinos/28d), chamado do cliente com `headers: { Authorization: Bearer ${session?.access_token} }` (padrão de `app.corpo.tsx`).
- **Novo `src/lib/nutrition-goals.ts`** (puro, testável em node): `isDefaultGoals(g)` (detecta 2000/140/220/65 gravado pelo signup), `suggestGoals(tdee, weightKg)` (kcal=TDEE, proteína 2 g/kg, gordura 25% das kcal, resto em carbo, nunca negativo) e `matchesSuggestion`.
- **Home `src/routes/app.index.tsx`**: no `load()` soma `calculateTdee` ao `Promise.all`; se goals ausente/padrão e tdee válido → `upsert` da sugestão `{ onConflict: "user_id" }` e usa como meta do card; estado `goalSource`/`tdeeGoal`. Badge "Meta calculada · TMB {bmr} × atividade {fator}" quando sugerida; hint clicável "Preencha peso/altura p/ calcular sua meta" → `/app/corpo` quando faltam dados; meta customizada → sem rótulo extra. Botão `Target` intacto.
- **Metas `src/components/goals-page.tsx`**: fetch de `calculateTdee` junto do goals; pré-preenche os campos com a sugestão quando não há meta salva ou ainda é padrão; carrega o valor salvo quando custom (não sobrescreve). Banner "Sugestão calculada: N kcal · TMB X × fator Y · peso Z kg" + botão **"Usar calculada"** (preenche os 4 campos; usuário confirma em "Salvar metas"). Sem dados → hint "Preencha sexo, altura, nascimento e peso em Corpo / Peso".
- **Validação**: `TZ=UTC npx vitest run` **88/88** (novos `nutrition-goals.test.ts` 8 + `goals-page.component.test.tsx` atualizado com mock de `calculateTdee`: pré-preenche, carrega custom, "Usar calculada", hint tdee-null) + `npm run build` ok + `tsc --noEmit` limpo nos tocados (5 erros pré-existentes em `corpo.functions.ts` de schema Supabase — baseline). 
- **Lições**: efeito depende de `userId`/`session?.access_token` (id estável), não do objeto `user` (mock `useAuth` devolve objeto novo por render → efeito re-roda e sobrescreviria o clique de "Usar calculada"). Texto quebrado em `<span>/<strong>` não casa `getByText` regex → matcher por `content.includes`.

## [04/08/2026] - Claude Code (Fuso horário FIXO em America/Sao_Paulo — correção definitiva do UTC)
- **Escopo**: tornar toda data do app independente do fuso do runtime. Antes o `getLocalDate` (`src/lib/utils.ts`) usava `getFullYear/getMonth/getDate` (dependentes do runtime) → no Cloudflare Worker (UTC) uma refeição às 22h de SP caía no dia seguinte; a exibição `new Date(x+"T00:00").toLocaleDateString` mostrava ontem.
- **Histórico**: 3º ajuste de fuso. Os anteriores (24/06 e 15/07) padronizaram o *uso* de `getLocalDate`, mas a *função* continuava dependente do fuso do runtime — daí o bug voltar em produção (Worker = UTC).
- **Helpers em `src/lib/utils.ts`**: `getLocalDate` via `Intl.DateTimeFormat(timeZone)` + `getLocalDateMinusDays` (dias civis, não ms) + `formatLocalDate` (data civil → pt-BR sem instant) + `todayBoundsSaoPaulo` (limites UTC de "hoje SP" p/ query de timestamp).
- **Decisões do usuário**: São Paulo **fixo** em todo o app; timestamps no banco continuam `toISOString()` (UTC) — só leitura/formação usam SP; **não mexer** em idade, relógio de lembretes (`getHours`) e cronômetro de treino.
- **Migração**: ~15 arquivos (server-fns chat/medidas/corpo + rotas coach/relatorio/nutricao/nutricao-historico/peso/corpo/medidas/treinos/exercicios/index + Heatmap).
- **Testes**: `utils.test.ts` reescrito com instants absolutos `new Date("...Z")` (inclui borda 02:00Z vs 03:00Z).
- **Status**: Concluído, `TZ=UTC npx vitest run` **75/75** (independência de fuso provada) + `npm run build` + `tsc --noEmit` sem erros novos. Smoke manual pendente no celular (refeição noturna).

## [02/08/2026] - Claude Code (Expansão de integração: leaf pages Lembretes+Metas — 5ª bateria)
- **Escopo**: estender o teste de integração a **componentes de página de CRUD** (padrão seguro do usuário, não MemoryRouter/layout inteiro).
- **Extração para `src/components/`**: `RemindersPage` (de `app.lembretes.tsx`) e `GoalsPage` (de `app.metas.tsx`) movidos para arquivos próprios; as rotas passam a importá-los.
  - **Lição**: exportar a página do próprio arquivo de rota dispara warning do TanStack Router ("não será code-split e aumenta o bundle") — contradiz o bundle splitting. Mover para `src/components/` mantém code-splitting. Confirmar para componentes alvo de teste futuros.
- **Testes**: `reminders-page.component.test.tsx` (5: lista, add, sem-dias, toggle, delete) e `goals-page.component.test.tsx` (4: pré-carrega, macroKcal, salvar→upsert+navigate, aviso>50). Padrão `vi.hoisted` inline + `beforeEach(mock.reset)` + mock `@/lib/auth-context` + stub `Notification`.
- **Status**: Concluído, `npm test` 69/69 (8 arquivos) + `npm run build` sem code-split warning + `tsc --noEmit` limpo.

## [02/08/2026] - Claude Code (Testes de integração — FoodLibrary com supabase mock, 4ª bateria)
- **Escopo**:
  - **Primeiro teste de integração** `src/components/food-library.component.test.tsx` (jsdom): renderiza o `FoodLibrary` inteiro com **supabase "fake" chainable** (via `vi.mock` do `@/integrations/supabase/client` + `lookupNutrition` mockee). Fluxo real: load da biblioteca, busca, card vazio, diálogo adicionar com escala de macros (100→150g) + insert `meal_items`, e desabilitar com porção zerada.
  - **Lição de hoisting**: o `vi.mock` é hoisted ao topo e **não lê consts top-level** do módulo de teste → o supabase fake é construído **inline no `vi.hoisted`** (sem import externo). O helper `src/test/supabase-mock.ts` que criei primeiro ficou sem uso → removido.
- **Status**: Concluído, `npm test` 60/60 (55 + 5) + `npm run build` + `tsc --noEmit` limpo nos tocados. Smoke manual do fluxo de nutrição pendente.

## [02/08/2026] - Claude Code (Bundle splitting + router prefetch)
- **Escopo**:
  - **Medição (importante)**: o roadmap citava `recharts`/`supabase` como vilões, mas o build real mostrou que **recharts e jspdf já eram lazy por rota** (chunk isolado + `await import("jspdf")` em `app.relatorio.tsx`). O problema real: o entry `index` (362 KB) com o shell configurando deps sem separar.
  - **`manualChunks` granular** (`vite.config.ts`): separa deps estáveis por janela de uso — `react`, `pdf`, `supabase`, `charts`, `radix`, `query`, `router`, `forms`, `ui-utils`, `ui-misc`. Enumerar **deps** (não rotas). Ganhos: entry menor, paraleliza download, melhor cache hit entre deploys.
  - **Router prefetch** (`src/router.tsx`): `defaultPreload: "intent"` + `staleTime 30s` no `createRouter`. Lazy route baixa no hover/focus → navegação quase instantânea.
  - **Limpeza** (`src/routes/app.tsx`): removido import supabase top-level morto (usado por `auth-context`/`use-reminders`). Supabase já era chunk próprio e é indispensável via auth — não dá pra tirar do 1º load sem mexer no auth (fora de escopo).
- **Resultado (cliente)**: entry `index` 362 → 144 KB; recharts (384 KB) e jspdf (574 KB) fora do entry; surgiram chunks `react`(189)/`radix`(94)/`ui-utils`(54) estáveis. 55/55 testes.
- **Status**: Concluído, `npm run build` + `npm test` 55/55 + `tsc --noEmit` limpo nos tocados. Smoke manual no celular pendente.

## [02/08/2026] - Claude Code (Testes unitários de ai-settings — lógica pura de providers, 3ª bateria)
- **Escopo**:
  - **Extração** `src/lib/ai-settings.ts` (puro, zero imports, testável em node): `normalizeAiSettings`, `resolveAiProvider`, `getTextModel`, `resolveAiApiKey`, `resolveAiChatEndpoint` + tipos `AiProvider`/`AiSettings`/`AiSettingsRow` (tipo estrutural agnóstico do Supabase). Preserva detalhes bug-prone: `nvidia` usa `openrouter_api_key`; `nvidia_model` vem de `omniroute_base_url` (trim); fallback de env por provider com prioridade.
  - **`ai-settings.functions.ts`** importa do módulo puro e **re-exporta** os símbolos (nenhum import de outros arquivos muda); `fetchAiSettings`/`fetchNvidiaModels`/`callAiChatCompletion` seguem no server-fn (supabase/fetch/createServerFn). `callAiChatCompletion` usa `resolveAiChatEndpoint`.
  - **Bateria**: `src/lib/ai-settings.test.ts` — **17 testes** (provider/fallback, modelo, chave armazenada vs env, endpoint). **55 testes no total**.
- **Status**: Concluído, `npm test` 55/55 verde + `npm run build` + `tsc --noEmit` limpo nos tocados. Smoke manual da tela `/app/ia` pendente.

## [02/08/2026] - Claude Code (Testes de UI jsdom + matemática pura de reescala — 2ª bateria)
- **Escopo**:
  - **Setup jsdom + testing-library**: devDeps `jsdom`, `@testing-library/react` (^16, React 19), `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`. `src/test/setup.ts` com `@testing-library/jest-dom/vitest` + `afterEach(cleanup)` (sem globals). `vite.config.ts` ganhou `setupFiles`. **Importante**: Vitest 4 **removeu** `environmentMatchGlobs` — o jsdom é ativado por **docblock** `// @vitest-environment jsdom` no topo dos testes `*.component.test.tsx` (a lógica pura de `src/lib/*.test.ts` continua em node).
  - **Extração `PlanCard`** (refactor sem comportamento): `app.chat.tsx:53-111` → novo `src/components/plan-card.tsx` (apresentacional puro). `app.chat.tsx` perdeu os imports de `Collapsible`/`ChevronDown` (só o card usava) e manteve `Sparkles`/`CoachPlan`.
  - **Extração `rescaleMacros`**: a matemática inline do `onChange` da porção em `app.nutricao.tsx` virou função pura em `src/lib/food-utils.ts` (tipo `MacroState` exportado). Preserva o detalhe: kcal → inteiro, P/C/G → 1 casa, `""` permanece `""`, guarda `<=0`.
  - **Bateria**: +6 testes `rescaleMacros` em `food-utils.test.ts` e +6 testes de UI em `plan-card.component.test.tsx` (render/expandir/checklist/próxima ação/recolher). **38 testes no total**.
- **Status**: Concluído, `npm test` 38/38 verde + `npm run build` + `tsc --noEmit` limpo nos tocados (erros pré-existentes de `vite.config` tipagem estrita do lovable wrapper ficam fora). Smoke manual do chat pendente.

## [02/08/2026] - Claude Code (Testes automatizados — Vitest, primeira bateria)
- **Escopo**:
  - **Setup**: `vitest@^4.1.10` (devDep, compatível com Vite 7); bloco `test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] }` no `vite.config.ts`; script `"test": "vitest run"`.
  - **Refactor para testabilidade (sem mudança de comportamento)**: criados `src/lib/coach-plan.ts` (tipos `CoachPlan`/`CoachObjective`/`CoachGoals`/`CoachStats` + `inferCoachObjective` + `buildCoachPlan` movidos de `nutrition.functions.ts`; `confidenceFromStats` + `nextActionFromStats` movidos de `chat.functions.ts`) e `src/lib/food-utils.ts` (`parseFoodWeight` + `scaleMacros` movidos de `app.nutricao.tsx`). `nutrition.functions.ts`, `chat.functions.ts`, `app.chat.tsx` e `app.nutricao.tsx` agora importam dos módulos puros. Bônus: **some o cross-import** `chat.functions → nutrition.functions`.
  - **Bateria**: `coach-plan.test.ts`, `food-utils.test.ts` e `utils.test.ts` (getLocalDate) — **27 testes**, cobrindo fronteiras de `confidenceFromStats` (12/6), `inferCoachObjective` (inclusive borda cal-baixa/prot-baixa→Recomposição), `buildCoachPlan`, `parseFoodWeight` e `scaleMacros`.
- **Status**: Concluído, `npm test` 27/27 verde + `npm run build` + `tsc --noEmit` limpo nos arquivos tocados. Smoke manual do refactor pendente (comportamento deve ser idêntico).

## [02/08/2026] - Claude Code (Balcão único no "+" + Plano semanal no chat)
- **Escopo**:
  - **Balcão único de adição** (`src/routes/app.nutricao.tsx`): página carrega `food_library` (`loadLibrary`, chamada no `load()` e pós-`saveToLibrary`); diálogo do "+" ganhou a seção "Da sua biblioteca" com busca (`libQuery`) e lista filtrada clicável — tocar num item preenche o formulário (nome/gramas/macros/`manual=true`). Novo estado `refGrams` faz a **escala proporcional** dos macros ao mudar a porção (igual ao `confirmAdd` do FoodLibrary); limpo ao editar o nome e no reset pós-`addFood`. "Meus alimentos" embaixo continua sendo a área de gestão (FoodLibrary.tsx intacto).
  - **Plano semanal no chat** (`nutrition.functions.ts` + `chat.functions.ts` + `app.chat.tsx`): exportados `CoachPlan`, `inferCoachObjective`, `buildCoachPlan` (lógica intacta); `fetchUserContext` agora retorna `goals` (já buscado); `sendChat` detecta intenção de plano (`/\b(plano|planej|planeja|semana|semanal|checklist|foco)\b/i`) e retorna `plan = buildCoachPlan(stats, goals, inferCoachObjective(goals))` (objetivo automático); `app.chat.tsx` renderiza `PlanCard` **recolhível** (Collapsible) com foco/metas/checklist/próxima ação. Banco persiste só o `reply`; histórico recarregado não tem card.
  - **Sem json_schema, sem mudar prompt/IA, loop de tools intacto** — mesma filosofia do fix anterior (heurística determinística em JS).
  - **Docs**: `doc/changelog/FIXLOG.md` (sessão 02/08), `doc/roadmap/melhorias.md` (item5 concluído; nota UX das duas portas → resolvida com balcão único).
- **Status**: Concluído, `npm run build` validado + `tsc --noEmit` limpo nos arquivos tocados (erros pré-existentes de `body_measurements`/`BarcodeDetector`/`profiles` ficam fora de escopo). Teste manual no celular pendente.

## [02/08/2026] - Claude Code (Pós-teste no celular: correção de overflow no diálogo do "+")
- **Escopo**:
  - **Overflow horizontal**: Após teste do usuário no celular (montando o café da manhã), o diálogo do "+" na Nutrição ficava mais largo que a tela. Causa raiz: os dois botões de rodapé ("Salvar na biblioteca" + "Adicionar"/"Calcular com IA e adicionar") com `flex-1` herdavam `whitespace-nowrap` do `Button` (`button.tsx:8`) → min-content maior que o viewport em tela estreita.
  - **Correção**: Em `src/routes/app.nutricao.tsx:816`, `flex gap-2` → **`flex flex-wrap gap-2`**. Em tela larga ficam lado a lado; em celular empilham (largura total cada). Build validado.
  - **Achado de UX (não alterado, decisão do usuário)**: Existem duas portas de adição de alimento — o "+" adiciona por nome (Open Food Facts → IA, **não consulta `food_library`**), e "Meus alimentos" (`FoodLibrary`) no final da página adiciona escolhendo da lista salva. O usuário entendeu a lógica e optou por manter por enquanto. Decisão em aberto: unificar (busca na biblioteca dentro do "+") ou fazer o `lookupNutrition` consultar a biblioteca antes da internet/IA.
- **Status**: Concluído, `npm run build` validado. Re-teste manual do "+" no celular pendente.

## [02/08/2026] - Claude Code (Scanner salva na biblioteca + Confiança/Próxima ação no chat)
- **Escopo**:
  - **"Salvar na biblioteca" pós-scan**: Em `src/routes/app.nutricao.tsx`, nova função `saveToLibrary` que insere o alimento preenchido no modal (scanner, busca manual ou IA) em `food_library`, com dedup por nome (case-insensitive via `.ilike`). Botão `outline` "Salvar na biblioteca" (ícone Apple) ao lado do "Adicionar" no diálogo. Categoria default "Outros". Payload espelha o insert do `FoodLibrary`.
  - **Confiança + próxima ação no chat**: Em `src/server-fns/chat.functions.ts`, `fetchUserContext` agora retorna `stats` (workoutCount/mealCount/weightCount/waterCount) contados dos arrays já buscados (zero queries extras); `sendChat` calcula `confidence` e `nextAction` com a mesma heurística determinística do `coachAdvice` e retorna `{ reply, confidence, nextAction }` — o banco persiste só o `reply`.
  - **Chip de confiança na UI**: Em `src/routes/app.chat.tsx`, tipo `Msg` ganhou `confidence?`/`nextAction?`; a última resposta ao vivo exibe chip colorido (baixa=amber, média=azul, alta=verde) + linha de próxima ação. Histórico recarregado fica sem chips.
  - **Sem json_schema**: Loop de `tools` (record_meal/record_workout) e prompt de IA **intactos**. Achado-chave registrado: o `coachAdvice` **não usa** `response_format` — confiança/plano são computados em JS deterministicamente.
  - **Docs**: `doc/changelog/FIXLOG.md` (sessão 02/08), `doc/roadmap/melhorias.md` (item4 concluído, item5 parcial, item2 esclarecido).
- **Status**: Concluído, `npm run build` validado (Client + SSR). Teste manual do scanner e do tool-use do chat pendente pelo usuário.

## [01/08/2026] - Claude Code (Biblioteca de Alimentos na aba Nutrição)
- **Escopo**:
  - **Nova migration**: `supabase/migrations/20260801000000_food_library.sql` cria a tabela `food_library` (id, user_id, name, category, grams, calories, protein_g, carbs_g, fat_g, created_at) com RLS e índice em `user_id`.
  - **Tipagem Supabase**: Bloco `food_library` (Row/Insert/Update) adicionado em `src/integrations/supabase/types.ts`.
  - **Pack de alimentos TACO**: `src/lib/food-pack-taco.ts` com `FOOD_PACK` (~50 alimentos brasileiros comuns por 100g) e `FOOD_CATEGORIES` (8 categorias).
  - **Componente `FoodLibrary`**: `src/components/FoodLibrary.tsx` com busca, criar/editar alimento (botão "Calcular macros com IA" reusando `lookupNutrition`), importar pack em 1 clique, e adicionar à refeição com gramas flexíveis + recálculo dos macros em tempo real.
  - **Integração**: `src/routes/app.nutricao.tsx` renderiza `<FoodLibrary>` ao final, reutilizando `ensureMeal` e `load` existentes. Favoritos e Recentes não foram alterados.
  - **Documentação**: `doc/plans/food_library.md` com decisões, schema, fluxo de recálculo e verificação.
- **Status**: Concluído, type-check e lint validados nos arquivos novos. Migration pendente de aplicação no Supabase (`supabase db push`).

## [24/06/2026] - Antigravity (Correção de ID do Modelo OpenRouter: qwen-2.5-72b-instruct)
- **Escopo**:
  - **Correção do model ID**: Em `src/server-fns/ai-settings.functions.ts:18`, o `TEXT_MODELS["openrouter"]` estava com `"qwen/qwen2.5-72b-instruct"` (sem traço), que não é um modelo válido no OpenRouter. Corrigido para `"qwen/qwen-2.5-72b-instruct"`.
  - **Erro resolvido**: IA de diagnóstico de bioimpedância retornava erro 400 `"not a valid model ID"` ao tentar usar o modelo errado.
- **Status**: Concluído, type-check validado.

## [24/06/2026] - Antigravity (Correção do Botão Excluir Bioimpedância sem Clique)
- **Escopo**:
  - **Correção de z-index**: O botão 🗑️ (Trash2) em `src/routes/app.corpo.tsx` estava sem clique porque ficava atrás do `div` decorativo `blur-xl` no canto do Card. Adicionado `z-10` e `pointer-events-auto` ao `<Button>` para garantir que ele fique acima no empilhamento e receba eventos de clique.
- **Status**: Concluído, type-check validado.

## [24/06/2026] - Antigravity (Correção de Datas UTC vs Local em Todo o App)
- **Escopo**:
  - **Nova função `getLocalDate()`**: Criada em `src/lib/utils.ts` para retornar data local (YYYY-MM-DD) em vez de data UTC.
  - **Substituição em 12 arquivos**: Todas as ocorrências de `new Date().toISOString().slice(0, 10)` substituídas por `getLocalDate()` em `app.nutricao.tsx`, `app.index.tsx`, `app.coach.tsx`, `app.corpo.tsx`, `app.medidas.tsx`, `app.peso.tsx`, `app.receitas.$id.tsx`, `app.relatorio.tsx`, `app.nutricao-historico.tsx`, `app.treinos.index.tsx`, `app.templates.index.tsx`.
  - **Correção do `findTodayWorkout`**: Em `app.index.tsx`, query de `completed_at` (timestamptz) agora calcula range UTC correto via `setHours(0/23/59)` para refletir o dia local.
- **Status**: Concluído, build de produção validado com sucesso.

## [24/06/2026] - Antigravity (Correção do Scanner de Bioimpedância: Leitura, Confirmação e Erro de Análise)
- **Escopo**:
  - **Correção da Resolução**: Aumento de 600px para 1200px e JPEG 60% para 85% no redimensionamento da foto do exame em `src/routes/app.corpo.tsx`, com `willReadFrequently: true`.
  - **Prompt da IA Vision Aprimorado**: Em `src/server-fns/corpo.functions.ts`, instrução explícita para NÃO inventar campos ausentes (Massa Óssea e Água Corporal não aparecem em laudos de farmácia brasileiros), com dupla verificação de números e aumento de `maxTokens` de 500 para 800.
  - **Modal de Confirmação**: Novo fluxo em `src/routes/app.corpo.tsx` que exibe card de revisão com todos os valores detectados e sanity checks antes de preencher o formulário (botões "Confirmar & Preencher" / "Cancelar").
  - **Correção do Erro "ao analisar registro de impedância"**: Troca de `.single()` para `.maybeSingle()` no fetch do profile em `analyzeBioimpedanceLog` para não quebrar se o perfil não existir. Adicionada exibição da mensagem real de erro no toast em vez de mensagem genérica.
  - **Validação de Sanidade**: Sanity checks rigorosos exibidos inline no card de confirmação (valores suspeitos destacados em laranja).
  - **Correção do Botão Apagar**: Adicionado `data-delete-btn="true"` no botão de lixeira + verificação `e.target.closest("[data-delete-btn]")` no `Card.onClick` para impedir que o clique no botão de excluir abrisse acidentalmente a análise IA (`src/routes/app.corpo.tsx`).
- **Status**: Concluído, build de produção validado com sucesso.

## [23/06/2026] - Antigravity (Perfil Corporal & Bioimpedância)
- **Escopo**:
  - **Novas Migrations**: Criação de `20260623000001_add_profile_columns.sql` para adicionar campos de dados pessoais (`sex`, `height_cm`, `birth_date`) em `profiles`, e `20260623000002_bioimpedance_logs.sql` para a tabela `bioimpedance_logs` com suporte a RLS.
  - **Tipagem Supabase**: Sincronização do arquivo `src/integrations/supabase/types.ts`.
  - **Server Functions**: Desenvolvimento de `corpo.functions.ts` com cálculo local de TDEE/TMB (Mifflin-St Jeor) e diagnósticos de IA com base em múltiplos pilares no Groq.
  - **Interface do Usuário**: Criação da rota `app.corpo.tsx` fornecendo tabs para edição de perfil, cards metabólicos dinâmicos, gráficos evolutivos de bioimpedância (`recharts`), formulários interativos e diagnósticos por IA. Integração no menu inferior do app (`app.tsx`).
- **Status**: Concluído, build de produção validado com sucesso.

## [22/06/2026] - Antigravity (Melhoria de Responsividade e Espaçamento nas Abas de Medidas)
- **Escopo**:
  - **Responsividade e Spacing em Abas**: Correção da renderização de abas em `src/routes/app.medidas.tsx`. Adicionado `gap-1` na lista de abas para distanciamento elegante. Implementada a exibição dinâmica de nomes simplificados em telas menores ("Evolução", "Histórico", "Comparador") com expansão para nomes completos em telas maiores, além do alinhamento flexível e centralizado dos ícones com `shrink-0`.
- **Status**: Concluído, build de produção validado com sucesso.

## [21/06/2026] - Antigravity (Comparador IA de Medidas e Peso Corporal)
- **Escopo**:
  - **Server Function de Comparação**: Criação de `compareMeasurementsWithAi` em `src/server-fns/medidas.functions.ts` para buscar circunferências e pesos nas duas datas selecionadas (com fallback inteligente para o peso mais recente até cada data) e invocar a Groq API.
  - **Aba "Comparador IA"**: Implementação de nova aba em `src/routes/app.medidas.tsx` com seletores de datas filtrados, exibição de resumos de peso e medidas de cada dia e card estilizado para o relatório de diagnóstico da evolução.
- **Status**: Concluído, build de produção validado com sucesso.

## [16/06/2026] - Antigravity (Refatoração, Desacoplamento e Explicabilidade do Coach IA)
- **Escopo**:
  - **Funções Auxiliares**: Extração e isolamento das lógicas de leitura de contexto (`fetchUserContext`), gravação de histórico de mensagens (`saveChatMessage`), chamadas de rede à Groq API (`callGroqAPI`), gravação de refeições (`executeRecordMeal`), e gravação de treinos (`executeRecordWorkout`).
  - **Fluxo Principal Simplificado**: Refatoração do orquestrador principal `sendChat` em `src/server-fns/chat.functions.ts` para coordenar essas chamadas com tratamento de erros localizado por ferramenta.
  - **Explicabilidade da IA**: Integração do histórico de treinos e medidas corporais (com formatação detalhada de evolução de cm e séries de exercícios) ao contexto do Coach IA, e alteração do system prompt para exigir a citação de dados específicos (datas, exercícios, cargas, peso) nas análises.
- **Status**: Concluído, build de produção validado com sucesso.

## [02/06/2026] - Antigravity (Sugestão de Progressão de Carga Sempre Ativa no Coach IA)
- **Escopo**:
  - **Nova Flag `COACH_ALWAYS_SUGGEST`**: Adição de variável de ambiente que, quando `true`, injeta instrução no system prompt do Coach IA para sempre sugerir aumento de carga ao usuário em todos os treinos, independentemente do histórico disponível.
  - **Refatoração do System Prompt**: Limpeza de indentação do template literal e adição de concatenação condicional em `src/server-fns/chat.functions.ts`.
- **Status**: Concluído, build validado com sucesso.

## [02/06/2026] - Antigravity (Reestruturação de Treinos: Separação de Templates e Histórico)
- **Escopo**:
  - **Separação de Histórico**: Criação das novas tabelas `workout_sessions` e `workout_session_sets` no Supabase para representar as sessões de treino reais executadas pelo usuário, separando-as do template de treino (ficha).
  - **Migração Automática**: Bloco PL/pgSQL na nova migration para migrar todo o histórico atual (séries completadas anteriormente) para as novas tabelas sem perda de dados.
  - **Telas de Detalhe e Foco**: Refatoração das telas de treino (`app.treinos.$id.tsx` e `app.treinos.$id.foco.tsx`) para usar estado local (React) e cache temporário no `localStorage` sob a chave `active-session-{id}`. Isso elimina o lag/travamento de chamadas à rede ao digitar cargas e repetições (antes ocorria `onChange` no Supabase).
  - **Botão Finalizar**: Adicionados botões para Finalizar e Reiniciar treinos. Ao finalizar, os dados são gravados em lote nas tabelas de histórico e os valores padrão de carga/repetição são propagados de volta ao template para a progressão de carga futura.
  - **Duplicação de Treino**: Correção do botão "Duplicar" para copiar o treino, exercícios e séries correspondentes de forma completa.
  - **Dashboard, Relatórios e Coach IA**: Atualização de todas as queries no dashboard (`app.index.tsx`), relatórios PDF (`app.relatorio.tsx`), histórico individual de exercício (`app.exercicios.$name.tsx`) e server functions da IA (`medidas.functions.ts` e `chat.functions.ts`) para ler dados a partir do histórico de sessões.
- **Status**: Concluído, testado com build de produção com sucesso.

## [29/05/2026] - Antigravity (Persistência de Treinos Concluídos no Supabase)
- **Escopo**:
  - **Migração do localStorage**: Remoção da dependência do `localStorage` para rastrear séries de exercícios concluídas (`workout-completed-*`).
  - **Uso da Coluna `sets.completed`**: Aproveitamento da coluna `completed` (boolean) já existente na tabela `sets` do Supabase para persistência real e sincronização entre múltiplos dispositivos.
  - **Atualização das Telas de Treino**: Refatoração da tela de treino detalhado (`app.treinos.$id.tsx`) e do modo foco (`app.treinos.$id.foco.tsx`) para carregar o status e alternar a conclusão de séries diretamente no banco, atualizando o estado do componente de forma otimista.
  - **Ajustes no Dashboard e Relatórios**: Atualização da lógica de detecção de treino atual no Dashboard (`app.index.tsx`) e renderização/exportação de histórico no Relatório PDF (`app.relatorio.tsx`) para consultar o Supabase, removendo o rastreamento via navegador.
  - **Sincronização Automática**: Criação de rotina em `app.tsx` para detectar conclusões de treinos antigas salvas no `localStorage` do celular/navegador e enviá-las para o Supabase de forma transparente, prevenindo perda de histórico.
- **Status**: Concluído e validado.

## [29/05/2026] - Antigravity (Melhorias no Dashboard de Medidas e Detalhamento do Coach IA)
- **Escopo**:
  - **Explicação do Coach IA**: Banner premium interativo descrevendo detalhadamente a mecânica de cruzamento analítico de medidas + treinos dos últimos 30 dias (via Groq API com LLaMA 3.3 70B), com botão colapsável de detalhes.
  - **Correção de Autenticação do Coach IA**: Correção de falha silenciosa de autorização (HTTP 401) ao acionar a IA. Adicionada a desestruturação do token `session` de `useAuth()` e inserido o header de autorização `Authorization: Bearer ${session?.access_token}` na chamada de `analyzeMeasurements()`, alinhando-se com a validação rigorosa do middleware `requireSupabaseAuth`.
  - **Cards Bento Grid de Medidas**: Redesenho dos cards principais para incluir a data exata do registro, medição anterior para comparação rápida, e tags de tendência inteligentes com cores baseadas em objetivos (ex: cintura caindo = verde/sucesso; braço subindo = verde/sucesso para hipertrofia).
  - **Tabs de Exibição**: Criação de abas de exibição para separar a "Evolução Individual" (com o gráfico e histórico da medida selecionada) do "Histórico Geral em Linha do Tempo" (uma timeline vertical unificada que agrupa todas as medições feitas em cada data).
- **Status**: Concluído, validado no build do compilador com sucesso.

## [27/05/2026] - Antigravity (Correção de Esquemas de Ferramentas no Coach IA)
- **Escopo**:
  - **Correção no Coach IA**: Correção de erros de validação de ferramentas (`record_workout` e `record_meal`) no arquivo `src/server-fns/chat.functions.ts`. Alterado o tipo dos campos numéricos (`reps`, `weight_kg`, `calories`, `protein_g`, `carbs_g`, `fat_g`) para `string` com descrições específicas para evitar falhas de validação de JSON schema do Groq. Adicionada conversão robusta para `Number()` antes de inserir os dados no banco de dados.
- **Status**: Concluído e logado.


## [27/05/2026] - Antigravity (Migração de Supabase e Análise de Medidas com IA)
- **Escopo**:
  - **Análise de Medidas**: Criação de nova server function `src/server-fns/medidas.functions.ts` para cruzar dados de treinos dos últimos 30 dias com a evolução de medidas corporais via Groq API (LLaMA-3.3-70b-versatile).
  - Atualização da rota `app.medidas.tsx` adicionando o botão "Coach IA", carregamento e resposta em markdown.
  - **Migração do Supabase**:
    - Geração do dump completo do schema em `supabase/schema_completo.sql`.
    - Atualização de variáveis de ambiente no arquivo `.env` para o novo projeto do Supabase (`haavrgglnfbchiygspqw`).
    - Substituição de referências estáticas antigas (`mglvkocauwsdqbkqbyqi`) pelo novo ID do projeto no código fonte: `src/integrations/supabase/client.ts`, `supabase/config.toml` e `wrangler.jsonc`.
- **Status**: Concluído, testado e logado.


## [26/05/2026] - Antigravity (Melhorias Scanner e Medidas)
- **Escopo**:
  - Investigação de uso da câmera no projeto e localização do `BarcodeScanner.tsx`.
  - Melhorias aplicadas em `BarcodeScanner.tsx` alterando constraints de vídeo para resolução HD, fixando `facingMode: "environment"` e adicionando a flag `TRY_HARDER`.
  - Criação de nova estrutura (Fullstack) para armazenar Medidas Corporais.
  - Implementação de `supabase/migrations/20260527003000_add_body_measurements.sql` criando a tabela de dados, foreign keys para `users` e habilitando RLS.
  - Criação da tela `app.medidas.tsx` provendo gráficos de histórico (`recharts`) e interface de registro categorizada.
  - Atualização do arquivo `app.tsx` inserindo novo ícone `Ruler` com navegação para a nova rota.
  - Adição de animações `.scanline` ao `styles.css`.
- **Status**: Concluído, testado localmente (build sucesso) e commitado para o repositório principal do GitHub.

## [08/06/2026] - Antigravity (Catálogo de Exercícios Pré-Definido)
- **Escopo**:
  - **Nova Tabela `exercise_catalog`**: Criação da migration `20260608000000_exercise_catalog.sql` com tabela e seed de 30 exercícios (lista fornecida pelo usuário), RLS liberado para leitura por usuários autenticados.
  - **Picker no Dialog de Novo Exercício**: Substituição do input simples por um `Command` (cmdk) com busca, lista filtrável do catálogo e opção de nome personalizado quando o exercício não está na lista.
- **Status**: Concluído, build de produção validado com sucesso.

## [08/06/2026] - Antigravity (Correção do Campo "Porção" em Nutrição e Receitas)
- **Escopo**:
  - **Correção do bug "fica 0 sempre"**: Nos campos de Porção (g) em `app.nutricao.tsx`, `app.receitas.$id.tsx` e `app.receitas.index.tsx`, o estado do input foi alterado de `number` para `number | ""` para permitir que o usuário apague o valor sugerido e digite outro sem ver `0` no meio da digitação.
  - **Ajuste de tipos**: Onde `grams`, `servings` e `portions` são usados em chamadas ao banco ou IA, foram adicionadas conversões com fallback (`Number() || 100/1/0`) para garantir type safety.
- **Status**: Concluído, type-check validado com sucesso.

## [08/06/2026] - Antigravity (Correção do Barcode Scanner: Substituição do ZXing pela API nativa BarcodeDetector)
- **Escopo**:
  - **Troca do ZXing pela `BarcodeDetector` API**: Remoção total do `@zxing/browser` e `@zxing/library`. O ZXing apresentava problemas de detecção (decode nunca achava códigos de barras, mesmo com canvas snapshot e RGBLuminanceSource com Int32Array ARGB). Substituído pela API nativa `BarcodeDetector` (Chrome Android 85+), que detecta códigos de barras de forma nativa e confiável.
  - **Preview ao vivo + botão de captura**: `getUserMedia` para preview da câmera traseira, botão circular "Capturar" que tira snapshot do frame do vídeo e passa para o `BarcodeDetector.detect(canvas)`.
- **Status**: Concluído.

## [08/06/2026] - Antigravity (Busca em Tempo Real via Open Food Facts na Nutrition)
- **Escopo**:
  - **Open Food Facts como fonte primária**: Em `src/server-fns/nutrition.functions.ts`, antes de chamar a Groq IA, o `lookupNutrition` agora faz uma busca na API pública do Open Food Facts pelo nome do alimento. Se encontrar produto com dados nutricionais válidos, retorna os macros reais proporcionais aos gramas solicitados.
  - **Fallback IA**: Se OFF não achar nada ou der erro, cai no fluxo existente da Groq API (LLaMA 3.3 70B + tabela TACO).
- **Status**: Concluído, type-check validado com sucesso.

## [20/06/2026] - Antigravity (Melhoria na Detecção de Códigos Pequenos: Zoom Digital)
- **Escopo**:
  - **Zoom Digital**: Implementação de controle de zoom nativo via `applyConstraints({ advanced: [{ zoom }] })` no `BarcodeScanner.tsx` para permitir a leitura de códigos de barras pequenos sem perda de foco.
  - **Interface de Controle**: Adição de botões de Zoom In/Out e indicador de nível de zoom na UI do scanner.
  - **Detecção Dinâmica**: Implementação de leitura de capabilities do hardware para definir o range de zoom disponível.
- **Status**: Concluído, validado localmente.

## [20/06/2026] - Antigravity (Correção de Leitura do Barcode Scanner: Torch, Crop, 720p)
- **Escopo**:
  - **Torch/Flash**: Adicionado botão de ativar/desativar o flash da câmera via `track.applyConstraints({ advanced: [{ torch: true }] })`. Detecta automaticamente se o dispositivo suporta a funcionalidade.
  - **Crop do Canvas**: O `BarcodeDetector` agora recebe apenas a região do guia visual (calculada com math de `object-fit: cover`), em vez do frame inteiro — aumento drástico na taxa de acerto.
  - **Resolução 720p**: Constraints alteradas de `1920x1080` para `1280x720` com fallback para qualquer resolução, eliminando motion blur em celulares de gama média.
  - **willReadFrequently**: Adicionada flag `{ willReadFrequently: true }` ao contexto 2D do canvas para performance.
- **Status**: Concluído, type-check validado.

## [20/06/2026] - Antigravity (Leitura por Foto Local, Câmera Nativa e Porção Detectada)
- **Escopo**:
  - **Câmera Nativa como fallback**: Adição de botão `Camera nativa` no scanner de nutrição para abrir a captura de imagem do próprio celular, tirar uma foto e ler o código a partir dela, sem mandar imagem para IA.
  - **Leitura local da imagem**: A foto é comprimida/redimensionada localmente antes da leitura e descartada logo depois, preservando tokens e evitando upload desnecessário.
  - **Porção real do produto**: Ajuste do fluxo de barcode em `app.nutricao.tsx` para usar `serving_size` ou `quantity` quando disponíveis, evitando assumir `100g` cegamente para produtos como whey de `30g`.
  - **Chip de origem no modal**: Inclusão de um chip visual no topo do modal indicando a origem da porção detectada, com cores diferentes para `barcode`, `IA` e `manual`.
  - **Escala de macros**: Criação de lógica auxiliar para escalar macros por porção real detectada, com fallback para os campos por `100g` quando não há medida de porção disponível.
- **Status**: Concluído, build de produção validado com sucesso.

## [24/06/2026] - Antigravity (Correção de Extração de Data no Scanner de Bioimpedância)
- **Escopo**:
  - **Prompt da IA Aprimorado**: Em `src/server-fns/corpo.functions.ts`, instruções específicas para extração de data em laudos brasileiros: formato DD/MM/AAAA → YYYY-MM-DD, prioridade para "Data do Exame", proibição de usar data de nascimento/impressão/validade, e retorno null se ilegível
  - **Validação Client-Side**: Em `src/routes/app.corpo.tsx`, validação pós-extração que rejeita datas inválidas, futuras ou anteriores a 2020, com toast avisando "Data do exame não reconhecida — preencha manualmente"
- **Status**: Concluído, build de produção validado com sucesso.

## [24/06/2026] - Antigravity (Scanner de Bioimpedância com IA Vision)
- **Escopo**:
  - **Nova Server Function**: Criação de `analyzeBioimpedancePhoto` em `src/server-fns/corpo.functions.ts` para receber foto de exame de bioimpedância, extrair valores numéricos via modelo vision (`qwen/qwen2.5-vl-72b-instruct`) com `maxTokens: 500` e retornar JSON estruturado com os 9 campos.
  - **Interface do Usuário**: Adição de dois botões ("Câmera" e "Galeria") dentro do Dialog de bioimpedância em `src/routes/app.corpo.tsx`. Aceita imagem da câmera (`capture="environment"`) ou galeria (`accept="image/*"`), comprime client-side (600px, JPEG 60%), envia para a IA e preenche automaticamente os campos detectados. O formulário manual continua disponível.
- **Correções de Precisão**: Prompt da IA expandido com mapeamento completo de sinônimos de laudos brasileiros (`Músculo Esquelético` → `muscle_mass_kg`, `Metabolismo Basal` → `bmr_machine`, `Idade Corporal` → `metabolic_age`, etc.) para reduzir erros de nomenclatura. Adicionada validação de sanidade client-side com ranges realistas (gordura 3-60%, músculo 15-120kg, visceral 1-30, etc.) e preview dos valores detectados no toast de sucesso.
- **Status**: Concluído, build de produção validado com sucesso.

## [09/06/2026] - Antigravity (Melhorias no Barcode Scanner e Busca por Código de Barras)
- **Escopo**:
  - **Resolução HD na câmera**: Constraints do `getUserMedia` alteradas de `facingMode: { ideal: "environment" }` para `facingMode: "environment"` (exato) e adicionadas `width: { ideal: 1920 }, height: { ideal: 1080 }` em `src/components/BarcodeScanner.tsx`.
  - **Detecção contínua automática**: Substituída captura manual (botão "Capturar") por loop de detecção a cada 500ms via `requestAnimationFrame` + `BarcodeDetector.detect()`. Adicionado campo de input manual na parte inferior para digitar o código à mão.
  - **Fallback IA no lookup por código**: Em `src/routes/app.nutricao.tsx`, quando o Open Food Facts não encontra o produto pelo código de barras direto, cai no `lookupNutrition` (busca por texto + IA Groq). Se tudo falhar, abre o diálogo em modo manual para o usuário preencher.
  - **Reset de estado**: Toda nova leitura de código de barras agora reseta todos os estados (`query`, `manual`, `mCal`, etc.) antes de preencher, evitando que dados de uma leitura anterior "vazem" para a atual.
- **Status**: Concluído, testado, commits sucessivos enviados ao GitHub.

## [15/07/2026] - Antigravity (Organização de Docs, Correções e Error Boundary)
- **Escopo**:
  - **Organização da documentação**: Criação de `doc/` com subpastas (changelog, roadmap, plans) e `doc/INDEX.md`. Movidos AGENTS.md, FIXLOG.md, melhorias.md, etc. para a estrutura organizada.
  - **README.md atualizado**: Adicionadas features faltantes (Corpo/Bioimpedância, Tela de IA, Receitas, Chat, Peso, Metas), server functions completas, secrets de produção.
  - **melhorias.md atualizado**: Status real das implementações (concluídas, parciais, pendentes).
  - **Dead code removido**: `@zxing/browser` e `@zxing/library` do package.json, scripts temporários (test-gemini, get-models), função `callGroqAPI` em chat.functions.ts.
  - **Navegação Coach/Chat**: Adicionados botões de navegação entre `/app/chat` e `/app/coach`.
- **Status**: Concluído, build de produção validado com sucesso.

## [15/07/2026] - Antigravity (Correção de Bugs: Dashboard, UTC, Error Boundary)
- **Escopo**:
  - **Bug workout_id no Dashboard**: Em `app.index.tsx`, o campo `workout_id` é nullable na tabela `workout_sessions`. Quando null, o link do treino no dashboard quebrava (id vazio). Corrigido: agora verifica se `workout_id` existe antes de usar; se não, cai no fallback do último template.
  - **Datas UTC no Chat**: Em `chat.functions.ts`, `today` e `weekAgo` usavam `toISOString().slice(0,10)` (UTC) em vez de `getLocalDate()`. Isso fazia o chat buscar dados do dia errado para usuários em fusos negativos (ex: Brasil) após as 21h. Corrigido.
  - **Error Boundary**: Adicionado `ErrorBoundary` em `__root.tsx` para capturar erros de renderização e exibir fallback amigável com "Voltar ao início", evitando tela branca.
- **Status**: Concluído, build de produção validado com sucesso.

## [15/07/2026] - Antigravity (date-fns, Nav Mobile e Heatmap)
- **Escopo**:
  - **date-fns removida**: Dependencia nao utilizada em nenhum lugar do codigo. Removida do package.json.
  - **Nav inferior adaptavel**: Texto das abas oculto em telas pequenas (< sm) com hidden sm:block.
  - **Heatmap corrigido**: Datas alteradas de UTC para local (getLocalDate()). Adicionado estado vazio.
- **Status**: Concluido, build de producao validado com sucesso.

## [15/07/2026] - Antigravity (Prevencao de Flash, Aviso Coach e Error Handling)
- **Escopo**:
  - **Flash de tema escuro**: Script inline no head que le localStorage e aplica classe dark/light antes do React hidratar.
  - **Aviso no Coach**: Toast de aviso quando usuario clica em "Gerar analise" sem nenhum registro na semana.
  - **console.error nos catches**: Adicionado log em todos os blocos catch que so tinham toast.error (6 arquivos).
- **Status**: Concluido, build de producao validado com sucesso.

## [15/07/2026] - Antigravity (PWA / Service Worker)
- **Escopo**:
  - **Criacao do Service Worker**: public/sw.js com cache-first para assets estaticos e network-first para navegacao com fallback offline.
  - **Registro no cliente**: Script inline no __root.tsx registra o service worker.
  - **Compatibilidade**: Mantem funcionamento com SSR do TanStack Start e Cloudflare Workers.
- **Status**: Concluido, build de producao validado com sucesso.

## [15/07/2026] - Antigravity (Eliminacao Total de Datas UTC)
- **Escopo**:
  - **6 ocorrencias corrigidas**: Varredura completa encontrou 6 usos de toISOString().slice(0,10) que deveriam usar getLocalDate():
    - chat.functions.ts:123 - formatacao de data de treino no contexto da IA
    - corpo.functions.ts:79, 137, 146 - 28d/30d/7d atras para queries de perfil
    - medidas.functions.ts:38 - 30d atras para analise de medidas
    - use-reminders.tsx:33 - todayKey para lembretes
  - **Import adicionado**: getLocalDate importado nos 3 arquivos que nao tinham.
- **Status**: Concluido, build de producao validado com sucesso.

## [15/07/2026] - Antigravity (Limpeza de Logs e .env.example)
- **Escopo**:
  - **Remocao de arquivos temporarios**: dev.log e vite-dev.log deletados da raiz do projeto.
  - **.env.example atualizado**: Adicionadas OMNIROUTE_API_KEY e OMNIROUTE_BASE_URL.
- **Status**: Concluido, build de producao validado com sucesso.

## [15/07/2026] - Antigravity (Datas UTC no Relatorio PDF e Historico de Exercicios)
- **Escopo**:
  - **Relatorio PDF**: Em `app.relatorio.tsx`, a funcao `loadCompletedLogs` usava `completed_at.slice(0,10)` (UTC) para formatar data dos treinos. Substituido por `getLocalDate()`.
  - **Historico de Exercicios**: Em `app.exercicios.$name.tsx`, mesma correcao no agrupamento por data.
  - **Varredura final**: Zero ocorrencias de `.slice(0, 10)` em todo o diretorio `src/`.
- **Status**: Concluido, build de producao validado com sucesso.

## [15/07/2026] - Antigravity (Provedor NVIDIA)
- **Escopo**:
  - **Novo provedor NVIDIA**: Adicionado `nvidia` como provider em `ai-settings.functions.ts`, com endpoint `https://integrate.api.nvidia.com/v1/chat/completions` e modelo `nvidia/llama-3.1-nemotron-70b-instruct`.
  - **Tela de IA atualizada**: `app.ia.tsx` agora inclui NVIDIA no select de provedores. A chave é salva no campo `openrouter_api_key` do banco (API compativel com formato OpenAI).
  - **Sem migration**: Nenhuma alteracao no schema do banco.
- **Status**: Concluido, build de producao validado com sucesso.

## [15/07/2026] - Antigravity (Modelo NVIDIA customizavel)
- **Escopo**:
  - **Campo de modelo**: Adicionado input "Modelo NVIDIA" na tela de IA quando NVIDIA e selecionado. O nome do modelo e salvo no campo `omniroute_base_url` do banco (sem migration).
  - **getTextModel()**: Agora aceita `settings` como parametro opcional. Quando provider e NVIDIA e `nvidia_model` existe, usa o modelo personalizado em vez do padrao.
  - **Atualizacao em cascata**: Todos os callers de `getTextModel` em nutrition, corpo, medidas e chat agora passam `settings`.
- **Status**: Concluido, build de producao validado com sucesso.

## [15/07/2026] - Antigravity (Busca de modelos NVIDIA e correcoes)
- **Escopo**:
  - **Busca de modelos**: Criada server function `fetchNvidiaModels` que chama `GET /v1/models` da NVIDIA e retorna todos os modelos disponiveis.
  - **Select com busca**: Substituido input text por select + botao refresh. Usuario cola a chave, clica em buscar e ve todos os modelos.
  - **Correcao CORS**: Convertida funcao para `createServerFn` para evitar bloqueio CORS do navegador.
  - **Correcao baseUrl**: `callAiChatCompletion` usava `baseUrl` para NVIDIA, mas ele continha o nome do modelo (salvo em `omniroute_base_url`). Corrigido: `baseUrl` so usado para OmniRoute.
  - **Migration**: Criada `20260715000000_ai_settings_nvidia_provider.sql` para adicionar `nvidia` ao CHECK constraint do provider.
- **Status**: Concluido, build de producao validado com sucesso.

## [23/07/2026] - Claude Code (Heatmap substituído por card de adesão em texto)
- **Escopo**:
  - **Heatmap removido**: Substituído o grid visual de quadrados coloridos (GitHub-style contribution chart) por um card combinando uma barra de progresso de adesão + 4 mini-cards com stats em texto (sequência, média kcal, dias na meta, meta calórica).
  - **Arquivo**: `src/components/Heatmap.tsx` — reescrito completamente.
  - **Sem novas queries**: Reusa os mesmos dados que o heatmap já buscava.
- **Status**: Concluido, commitado e enviado ao GitHub.

## [23/07/2026] - Claude Code (Descanso 60s e Beep mais alto)
- **Escopo**:
  - **Descanso 90s → 60s**: Alterado `restPreset` de `90` para `60` em `app.treinos.$id.tsx` e `app.treinos.$id.foco.tsx`.
  - **Beep mais alto**: Em `src/lib/utils.ts`, `playBeep` teve gain aumentado de `0.5` para `1.0` e `beepLen` de `0.25s` para `0.4s`.
- **Status**: Concluido, commitado e enviado ao GitHub.

## [24/07/2026] - Claude Code (Som do Descanso Ascendente para cortar música no fone)
- **Escopo**:
  - **Frequências alteradas**: `playBeep` em `src/lib/utils.ts` mudou de `[880, 660, 880]` (nota do meio mais grave) para `[800, 1200, 1600]` (escala ascendente).
  - **Frequência aguda**: 1600Hz corta melhor a música no fone — faixa que instrumentos e vocais não ocupam.
  - **Padrão mais rápido**: `beepLen` de `0.4s` → `0.3s`, gap de `0.2s` → `0.1s` para padrão rítmico mais distinto.
- **Status**: Concluído, commitado e enviado ao GitHub.

## [08/08/2026] - Claude Code (Refeição duplicada: card de calorias em dobro + coach perdido)
- **Escopo**:
  - **Causa-raiz**: duas linhas `meals` para o mesmo (user_id, meal_date, meal_type) — a tela de Nutrição só renderiza a primeira (`meals.find`), a duplicada fica invisível mas o card de calorias e o coach somam as duas. Sem constraint única no banco, "Copiar de ontem" / chat `record_meal` / double-tap criavam duplicadas.
  - **`app.nutricao.tsx`**: `ensureMeal` agora consulta o banco (`maybeSingle`) antes de inserir e trata a corrida 23505; novo guard `writingRef` + `guard(fn)` serializa os 5 caminhos de inserção (double-tap).
  - **`chat.functions.ts`**: `executeRecordMeal` reaproveita a refeição do dia/tipo existente em vez de inserir uma nova a cada `record_meal`.
  - **Migration `20260808000000_dedupe_meals_duplicate.sql`**: reponta itens das duplicadas para a mais antiga, deleta duplicadas, deduplica itens idênticos e cria `UNIQUE INDEX meals(user_id, meal_date, meal_type)`.
- **Status**: Código validado (75 testes verdes, tsc limpo nos arquivos tocados, build OK) **e migration aplicada com sucesso** no Supabase (etapa 1 reescrita em subquery correlacionada por erro `42703` no `UPDATE...FROM` com CTE). Commitado e enviado ao GitHub.

## [08/08/2026] - Claude Code (Auditoria de cálculos + ver ontem: NutDayDetail + fix scanner)
- **Escopo**:
  - **Auditoria de cálculos**: somas diárias corretas (eram infladas por duplicação, já corrigida); escala por gramas OK nos caminhos principais. BUG real achado no **scanner de código de barras**: `refGrams` não era setado → mudar a "Porção (g)" após escanear não reescalava os macros (subestimava kcal).
  - **Fix `app.nutricao.tsx`**: `setRefGrams(null)` no início do scan; `setRefGrams(servingGrams)` no ramo OFF; `setRefGrams(100)` no fallback IA.
  - **NOVO `src/components/nutrition-day-detail.tsx`**: card "Alimentação do dia" com date input (padrão **ontem**), lista refeições/itens do dia agrupadas por tipo com total — integrado no topo de `app.nutricao-historico.tsx`. Efeito depende de `user?.id` (estável), não do objeto `user` (evita re-busca em loop).
- **Status**: Concluído — **78 testes verdes** (75 + 3), tsc limpo nos arquivos tocados, build OK.
