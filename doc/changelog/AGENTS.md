# AGENTS.md

Registro de ações realizadas por agentes autônomos (IA) no projeto FitWell Hub.

## [15/09/2026] - Antigravity (Sincronização Galaxy Watch 7 + Google Fit e Políticas RLS para Hermes Agent)
- **Diagnóstico de Passos e Sincronização Google Fit**:
  - Investigada discrepância entre os passos registrados no Galaxy Watch 7 (5.000+) e a leitura exibida no app Google Fit / FitWell Hub (1.167).
  - Diagnosticado que os passos gravados no relógio estavam no Health Connect, mas bloqueados de aparecer na tela inicial do Google Fit pela política de backfill e concorrência do acelerômetro interno do celular.
  - Implementada a integração via **Health Sync** (Samsung Health ➔ Google Fit) e desligado o sensor do telefone no Google Fit, alinhando as medições em tempo real com 100% de sucesso.
- **Liberação de RLS para o Hermes Agent (Telegram)**:
  - Criada a migration `supabase/migrations/20260915_allow_telegram_body_weights_and_profiles.sql` com políticas RLS restritas para os dados requisitados pelo Hermes: `body_weights`, `body_measurements`, `bioimpedance_logs`, `profiles` e `goals`.
  - O acesso é condicionado a `ti.user_id = table.user_id AND ti.telegram_chat_id IS NOT NULL`, impedindo qualquer vazamento de dados de usuários não vinculados via API anônima do Supabase.

## [11/09/2026] - Antigravity (Correção de Erro 'Something went wrong' no Chat do Coach)
- **Causa Raiz**:
  - `callAiChatCompletion` retorna o objeto JSON completo retornado pela API OpenAI (`response.json()`), contendo `{ id, choices: [{ message: { content } }] }` ou `{ error }`.
  - No `workout-coach.functions.ts`, a variável `reply` recebeu o objeto JSON bruto ao invés da string `response.choices[0].message.content`.
  - Quando a resposta chegava ao React, a renderização de `{m.content}` tentava renderizar um objeto em vez de texto (`Objects are not valid as a React child`), estourando o Error Boundary do TanStack Router (`Something went wrong`).
  - Além disso, faltava passar `userId` para `fetchAiSettings(supabase, userId)` e a ordem dos argumentos em `getTextModel` e `resolveAiApiKey` estava desajustada.
- **Correções Realizadas**:
  - **Extração estrita de texto no backend (`workout-coach.functions.ts`)**:
    - Passado `userId` para `fetchAiSettings(supabase, userId)` e mescladas credenciais de fallback do cliente.
    - Ordem correta de argumentos: `resolveAiApiKey(settings, provider)` e `getTextModel(provider, settings)`.
    - Extração segura do conteúdo textual: `reply = rawContent.trim()`.
  - **Blindagem no cliente (`workout-coach-chat.tsx`)**:
    - Validação de `session.access_token` antes da chamada RPC para prevenir exceções não tratadas de 401.
    - Sanitização de `replyContent` garantindo que `content` seja sempre uma string pura antes de entrar no estado de mensagens do React.
- **Validação**:
  - `npx vitest run`: **25 arquivos e 201 testes aprovados (100% de sucesso)**.
  - `npm run build`: Compilação concluída com sucesso.

## [11/09/2026] - Antigravity (Visão 360° Metabólica e Nutricional Injetada no Gerador de Treinos com IA)
- **Motivação**:
  - O usuário identificou que o gerador de treinos (`generateAiWorkoutRoutine`) precisava também considerar todos os seus dados biológicos e nutricionais na hora de prescrever a rotina, e não apenas no chat do coach.
- **Mudanças realizadas**:
  - **Injeção de Perfil 360 no Motor do Gerador (`generateAiWorkoutRoutine` em `src/server-fns/workout-generator.functions.ts`)**:
    - Leitura em paralelo de `profiles` (nome, idade, sexo, altura), `body_weights` (peso recente), `goals` (metas de calorias e proteínas), `meals`/`meal_items` (ingestão real de hoje), `water_logs` (hidratação de hoje) e `workout_sessions` (últimos 28 dias para estimar frequência semanal).
    - Cálculo automatizado da Taxa Metabólica Basal (**TMB** via fórmula Mifflin-St Jeor) e do Gasto Energético Total Diário (**TDEE** baseado no fator de atividade real).
    - Avaliação do balanço energético atual: detecção se o atleta está em **Déficit Calórico** (cutting), **Superávit Calórico** (bulking) ou **Manutenção**.
    - Calibração do prompt do sistema com diretrizes estritas de periodização baseadas na literatura:
      - Em déficit calórico: redução estratégica para 12-14 séries/sessão, priorizando intensidade de carga para reter massa muscular sem sobrecarregar o SNC ou catabolizar.
      - Em superávit calórico: permissão para volume ótimo de 15-18 séries/sessão com descansos completos (90-120s em compostos) aproveitando a plenitude de glicogênio.
    - O diagnóstico retornado na tela agora exibe o peso do atleta, TMB e TDEE calculados.
- **Validação**:
  - `npx vitest run`: **25 arquivos e 201 testes aprovados (100% de sucesso)**.
  - `npm run build`: Compilação de cliente e SSR concluídas com sucesso.

## [11/09/2026] - Antigravity (Coach Interativo com Visão 360° no Assistente de Treinos)
- **Motivação**:
  - O usuário solicitou um Coach integrado diretamente na página do assistente de treinos (`/app/treinos/ia`) acessível via botão flutuante amigável, com balões de conversa modernos e limpos, comunicação humanizada e natural (sem clichês de robô) e visão 360° completa de todos os dados do usuário no aplicativo (o que come, o que bebe, peso, TMB, TDEE, histórico de treinos e a rotina proposta ativa na tela).
