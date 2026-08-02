# Melhorias Sugeridas para o FitWell Hub

Opinião geral: o app já tem uma base forte, com bastante funcionalidade útil e uma IA bem integrada. Mesmo assim, ainda existe espaço importante para melhorar a experiência, principalmente na parte da IA, para deixá-la mais confiante, mais clara e mais útil no dia a dia.

## Status após conferência no código (15/07/2026)

- Concluídas: 1, 3, UX 1, Técnica 1, Técnica 2
- Parciais: 2, UX 2, UX 3
- Pendentes: 4, 5, Técnica 3

## Status atualizado (02/08/2026)

- **Concluída agora:** 4 — confiança + próxima ação foram levadas ao chat conversacional
- **Parcial agora:** 5 — próxima ação no chat; plano semanal completo segue só no `/app/coach`
- **Ainda pendentes:** 2 (saída estruturada de IA real — ver nota no item), Técnica 3 (testes)
- **Nota:** o `coachAdvice` calcula `confidence` e `plan` deterministicamente em JS (não usa `response_format`/json_schema). Ver `doc/changelog/FIXLOG.md` sessão 02/08.

## Status atualizado (02/08/2026 — 2ª parte)

- **Concluída agora:** 5 — plano semanal completo (foco, metas, checklist) também sai no `/app/chat`, sob demanda, num card recolhível
- **Resolvida:** confusão de UX das "duas portas" de adição de alimento → **balcão único** (busca + lista da biblioteca dentro do "+"); ver nota na seção UX
- **Ainda pendentes:** 2 (saída estruturada de IA real — json_schema), Técnica 3 (testes)

## Melhoria de IA

### 1. ✅ Concluída - Dar mais consistência ao Coach IA
O Coach hoje faz muita coisa ao mesmo tempo: monta contexto, chama o modelo, processa ferramentas e grava no banco. Isso funciona, mas pode ficar mais difícil de manter e evoluir.

**O que foi feito:**
- Separadas as responsabilidades dentro de `src/server-fns/chat.functions.ts`
- Extraídas funções: `fetchUserContext`, `saveChatMessage`, `callGroqAPI`, `executeRecordMeal`, `executeRecordWorkout`
- Fluxo principal (`sendChat`) simplificado para coordenar subfunções

### 2. 🔄 Parcial - Usar saída estruturada onde fizer sentido
Nem tudo precisa ser texto livre. Para algumas partes, vale muito mais usar uma estrutura previsível.

**O que foi feito:**
- Criada página `/app/coach` com análise semanal estruturada: `CoachSnapshot` (confidence, nextAction, sources) e `CoachPlan` (title, focus, trainingGoal, checklist)
- Tipos `CoachSnapshot` e `CoachPlan` definidos com TypeScript
- (02/08/2026) Chat ganhou o snapshot: `confidence` + `nextAction` com chip visual na última resposta

**Esclarecimento importante (02/08/2026):** o `coachAdvice` **não usa `response_format`/json_schema** — a IA responde em texto livre e `confidence`/`plan` são computados **deterministicamente em JS** (`buildCoachPlan`). Ou seja, "saída estruturada de IA" (schema JSON real) **não existe** nem no coach. Se for desejada de verdade, é esforço separado e maior.

**Ainda pendente:**
- Saída estruturada de IA real (json_schema) onde fizer sentido — definir escopo
- Sugestão nutricional com formato previsível

### 3. ✅ Concluída - Fazer a IA explicar melhor as conclusões
As respostas ficam mais confiáveis quando a IA mostra de onde tirou a ideia.

**O que foi feito:**
- Integrado histórico de treinos e medidas corporais ao contexto do Coach IA
- System prompt exige citação de dados específicos (datas, exercícios, cargas, peso)
- Página de análise semanal (`/app/coach`) exibe "Base usada" com fontes listadas

### 4. ✅ Concluída - Adicionar nível de confiança e fallback
Quando a IA tiver poucos dados, ela deveria dizer isso claramente.

**Implementado (02/08/2026):**
- Análise semanal (`/app/coach`) tem campo `confidence` (baixa/media/alta)
- Chat conversacional (`/app/chat`) agora também: `sendChat` calcula `confidence` + `nextAction` (mesma heurística do coach) e o frontend exibe chip de confiança + próxima ação sob a última resposta

Exemplo desejado:
- "Tenho poucos treinos recentes, então esta sugestão tem confiança média."
- "Não há histórico suficiente para afirmar progressão com segurança."

### 5. ✅ Concluída - Transformar o Coach em planejador, não só respondedor
Em vez de apenas comentar o que já aconteceu, a IA ajuda a planejar o próximo passo.