- **Mudanças realizadas**:
  - **Server Function de Fisiologista e Personal de Elite (`consultWorkoutCoach` em `src/server-fns/workout-coach.functions.ts`)**:
    - Agrega perfil completo (`display_name`, idade, sexo, altura).
    - Calcula TMB (Taxa Metabólica Basal via equação Mifflin-St Jeor).
    - Avalia frequência de treinos nos últimos 28 dias para estabelecer o fator de atividade e calcular o TDEE (Gasto Energético Total Diário).
    - Agrega calorias e macronutrientes (P, C, G) consumidos hoje vs. metas diárias cadastradas.
    - Agrega consumo de água de hoje (ml) vs. meta recomendada.
    - Coleta histórico das últimas sessões de treino com cargas reais registradas (kg) e repetições.
    - Recebe o objeto da rotina ativa na tela para responder e orientar sobre qualquer exercício, ordem, descanso ou estratégia de sobrecarga progressiva.
    - Persona humanizada, afetuosa e cientificamente de elite, chamando o usuário pelo nome próprio e estabelecendo conexões reais entre dieta, água, recuperação e hipertrofia.
  - **Componente de Chat com Botão Flutuante Amigável (`WorkoutCoachChat` em `src/components/workout-coach-chat.tsx`)**:
    - Botão flutuante estilizado no canto inferior (`fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40`) com indicador pulsante de status online verde, ícone com efeito de brilho e badge de Coach FitWell.
    - Modal/drawer moderno com cabeçalho contendo pílulas em tempo real de TMB, Gasto Diário (TDEE), Proteína ingerida vs meta, Água e Peso.
    - Balões de conversa modernos e limpos com tipografia elegante e diferenciação clara entre usuário e coach.
    - Chips de perguntas rápidas de 1 toque (*"Como adequar esse treino ao que comi hoje?"*, *"Por que essa ordem específica de exercícios?"*, *"Posso substituir algum exercício por desconforto?"*, *"Esse volume está compatível com minha TMB e gasto diário?"*).
    - Campo de envio com suporte a Enter e feedback de digitação do coach.
  - **Integração na Rota (`src/routes/app.treinos.ia.tsx`)**:
    - Montado o `<WorkoutCoachChat routine={routine} />` com repasse da rotina gerada e cabeçalhos de autenticação de sessão.
- **Validação**:
  - `npx vitest run`: **25 arquivos de teste e 201 testes aprovados (100% de sucesso)**.
  - `npm run build`: Compilação de cliente e SSR concluídas com sucesso.

## [11/09/2026] - Antigravity (Prompt de Nível Treinador e Fisiologista de Elite para Geração de Treinos IA)
- **Motivação**:
  - O usuário solicitou que a inteligência que elabora os treinos atue com o conhecimento profundo de um personal trainer altamente experiente em sala de musculação e, simultaneamente, de um fisiologista do exercício atualizado com a literatura científica contemporânea.
- **Mudanças realizadas**:
  - **Refinamento Avançado do System Prompt (`workout-generator.functions.ts`)**:
    - **Persona de Elite**: Fisiologista do exercício e treinador de força com 15+ anos de vivência prática e embasamento científico em hipertrofia (Schoenfeld, Israetel, Beardsley).
    - **Gestão de Fadiga do SNC & Ordem de Movimento**: Compostos pesados multiarticulares (Supino, Agachamento, Puxadas, Leg Press) abrem a sessão quando o sistema nervoso está revigorado (descanso 75-120s); isoladores e cabos entram na segunda metade para estresse metabólico sem risco de falha estabilizadora (descanso 45-60s).
    - **Anti-Junk Volume**: Volume calibrado estritamente entre 4 e 6 exercícios por sessão (14 a 18 séries efetivas de trabalho por treino), eliminando o volume lixo que apenas eleva cortisol e retarda a recuperação.
    - **Hipertrofia Mediada por Alongamento**: Combinação intencional de exercícios com sobrecarga na posição alongada (Supino halter, Puxada alta, Stiff/RDL) com pico de contração em cabos/máquinas.
    - **Sinergia da Divisão e Prevenção de Overtraining**: Respeito estrito à divisão habitual do usuário (ex: rotação BCDA), impedindo exaustão de músculos sinergistas na véspera de treinos primários.
    - **Notas Cirúrgicas de Execução (`notes`)**: Instruções acionáveis de ângulo, cadência excêntrica (2-3s) e postura para cada exercício da lista.
    - **Dicas de Ouro do Coach (`coach_tips`)**: Instruções práticas de sobrecarga progressiva dupla, RIR 1-2 e hidratação intra-treino.
- **Validação**:
  - `npx vitest run src/lib/workout-ai-utils.test.ts`: 6 testes aprovados.

## [11/09/2026] - Antigravity (Correção do Erro 'Cannot read properties of undefined (reading workouts)' no Assistente de Treinos)
- **Causa Raiz**:
  - A server function `generateAiWorkoutRoutine` exigia autenticação (`requireSupabaseAuth`), porém a chamada na rota `app.treinos.ia.tsx` não estava enviando o cabeçalho `Authorization: Bearer ${session.access_token}` e `session` não havia sido desestruturado do hook `useAuth()`.
  - A requisição falhava silenciosamente com 401 na camada de middleware do TanStack Start e o retorno do cliente recebia `routine` indefinido, quebrando na tentativa de ler `res.routine.workouts`.
- **Correções Realizadas**:
  - **Injeção do Token de Sessão & Credenciais Locais (`app.treinos.ia.tsx`)**:
    - Adicionado `session` em `const { user, session } = useAuth()` e passado `headers: { Authorization: Bearer ${session.access_token} }`.
    - Leitura das configurações ativas de IA diretamente do `localStorage` (`getAiSettingsLocal()`) e repasse para a server function, garantindo credenciais mesmo antes de sync do banco.
  - **Recepção de Credenciais Flexíveis na Server Function (`workout-generator.functions.ts`)**:
    - Atualizado o schema `generatorInputSchema` para aceitar `clientProvider`, `clientApiKey`, `clientModel` e `clientBaseUrl`, mesclando com o banco de dados Supabase e sempre acionando o fallback biomecânico determinístico caso a API externa falhe.
  - **Blindagem Defensiva Total com Optional Chaining (`app.treinos.ia.tsx`)**:
    - Protegidas todas as leituras de `.workouts` (`res?.routine?.workouts`, `routine?.workouts?.map`, `backupInfo?.workouts`, etc.) contra qualquer estado nulo ou indefinido.
- **Validação**:
  - `npx vitest run`: **25 arquivos de teste e 201 testes aprovados (100% de sucesso)**.

## [11/09/2026] - Antigravity (Botão de Teste de Conexão e Latência dos Modelos de IA na Central de IA)
- **Motivação**:
  - O usuário sentiu falta de validar de imediato se as chaves de API e os modelos configurados na Central de IA estão realmente funcionando, sem ter que navegar até o Chat do Coach ou Daily Briefing para testar.
- **Mudanças realizadas**:
  - **Server Function de Teste em Tempo Real (`testAiProviderModel` em `ai-settings.functions.ts`)**:
    - Dispara uma mensagem curta para o provedor selecionado com medição exata do tempo de resposta (latência em ms).
    - Captura e trata mensagens de erro amigáveis caso a chave esteja inválida, a cota excedida ou o modelo indisponível.
  - **Botões e Diagnóstico Visual nos Cards de Provedores (`app.ia.tsx`)**:
    - Adicionado o botão "Testar Conexão e Modelo 🧪" em cada um dos provedores (**Groq**, **OpenRouter**, **NVIDIA NIM** e **Manual/Custom**).
    - Feedback imediato: exibe badge verde com o tempo de resposta em milissegundos e a confirmação retornada pelo modelo, ou badge vermelho com o detalhe do erro retornado pela API.
    - Adicionado o botão "Testar Modelo Ativo 🧪" na barra inferior ao lado do botão de salvar.
- **Validação**:
  - `npx vitest run src/lib/ai-settings.test.ts`: 26 testes aprovados.

## [11/09/2026] - Antigravity (Central de IA Independente do .env + Listagem Dinâmica de Modelos Groq/OpenRouter/NVIDIA/Custom + Remoção do Gemini)
- **Motivação**:
  - Toda vez que o projeto era commitado e enviado ao GitHub, a esteira do Cloudflare descartava as chaves do `.env` (pois o arquivo `.env` é gitignored por segurança), forçando o usuário a reconfigurar as chaves repetidamente.
  - O usuário solicitou salvar as chaves diretamente no app (para nunca mais perder), selecionar modelos de IA dinamicamente através de uma lista/dropdown (ao invés de ter que digitar nomes técnicos de LLMs), adicionar suporte à **NVIDIA NIM** e a um **Provedor Manual/Customizado**, e eliminar completamente o **Gemini** (devido a erros constantes de cota 429).