**O que foi feito:**
- A análise semanal (`/app/coach`) gera plano com foco da semana, meta de treino, meta nutricional, acompanhamento e checklist
- (02/08/2026) O chat conversacional fecha cada resposta com uma **próxima ação** concreta derivada dos dados
- (02/08/2026) O chat exibe o **plano semanal completo** (foco, metas de treino/nutrição/acompanhamento, checklist, próxima ação) num **card recolhível**, **só quando a pergunta tem intenção de plano** ("plano", "semana", "checklist"...) — via `buildCoachPlan` determinístico em JS (sem json_schema), reutilizando os mesmos helpers do `/coach`

Exemplos desejados para o chat (agora atendidos):
- foco da semana
- meta de treino
- meta nutricional
- checklist + próxima ação

## Melhoria de UX

### 1. ✅ Concluída - Terminar sempre com uma próxima ação prática
O app pode virar menos "painel de dados" e mais "coach de verdade".

**O que foi feito:**
- Análise semanal (`/app/coach`) sempre termina com card "Próxima ação"
- Plano inclui "O que fazer hoje" e "Checklist da semana"

### 2. 🔄 Parcial - Dar feedback visual mais claro quando a IA está pensando
Se a análise demorar, vale mostrar melhor o estado da requisição.

**O que foi feito:**
- Chat (`/app/chat`) tem: "pensando…" com spinner
- Análise semanal tem: "Analisando seus dados…" com spinner

**Ainda pendente:**
- Estados mais granulares: "carregando dados", "analisando", "gerando resposta"
- Falha com motivo claro (já tem toast com mensagem de erro)

### 3. 🔄 Parcial - Melhorar a clareza da interface da IA
A IA pode ficar mais útil se a tela mostrar melhor o que ela está analisando.

**O que foi feito:**
- Análise semanal exibe cards de "Confiança", "Próxima ação" e "Base usada"
- Chat carrega histórico de mensagens do banco

### ✅ Resolvida (02/08/2026) — Confusão de UX: duas portas de adição de alimento na Nutrição
Descoberta em teste no celular: existiam **duas portas de entrada** para adicionar alimento, com padrões diferentes:
- **Botão "+"**: adicionava **por nome** (`lookupNutrition`: Open Food Facts → IA). Não mostrava a biblioteca e a busca **não consultava** `food_library`.
- **"Meus alimentos"** (`FoodLibrary`, final da página): lista salva com busca; clicar num alimento → "Adicionar à refeição" (refeição + porção).

O usuário achou confuso ("por que o + não me deixa escolher da lista?"). **Resolvida com a Opção A (balcão único):** o diálogo do "+" agora tem a seção "Da sua biblioteca" com busca + lista clicável que preenche o formulário (com escala proporcional ao mudar a porção). "Meus alimentos" embaixo passou a ser só **gestão** (criar/editar/importar).

## Melhoria Técnica

### 1. ✅ Concluída - Reduzir acoplamento entre IA e gravação em banco
A parte de IA pode ficar mais saudável se a geração da resposta e o salvamento das informações forem etapas mais separadas.

**O que foi feito:**
- Refatoração do `chat.functions.ts` com funções separadas por responsabilidade
- `callGroqAPI` encapsula chamadas HTTP
- `executeRecordMeal` e `executeRecordWorkout` isolam persistência

### 2. ✅ Concluída - Padronizar melhor a estratégia de IA
Já existe uma boa lógica híbrida no projeto.

**O que foi feito:**
- Open Food Facts como fonte primária, IA como fallback
- Camada compartilhada `ai-settings.functions.ts` para configurar provedor (Groq, OpenRouter, OmniRoute)
- Tela de IA (`/app/ia`) para configurar sem editar `.env`

### 3. ✅ Três baterias entregues (02/08/2026) - Criar testes de avaliação da IA
Antes nada era testado. **Vitest** configurado e a lógica pura foi extraída para módulos testáveis (`src/lib/coach-plan.ts`, `src/lib/food-utils.ts`, `src/lib/ai-settings.ts`). **55 testes verdes** em três baterias:

- **1ª bateria (node):** 27 testes — `buildCoachPlan`/`inferCoachObjective`/`confidenceFromStats`/`nextActionFromStats`, `parseFoodWeight`/`scaleMacros` (scanner) e `getLocalDate`.
- **2ª bateria (jsdom + testing-library):** 11 testes — `rescaleMacros` (nova função pura extraída do diálogo do "+": reescala proporcional de macros ao mudar a porção, kcal = inteiro vs P/C/G 1 casa) e `PlanCard` (componente extraído para `src/components/`, testado com render/expandir/checklist/próxima ação/recolher).
- **3ª bateria (node, unit de providers):** 17 testes — `ai-settings` extraído para `src/lib/ai-settings.ts` (puro): `normalizeAiSettings`, `resolveAiProvider`, `getTextModel`, `resolveAiApiKey`, `resolveAiChatEndpoint`. Cobre detalhes bug-prone: `nvidia` usa `openrouter_api_key`; `nvidia_model` de `omniroute_base_url`; fallback de env por provider.
- **Infra:** `src/test/setup.ts` (jest-dom + cleanup). jsdom ativado por **docblock** `// @vitest-environment jsdom` em `*.component.test.tsx` — **Vitest 4 removeu `environmentMatchGlobs`**.

Casos ainda úteis (próximas etapas):
- resposta do coach com histórico curto (já parcialmente coberto por `confidenceFromStats`)
- treino com dados incompletos (integração)
- busca nutricional com alimento desconhecido (integração / mock)
- foto de prato com muitos itens (integração)
- análise de medidas com poucos registros (integração)
- **renderizar `NutricaoPage`/`ChatPage` inteiras** (mock de supabase/auth/router) — o fluxo ponta-a-ponta do diálogo do "+" (open → buscar biblioteca → tocar item → mudar porção) fica para os testes de integração

## O Que Eu Faria Primeiro

Se fosse escolher só as melhorias com melhor custo-benefício, eu faria nesta ordem:

1. ~~deixar o Coach IA mais estruturado e confiável~~ ✅
2. ~~fazer a IA explicar melhor as conclusões~~ ✅
3. colocar saída estruturada para as respostas mais importantes
4. ~~criar testes de regressão para IA~~ ✅ (primeira bateria Vitest — 27 testes)
5. ~~transformar o Coach em planejador no chat~~ ✅

## Resumo Final

O FitWell Hub já está muito acima da média em funcionalidade, mas a próxima evolução mais valiosa é tornar a IA:
- mais consistente ✅
- mais explicável ✅
- mais previsível 🔄
- mais útil como apoio prático para decisão 🔄

Isso tende a melhorar bastante a experiência do usuário sem exigir uma mudança radical na base do app.

## Proximos Passos (Ideias para o futuro)

### 🧪 Testes automatizados — ✅ Vitest configurado (02/08/2026)
**55 testes verdes** em três baterias, sobre lógica pura extraída em `src/lib/` (`coach-plan.ts`, `food-utils.ts`, `ai-settings.ts`) + componente `src/components/plan-card.tsx`. A testabilidade também removeu o cross-import `chat.functions → nutrition.functions`.

Sugestaes de proximas etapas:
- Testes de integracao para as server functions principais (mock de supabase) — **pendente** (amadurece o padrão de mock pra renderizar `NutricaoPage`/`ChatPage` inteiras)
- Testes de componentes/UI para mais componentes isolados (Dropdown/Select, dialogs) — mesmo padrão do `PlanCard`

### 📦 Bundle splitting
O build produz bundles grandes:
- `supabase` (~702 kB)
- `recharts` (~815 kB)

Esses pacotes poderiam ser carregados sob demanda (lazy loading) para melhorar o carregamento inicial, especialmente em celular.

### 🗑️ Componentes UI nao utilizados
31 componentes shadcn/ui em `src/components/ui/` nao sao importados em lugar nenhum:
accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, calendar, carousel, chart, checkbox, collapsible, context-menu, drawer, dropdown-menu, form, hover-card, input-otp, menubar, navigation-menu, pagination, popover, radio-group, resizable, scroll-area, sidebar, slider, table, textarea, toggle, toggle-group

Nao afetam o bundle (tree-shaking remove), mas poluem o codigo fonte.

### 🔐 Chaves de API criptografadas no Supabase
As chaves (Groq, OpenRouter, NVIDIA, OmniRoute) ficam em texto plano na tabela `ai_settings`. Idealmente deveriam ser criptografadas, mas isso exige migration e logica de cifra.

### 📱 PWA - Service Worker ja implementado ✅
O service worker com cache-first para assets e fallback offline ja esta funcionando desde 15/07/2026.

Proximos refinamentos possiveis (nao prioritarios):
- Estrategia de cache mais refinada para paginas especificas
- Badge de notificacoes no icone do app
- Sincronizacao em background (background sync)

### ⚠️ Limite de requisicoes NVIDIA
A chave gratuita da NVIDIA tem limite de ~48 requisicoes. Para uso em producao, recomenda-se upgrade para conta paga ou uso via OpenRouter (que nao tem esse limite para modelos NVIDIA).