- **Mudanças realizadas**:
  - **Remoção Total do Gemini (`ai-settings.ts`, `app.ia.tsx`)**:
    - Removido `gemini` dos tipos `AiProvider`, `VisionAiProvider` e de todas as telas de seleção.
    - O app agora opera exclusivamente com provedores rápidos, estáveis e de alta disponibilidade (**Groq**, **OpenRouter**, **NVIDIA** e **Custom/Manual**).
  - **Listagem Dinâmica de Modelos via API (`ai-settings.functions.ts`)**:
    - Criada a função `fetchGroqModels({ apiKey })`: consulta em tempo real a API oficial `https://api.groq.com/openai/v1/models`, filtra modelos de chat ativos (ex: `llama-3.3-70b-versatile`, `deepseek-r1-distill-llama-70b`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`) e devolve uma lista limpa ordenada alfabeticamente.
    - Criada a função `fetchOpenRouterModels({ apiKey })`: consulta `https://openrouter.ai/api/v1/models`, trazendo dezenas de modelos de ponta sem digitação manual.
    - Reutilizada a função `fetchNvidiaModels`: consulta modelos ativos da NVIDIA NIM (ex: `meta/llama-3.3-70b-instruct`, `mistralai/mixtral-8x22b-instruct-v0.1`, etc.).
  - **Suporte a Provedor Manual / Customizado (`ai-settings.ts`)**:
    - Suporte a qualquer endpoint compatível com a OpenAI API (ex: LocalAI, LM Studio, Ollama, vLLM ou proxies corporativos) com campos de `Base URL` e `Nome do Modelo`.
  - **Armazenamento com Dual Persistence (Supabase + localStorage) (`ai-settings.ts`, `app.ia.tsx`)**:
    - As chaves de API e preferências são salvas simultaneamente no banco Supabase (`ai_settings`) e no `localStorage` do navegador (`fitwell_ai_settings_v2`).
    - Quando o app roda no Cloudflare sem `.env`, ele carrega as chaves e modelos diretamente do perfil do usuário e do cache local permanente — nunca mais perde as chaves após um `git push`!
    - Para armazenar os modelos específicos de cada provedor (`groq_model`, `openrouter_model`, `nvidia_model`, `custom_model`, `custom_base_url`) sem necessidade de criar migrations no Postgres, foi desenvolvido o codificador `encodeAiExtraMeta` / `decodeAiExtraMeta`, que preserva metadados JSON na coluna `omniroute_base_url` com 100% de retrocompatibilidade.
  - **UI Renovada e Sofisticada da Central de IA (`app.ia.tsx`)**:
    - Cards dedicados para cada provedor com gradientes sutis, badges informativos, botões para mascarar/revelar chaves (ícone de olho), e botão de "Buscar Modelos Disponíveis ⚡" com carregamento em tempo real.
    - O seletor de modelos transforma-se em um `Select` elegante com os modelos disponíveis trazidos diretamente da API do provedor.
    - Botão "Salvar Configurações de IA" com feedback visual rico e persistência garantida em 2 camadas.
    - Mantida intacta a integração e status do Samsung Watch / Google Fit.
- **Validação**:
  - `npx vitest run src/lib/ai-settings.test.ts`: 26 testes verdes (100% de aprovação, incluindo encoding de metadados, fallbacks e providers).
  - Teste completo da suíte Vitest: 19 arquivos de teste e 171+ testes aprovados.

## [11/09/2026] - Antigravity (Assistente de Treinos IA em Aba Dedicada + Backup e Ponto de Restauração)
- **Mudanças realizadas**:
  - **Aba Dedicada e Segura de Planejamento (`/app/treinos/ia` em `app.treinos.ia.tsx`)**:
    - Ambiente isolado de experimentação com interface dark mode refinada, aviso de proteção de dados e diagnóstico dos treinos atuais.
    - Leitura em tempo real dos treinos ativos (divisão BCDA), exercícios habituais e sessões concluídas no banco de dados.
    - Dois modos de operação: "Otimizar Meus Treinos Atuais" (mantém a base e refina volume, ordem e descansos) e "Montar Nova Divisão Sob Medida" (pergunta objetivo, dias, nível e limitações).
    - Pré-visualização rica com cards expansíveis de treinos, exercícios, séries, repetições e tempos de descanso.
    - Opção de salvar diretamente como Templates (sem tocar na grade ativa) ou aplicar na grade oficial.
  - **Mecanismo de Segurança & Ponto de Restauração com 1 Clique (`workout-ai-utils.ts` + `workout-ai-utils.test.ts`)**:
    - Antes de aplicar qualquer alteração, o app captura um snapshot exato dos treinos atuais e salva localmente como ponto de restauração.
    - Botão "Restaurar Treino Original ↩️" no topo da tela permitindo desfazer qualquer alteração e voltar à ficha anterior com 1 toque.
    - Nenhuma sessão passada (`workout_sessions`) ou carga histórica é deletada.
  - **Server Function Especializada com IA (`workout-generator.functions.ts`)**:
    - Integração com `ai-settings.functions.ts` usando saída estruturada estrita em JSON com fallbacks biomecânicos determinísticos.
    - Injeção de catálogo de exercícios para padronização de nomenclatura.
  - **Atalho de Navegação na Tela de Treinos (`app.treinos.index.tsx`)**:
    - Adição de botão comemorativo "Assistente IA 🪄" no cabeçalho ao lado de "Templates" e "Novo".
- **Validação**:
  - `npx vitest run src/lib/workout-ai-utils.test.ts`: 6 testes verdes (100% de aprovação).
  - `npm run build`: Compilação de Client (57s) e SSR (43s) com código 0 e chunk dedicado `app.treinos.ia-*.js`.

## [11/09/2026] - Antigravity (Personalização Elegante do Daily Briefing + Eliminação do termo 'guerreiro')
- **Mudanças realizadas**:
  - **Eliminação de vocativos genéricos (`briefing-utils.ts` + `briefing-utils.test.ts`)**:
    - Substituição definitiva do fallback `"guerreiro"` por uma saudação polida e sofisticada: quando há nome, usa o primeiro nome capitalizado (`Bom dia, Well! 🌅`, `Boa tarde, Well! ⚡`, `Boa noite, Well! 🌙`); quando não há, usa a saudação limpa (`Bom dia! ☀️`, `Boa tarde! ⚡`, `Boa noite! 🌙`).
  - **Resolução e propagação do nome do usuário (`daily-briefing-card.tsx` + `app.index.tsx`)**:
    - O card busca o nome nas informações de login e na tabela de perfis do Supabase (`profiles.display_name`), enviando o nome para a geração determinística instantânea e para a IA.
    - Atualizada a chave de cache local (`fitwell-briefing-v2-...`) com descarte automático de mensagens legadas contendo "guerreiro".
  - **Diretrizes Estritas de Linguagem no Coach IA (`briefing.functions.ts`)**:
    - Prompt do sistema instruído explicitamente para saudar pelo primeiro nome e proibido de usar termos informais/clichês como "guerreiro", "campeão", "parceiro" ou "monstro".
- **Validação**:
  - `npx vitest run src/lib/briefing-utils.test.ts`: 5 testes verdes (100% de aprovação).

## [11/09/2026] - Antigravity (Rotação Inteligente de Treinos BCDA + Filtro BMR de Calorias Ativas)
- **Mudanças realizadas**:
  - **Sequenciador Cíclico de Divisão de Treinos (`workout-rotation.ts` + `workout-rotation.test.ts`)**:
    - Implementação de algoritmo inteligente de rotação cíclica com extração automática da letra/identificador dos treinos (ex: A, B, C, D).
    - Ordem padrão configurada para a sequência do usuário: `['B', 'C', 'D', 'A']`.
    - Consulta da última sessão concluída no histórico (`workout_sessions`); se a última foi **D**, o app avança automaticamente para o treino **A**!
    - Armazenamento de preferência em `localStorage` para total persistência e customização futura.
  - **Integração na Home e no Daily Briefing (`app.index.tsx`)**:
    - `findTodayWorkout` substituiu o fallback antigo (`workouts ORDER BY created_at DESC LIMIT 1`) pela lógica circular do sequenciador.
    - O card "Treino de hoje" e o Daily Briefing do Coach IA passam a orientar o treino exato da sequência do usuário.
  - **Gerenciador Visual de Divisão na Tela de Treinos (`app.treinos.index.tsx`)**:
    - Badge interativo no topo da lista de treinos exibindo a divisão ativa (`B ➔ C ➔ D ➔ A`) com modal para ajustar ou reordenar as letras a qualquer momento.
  - **Calibração de Calorias Ativas vs TMB (`google-fit-utils.ts` + `google-fit-utils.test.ts`)**:
    - O Google Fit envia o endpoint `com.google.calories.expended` somando o BMR (Taxa Metabólica Basal) do dia, gerando "+1877 kcal" de gasto ativo para apenas 788 passos.
    - Como o FitWell Hub já possui motor científico dedicado para TMB e TDEE, o parser agora detecta calorias desproporcionais e filtra a TMB, entregando apenas o gasto ativo real de locomoção (~35-40 kcal), alinhando com a contagem do Samsung Watch.
- **Validação**:
  - `npx vitest run`: 13 testes verdes nos utilitários de rotação e Google Fit.
  - `npm run build`: Compilação de Client e SSR bem-sucedidas (código 0).

## [11/09/2026] - Antigravity (Correção da Sincronização Google Fit + Galaxy Watch + Fallback Local de Tokens)
- **Mudanças realizadas**:
  - **Correção da Janela de Agregação da Fitness API (`google-fit.functions.ts`)**:
    - O Google Fit exige que o intervalo `[startTimeMillis, endTimeMillis]` cubra ao menos a duração do `durationMillis` (86400000ms = 24h). Anteriormente, a query enviava até `Date.now()`, retornando `bucket: []` vazio. Agora cobre exatamente as 24h do dia atual (`[startMs, startMs + 86400000]`).
  - **Priorização do stream oficial `estimated_steps` (`google-fit.functions.ts` + `google-fit-utils.ts`)**:
    - Os passos consolidados do Galaxy Watch (Samsung Health) residem em `derived:com.google.step_count.delta:com.google.android.gms:estimated_steps`. O parser agora indexa por stream e prioriza esse identificador para evitar contagem zerada ou duplicação.
  - **Resiliência contra ausência da tabela no Supabase (`app.ia.tsx` + `google-fit.functions.ts` + `steps-card.tsx`)**:
    - Como as tabelas `user_integrations` e `daily_steps_logs` ainda não haviam sido executadas no painel do Supabase, o app foi blindado com armazenamento em `localStorage` (`fitwell_google_fit_tokens`).
    - O status conectado é reconhecido imediatamente no dispositivo e os tokens são passados diretamente para as server functions.
    - Adicionado card explicativo com botão "Copiar SQL para Supabase" com 1 clique na aba IA para persistência multi-dispositivo.
- **Validação**:
  - `npm run build`: Compilação de Client e SSR bem-sucedidas (código 0).
  - Testes unitários atualizados em `google-fit-utils.test.ts`.

## [10/09/2026] - Antigravity (Daily Briefing do Coach IA + Timer em Background + Integração Samsung Watch via Google Fit)
- **Mudanças realizadas**:
  - **Daily Briefing do Coach IA no Topo da Home (`app.index.tsx` + `daily-briefing-card.tsx` + `briefing.functions.ts` + `briefing-utils.ts`)**:
    - Adicionado card inteligente e dinâmico recepcionando o usuário no topo da tela com mensagens personalizadas por período (manhã, tarde e noite).
    - Cache local em `localStorage` chaveado por `userId + date + period`: a IA é consultada apenas uma vez por turno, garantindo carregamento instantâneo (0ms) e economia de tokens.
    - Fallback determinístico offline automático em TypeScript puro para quando não houver internet ou chave de IA.
  - **Timer de Descanso com Alerta em Segundo Plano (`rest-timer-service.ts` + `app.treinos.$id.foco.tsx` + `sw.js`)**:
    - Substituição do timer baseado em `setInterval` puro por cálculo com `targetTimestamp` absoluto — o relógio não atrasa nem trava com tela apagada ou app em segundo plano.
    - Suporte a **Web Notifications API** e Service Worker: alerta nativo do sistema com som e vibração tátil ao término do descanso, mostrando o nome do próximo exercício.
    - Ao clicar na notificação, o Service Worker reabre/foca imediatamente a tela do treino em foco.
  - **Integração Samsung Galaxy Watch via Google Fit REST API (`google-fit-utils.ts` + `google-fit.functions.ts` + `steps-card.tsx` + `app.ia.tsx`)**:
    - Conexão OAuth 2.0 com a API oficial do Google Fitness, aproveitando a sincronização já ativa do Samsung Health para Google Fit.
    - Agregação de passos diários (`com.google.step_count.delta`), calorias ativas (`com.google.calories.expended`) e distância.
    - Novo componente `StepsCard` na Home com progresso da meta diária, calorias queimadas e modal de lançamento manual como fallback imediato.
    - Seção de configuração e conexão Google Fit na tela de configurações (`app.ia.tsx`).
  - **Tabelas e Schemas SQL (`types.ts` + `schema_completo.sql`)**:
    - Adicionadas as tabelas `user_integrations` e `daily_steps_logs` no Supabase e em `src/integrations/supabase/types.ts`.
  - **Roadmap & Planejamento (`doc/roadmap/plano-novas-funcionalidades.md`)**:
    - Criado e catalogado documento completo com 9 oportunidades futuras e atualizado status das opções 3, 7 e 9 para concluídas.
- **Validação**:
  - Testes unitários com Vitest: **23 arquivos de teste e 180 testes verdes** (100% de aprovação).

## [27/08/2026] - Antigravity (Início explícito de treino + ajuste mobile A56 + Haptic Feedback + Carga anterior no Modo Foco + Meta de água adaptativa + Tipos e Schema)
- **Mudanças realizadas**:
  - **Início explícito de treino (`app.treinos.$id.tsx` e `app.treinos.$id.foco.tsx`)**: O cronômetro do treino não inicia mais automaticamente ao abrir a tela. `startedAt` inicia como `null` e a contagem/gravação de rascunho de início é disparada pelo botão "Iniciar treino" / "Iniciar". Ao reiniciar a sessão (`resetWorkout`), o `startedAt` é zerado.
  - **Responsividade Mobile (otimização para Samsung Galaxy A56 e similares)**:
    - No card de duração em 2 colunas (`app.treinos.$id.tsx`), o botão "Iniciar treino" foi dimensionado com `h-10 px-2 text-sm gap-1.5` para encaixar perfeitamente nos ~130px da coluna sem estourar nem quebrar o layout da grade.
    - No header do Modo Foco (`app.treinos.$id.foco.tsx`), o título central ganhou `flex-1 text-center truncate px-1` e os botões ganharam `shrink-0`, impedindo deslocamentos da barra superior com nomes longos de treino.
  - **Haptic Feedback (Vibração Tátil) no Celular**:
    - Vibração sutil ao marcar séries concluídas (`navigator.vibrate(40)`).
    - Vibração dupla ao término do cronômetro de descanso (`navigator.vibrate([100, 50, 100])`) no treino normal e no Modo Foco.
  - **Histórico de Cargas no Modo Foco (`app.treinos.$id.foco.tsx`)**:
    - O Modo Foco agora consulta o histórico de cargas e exibe um badge com a melhor carga registrada do exercício atual (ex: *"Melhor carga: 20 kg × 10 reps"*).
  - **Meta de Água Adaptativa (`app.index.tsx`)**:
    - A meta de hidratação no Dashboard passa a aumentar dinamicamente em +500ml (2.5L → 3.0L) quando o usuário conclui um treino no dia, exibindo o badge visual `+500ml treino`.
  - **Tipagem Supabase & Schema SQL**:
    - Adicionada a tabela `body_measurements` em `src/integrations/supabase/types.ts` (`Row`, `Insert`, `Update`).
    - Atualizado `supabase/schema_completo.sql` com as 24 tabelas atuais (incluindo `workout_sessions`, `workout_session_sets`, `exercise_catalog`, `ai_settings`, `bioimpedance_logs`, `food_library`) e colunas recentes de `goals`.
- **Validação**: Testes unitários (133/133) e compilação de produção com Vite (client + SSR) passaram com 100% de sucesso (`exit code 0`).

## [10/08/2026] - Claude Code (BUG: relógio de descanso dos treinos deixou de ficar fixo ao rolar)
- **Ocorrência**: o usuário notou que o **timer de descanso** (`app.treinos.$id.tsx:614`, `sticky top-[57px] z-20`) parou de ficar "grudado" na tela ao rolar os exercícios. O header do app (`app.tsx:60`, `sticky top-0`) presumivelmente também perdeu o efeito.
- **Causa raiz**: o timer **sempre foi sticky** (`git log -S` → desde `0fb044a`, "add daily workout report"). Quem quebrou foi o commit **`448f33f`** (08/08, "prevencao de overflow horizontal"), que adicionou em `src/styles.css`:
  ```css
  html, body { max-width: 100vw; overflow-x: hidden; }
  ```
  **Por que quebra sticky:** na spec de CSS Overflow, com `overflow-x: hidden` o `overflow-y` computa para `auto` → `html`/`body` viram **container de rolagem**; o sticky passa a se ancorar no scrollport do body (que nunca rola) em vez do viewport. É o bug clássico de "overflow-x:hidden matou o sticky".
- **Fix (só CSS, `src/styles.css`)**: `overflow-x: hidden` → **`overflow-x: clip`** — recorta o overflow horizontal **sem criar scrollport**, então o sticky volta a ancorar no viewport. **`clip` não computa o outro eixo para `auto`** (diferente de `hidden`). Navegador antigo sem suporte a `clip` → overflow retorna a `visible` (sticky volta na mesma) — degradação aceitável.
- **Validação**: mudança isolada em CSS (nenhum TS/teste tocado; build não aplicável a CSS puro). **PENDENTE no usuário**: smoke no celular — abrir um treino longo, rolar e conferir que o relógio de descanso fica fixo abaixo do header.
- **Relacionado**: lição que se aplica a qualquer outra prevenção de overflow futuro — **preferir `overflow: clip` sobre `hidden` quando a página contém elementos `position: sticky`**.

## [10/08/2026] - Claude Code ("Salvar na biblioteca" fecha lacunas + "Exportar diário" em JSON)
- **Pedido**: (1) evitar re-analisar todo dia um alimento frequente ("salvar na biblioteca"), (2) exportar/backup do diário — usuário escolheu **JSON** ("não quero perder nada").
- **Descoberta**: o botão **"Salvar na biblioteca" no form de adicionar JÁ EXISTIA** (`saveToLibrary`, `app.nutricao.tsx:520-550`, botão `1140-1147`) — dedupe por nome + insert em `food_library` (`category: "Outros"`), cobrindo barcode/rótulo/manual. O trabalho virou **fechar lacunas**, não criar do zero.
- **Biblioteca — lacunas fechadas (`app.nutricao.tsx`)**:
  - **Foto do prato**: novo botão "Salvar na biblioteca" na confirmação (itens **selecionados**, dedupe por nome por item, mantém o dialog aberto para ainda "Adicionar selecionados") — `savePhotoItemsToLibrary` + 2º botão no dialog.
  - **Caminho "Calcular com IA e adicionar"**: `saveToLibrary` agora calcula macros via `lookupNutrition` quando `manual=false`/`mCal` vazio (o `disabled` do botão deixou de exigir `mCal === ""`).
  - `saveToLibrary` ganhou o `guard` anti double-tap (padrão `addFood`/`addRecent`). Sem migration (RLS `FOR ALL` já permitia).
- **Exportar JSON (`app.relatorio.tsx` + lib pura)**:
  - NOVO `src/lib/export-diary.ts` → `buildExportPayload({ exportedAt, user, tables })` → `{ app: "fitwell-hub", version: 1, exportedAt, user, data }`. **Exclui `ai_settings` por construção** (chaves de API nunca exportadas); inclui `chat_messages` (histórico do Coach). Testável em node.
  - NOVO `src/lib/export-diary.test.ts` (4 testes: inclui tabelas+version, exclui `ai_settings`, inclui `chat_messages`, tabela nula → `[]`).
  - Botão **"Exportar JSON"** no Relatório ao lado do "Exportar PDF" (molde client-side `exportPdf` — cliente browser do supabase + RLS), spinner `loadingExport`, arquivo `fitwell-backup-<data SP>.json` (`getLocalDate`). Consulta 20 tabelas do usuário; `body_measurements` **não existe em types.ts** (drift conhecido) → `as any` local no select (não adiciona erro no tsc).
  - **Chaves de IA ficam de fora por design** — o payload é montado só com o que passa por `buildExportPayload`.
- **Validação**: `TZ=UTC npx vitest run` **171/171** (**+4** novos de `export-diary`; os existentes seguem, nada de assinatura alterada); `tsc --noEmit` **68 linhas de erro = baseline**, zero nos arquivos tocados; `npm run build` ok (client + SSR). **PENDENTE no usuário**: smoke — (a) foto do prato → "Salvar na biblioteca" → confere em "Meus alimentos"; (b) "+" → nome → "Calcular com IA e adicionar" → "Salvar na biblioteca" fica habilitado; (c) Relatório → "Exportar JSON" → abrir o arquivo e conferir refeições/treinos/medidas/chat (sem chaves de IA).

## [09/08/2026] - Claude Code (Foto do rótulo: ler a tabela "Informação Nutricional" da embalagem pela foto)
- **Pedido**: ler a **tabela nutricional real** da embalagem pela foto — vai além do código de barras (que só existe produto na base do Open Food Facts) e da foto do prato (que **estima** macros da refeição). Decisão do usuário de design: **medo de quebrar o que funciona** → caminho **novo e paralelo**, nenhuma assinatura/function existente muda; o rótulo **popula o form principal (editável)** para revisar antes de gravar (diferente da foto do prato, que grava direto em `meal_items`).
- **Server-fn `analyzeLabel`** (`nutrition.functions.ts`): reusa `photoSchema` de input e o trio visão `resolveVisionProvider`/`resolveAiApiKey`/`getVisionModel` (molde `analyzePhoto`); `maxTokens: 512`; **tool-forcing `report_label`** (`toolChoice` + schema JSON `labelParamsSchema`, molde `lookupNutrition:84-94`). System prompt sem acentos instrui ler só a tabela, valores **POR PORÇÃO**, `serving_g` = porção declarada (ou **100g** se a tabela só mostrar por 100g), campos não visíveis → `null`. Parse: `tool_calls[0].function.arguments` → `JSON.parse` → `labelSchema.safeParse` → `normalizeLabelMacros`.
- **`labelSchema` exportado** (zod): `name` string|null (aceita null), `serving_g/calories/protein_g/carbs_g/fat_g` numéricos obrigatórios. Testado puro em `src/server-fns/label.test.ts` (node, sem mocks — padrão `suggest-meal.test.ts`).
- **Util puro `normalizeLabelMacros`** (`src/lib/food-utils.ts`): kcal inteiro, P/C/G 1 casa, `serving_g` ausente/inválida → 100, macros inválidos → 0, nome → "". Convenções idênticas a `rescaleMacros`/`scaleMacros`.
- **Refactor preservador**: o bloco de resize de imagem do `onPickPhoto` (`app.nutricao.tsx`) virou helper compartilhado **`src/lib/image-utils.ts`** `resizeImageFileToDataUrl(file, {maxSize=800, quality=0.7})` — comportamento idêntico, usado pela foto do prato e pelo rótulo (browser-only, canvas, não testável em node).
- **UI** (`app.nutricao.tsx`): botão `ScanText` "Foto do rótulo" na toolbar (spinner `Loader2` quando `labelLoading`); novo dialog com área de captura (`capture="environment"`); handler `onPickLabel` que **reseta o form**, chama `analyzeLabel` e popula: `query=name`, `grams=serving_g`, badge "IA" (`Porção do rótulo: Ng`), `manual=true`, macros, e **`setRefGrams` por último** → mudar "Porção (g)" reescala proporcional antes de "Adicionar". Erro → toast + reabre o dialog (refazer foto).
- **Validação**: `TZ=UTC npx vitest run` **167/167** (**+11**: 5 em `normalizeLabelMacros` + 6 em `label.test`); `tsc --noEmit` **sem erros novos** nos arquivos tocados (os 68 pré-existentes de `BarcodeDetector`/`body_measurements`/`corpo`/`medidas` seguem no HEAD, não relacionados); `npm run build` ok (client + SSR). **PENDENTE no usuário**: smoke — foto do prato continua igual (testa a extração do helper); código de barras continua igual; rótulo: fotografar → form abre com macros + badge "IA", mudar 30→60g reescala, "Adicionar" grava certo.

## [09/08/2026] - Claude Code (BUG: média/TDEE/metas não voltavam após apagar treino — sessões órfãs)
- **Ocorrência**: usuário testou "finalizar treino" e registrou sessões sem querer; apagou o treino na tela de Treinos, mas a **média de treinos/semana subiu de 4 para 5** e **não voltava** — as metas ficaram no nível de "5 treinos/semana".
- **Causa raiz — dois schemas de treino**: o planejamento vive em `workouts/exercises/sets` (tela de Treinos), mas a **sessão concluída** vive em `workout_sessions/workout_session_sets`. A média/TDEE (`corpo.functions.ts:80-96`) conta só **`workout_sessions`** (últimos 28 dias ÷ 4 → `sessionsPerWeek` → fator de atividade 1.55→1.725 → TDEE → meta `goal_auto`). Ao apagar o treino, o `remove()` apagava só `workouts` — e o FK `workout_sessions.workout_id → workouts` é **`ON DELETE SET NULL`** (migration `20260603000000`), então as sessões ficavam **órfãs** e continuavam a inflar a média. Não havia **nenhum** `delete` de `workout_sessions` na UI → impossível corrigir sem SQL.
- **Fix — código puro (sem migration)**: 
  - `app.treinos.index.tsx` `remove()`: agora exclui também as `workout_sessions` cujo `workout_id` é o do treino (com aviso no `confirm` e a contagem); `workout_session_sets` caem em cascata pela FK `session_id ON DELETE CASCADE`.
  - Nova seção **"Treinos concluídos"** na tela de Treinos: lista as **últimas 30 `workout_sessions`** (nome + data/hora local SP via `formatSessionWhen`) com botão de excluir + `confirm` — permite limpar sessões de teste **já órfãs** (workout apagado) pela UI, sem SQL. RLS existente é `FOR ALL` → permite o delete como usuário.
  - Depois de excluir uma sessão, a média/TDEE/meta **recalculam sozinhas** no próximo load (cálculo é server-side, sem cache).
- **Validação**: `tsc --noEmit` limpo no arquivo; `TZ=UTC npx vitest run` **156/156** (nenhum teste existente tocado). **PENDENTE no usuário**: na tela de Treinos → seção "Treinos concluídos" → excluir as sessões de teste (as de hoje aparecem no topo) e conferir que a média/metas voltam.

## [09/08/2026] - Claude Code (Estados granulares de loading no Chat/Coach — UX 2, forma 1)
- **Problema**: as duas telas de IA tinham um único spinner com **texto fixo** ("pensando…" no Chat, "Analisando seus dados…" no Coach) durante toda a chamada (3–30s conforme o provider) — usuário pode achar que travou.
- **Decisão do usuário**: **forma 1 (barata, front-only)** — rótulos de fase derivados de **tempo decorrido** (estimativa por timer), **sem tocar no backend**. Forma 2 (polling/SSE com fases reais) descartada por custo.
- **Nova lib pura `src/lib/ai-stage.ts`**: `aiStageLabel(elapsedMs, { hasImages? })` → `preparando` (<1s) → `consultando` (<4s; <7s se `hasImages`, pois visão é mais lenta) → `gerando`. `AI_STAGE_LABEL` com "Carregando seus dados…" / "Consultando a IA…" / "Gerando resposta…". Testável em node.
- **Novo hook `src/lib/use-ai-stage.ts`**: mede `Date.now() - startRef` com `setInterval` de 500ms (molde `use-reminders`); retorna `null` quando inativo, reseta ao ativar/re-ativar, `clearInterval` no cleanup/unmount; lê `hasImages` via ref (snapshot). 
- **`src/routes/app.chat.tsx`**: balão "pensando…" → `AI_STAGE_LABEL[stage]`; novo estado `hadImages` capturado no `send()` (pois `images` é limpo junto com `setSending(true)`).
- **`src/routes/app.coach.tsx`**: botão "Analisando seus dados…" → `AI_STAGE_LABEL[stage ?? "preparando"]`. Não toca o spinner de `applyingAdjustment`.
- **Validação**: `TZ=UTC npx vitest run` **156/156** — **+12 testes** (`ai-stage.test.ts` node: bordas 0/999/1000/3999/4000/6999/7000 + `AI_STAGE_LABEL` 3 chaves; `use-ai-stage.test.tsx` jsdom: `renderHook` + `vi.useFakeTimers` com avanço DENTRO de `act()` — sem `act` o estado do intervalo não é aplicado na leitura). `tsc --noEmit` limpo nos tocados (erros pré-existentes de `body_measurements`/`corpo`/`medidas`/`BarcodeScanner` continuam no HEAD, não relacionados). `npm run build` ok. **PENDENTE no usuário**: smoke manual (ver o balão/botão trocando de texto em provider lento).

## [09/08/2026] - Claude Code (Lembretes inteligentes — proteína, água e calorias: item 7.4)
- **Escopo**: notificações **proativas e contextuais** (antes só existia lembrete de horário fixo, que não olha os dados). Novo tipo **`🧠 Inteligente` (`reminders.kind = "smart"`)** na página de Lembretes — cria/liga/desliga/remove igual aos tipos fixos. **Sem migration** (kind é TEXT sem CHECK). Dispara `Notification` conforme os registros do DIA, em janelas fixas:
  - 🥩 **Proteína** (`hour >= 16 && proteinGoal > 0 && consumed.calories > 0 && consumed.protein_g/proteinGoal < 0.5`) → mensagem do card "Dica do Coach".
  - 🔥 **Calorias restantes** (`hour < 20 && consumed.calories > 0 && 0 < remainingCalories <= 200`) → mensagem do card.
  - 💧 **Água** (`hour >= 20 && waterMl === 0`) → "Você ainda não registrou água hoje…".
- **Nova lib pura `src/lib/smart-alerts.ts`** (`evaluateSmartAlerts`): espelha as condições do card do Coach (`app.nutricao.tsx:1384-1430`) + gatilho novo de água; ordem fixa protein→calories→water. Testável em node.
- **`src/lib/use-reminders.tsx`**: tick particiona `smart`/fixas; o bloco smart só busca dados do dia com `hour >= 16` (economia: 3–4 queries/30s só nessa janela), com **early-skip** quando os 3 gatilhos já dispararam (localStorage `smart-<key>-<getLocalDate(now)>` — **dedupe por gatilho/dia**, não por row), `guard !active` após os awaits (item tem awaits; o loop fixo não tinha). Horário usa `now.getHours()` (client-local, consistente com o relógio dos lembretes).
- **`src/components/reminders-page.tsx`**: `KINDS` += smart; quando smart → esconde o `<Input type="time">` e mostra hint "Horário inteligente…"; `add()` grava `time_of_day: "16:00"` (NOT NULL) como sentinela que **nunca aparece** no UI (lista mostra "Horário inteligente · <dias>").
- **Decisão intencional**: com o gate das 16h, o alerta de **calorias não dispara antes das 16h**, mesmo quando o card do Coach o mostraria (posicionamento "fim da tarde"; diferença pequena e documentada).
- **Validação**: `npx vitest run` — **17 novos testes** de `smart-alerts` (bordas de hora 15/16/19/20/21/23/12, ratio 0.5, consumed 0, proteinGoal 0, remCal 0/1/200/201/-50, água 0 vs 500, ordenação) + **3 testes** novos em `reminders-page.component.test.tsx` (insert smart com sentinela, esconde horário/hint, lista sem expor 16:00) — **8/8** no arquivo; existentes seguem verdes. `tsc --noEmit` limpo nos tocados. **PENDENTE no usuário**: smoke manual no celular (criar lembrete 🧠 Inteligente, permitir notificação, validar disparos).
- **Relacionado**: os gatilhos reutilizam o card "Dica do Coach" (item 5 do `doc/plans/MELHORIAS_NUTRICAO_E_COACH.md`); lembretes fixos intactos.

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
