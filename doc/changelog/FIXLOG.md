# FIXLOG — FitWell Hub

## Sessão: 20/05/2026 — Análise de Foto de Prato (IA)

### 🎯 Funcionalidade trabalhada
`src/server-fns/nutrition.functions.ts` → função `analyzePhoto`

Responsável por receber uma foto do prato do usuário, enviar para uma IA de visão e retornar os macronutrientes estimados (calorias, proteína, carboidrato, gordura) de cada alimento identificado.

---

### 🔍 Problema inicial
Ao acessar a tela de Nutrição e tentar enviar uma foto, o app retornava erro pedindo `GEMINI_API_KEY` no arquivo `.env`.

**Causa raiz:** O arquivo `.env` não existia no projeto. Sem ele, a variável de ambiente era `undefined` em desenvolvimento local.

**Solução:** Criado o arquivo `.env` na raiz do projeto com as variáveis necessárias. Variáveis que **não vão para o GitHub** (estão no `.gitignore`).

---

### 🔑 Variáveis de ambiente necessárias

| Variável | Onde usar | Para quê |
|---|---|---|
| `GEMINI_API_KEY` | `.env` local + Painel do Cloudflare | Análise de foto de prato (IA de visão) |
| `GROQ_API_KEY` | `.env` local + Painel do Cloudflare | Chat do coach de IA (texto) |
| `VITE_SUPABASE_URL` | `.env` local | Banco de dados Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` local | Autenticação Supabase |

> **IMPORTANTE:** Variáveis com prefixo `VITE_` são lidas pelo frontend. As sem prefixo são lidas **apenas pelo servidor** (Cloudflare Workers/Wrangler).
>
> Para produção (Cloudflare Pages), as variáveis `GEMINI_API_KEY` e `GROQ_API_KEY` devem ser cadastradas no painel da Cloudflare em **Settings → Environment Variables**, ou via terminal com `npx wrangler secret put NOME_DA_VARIAVEL`.

---

### ⚡ Otimização implementada: Compressão de Imagem

**Problema:** Fotos de celular moderno têm 5–10MB. Enviá-las diretamente para a API consumia a cota de tokens em poucas requisições, causando erro 429 (Too Many Requests).

**Solução implementada em `src/routes/app.nutricao.tsx`:**
Antes de enviar a foto para o servidor, o código agora:
1. Redimensiona a imagem para no máximo 800x800px no canvas do navegador.
2. Converte para JPEG com qualidade 80%.
3. Envia para a API uma imagem de ~100-200KB em vez de 5–10MB.

Isso reduz o consumo de tokens em ~95%.

---

### 🤖 Histórico de APIs de Visão testadas

#### ❌ Gemini 2.0 Flash (Google AI Studio) — ATUAL, com limitações
- **Status:** Funcionando tecnicamente, mas com bloqueios frequentes na conta gratuita.
- **Problema:** Contas novas/abusadas recebem erro 429 recorrentemente. O limite diário gratuito é baixo e o Google bloqueia por precaução.
- **Solução paliativa:** Gerar uma nova chave com outro Gmail em [aistudio.google.com](https://aistudio.google.com).
- **Modelo usado:** `gemini-2.0-flash` via endpoint nativo (`generativelanguage.googleapis.com`).

#### ❌ Groq (Llama 3.2 Vision) — DESCARTADO
- **Status:** Tentamos os modelos `llama-3.2-90b-vision-preview` e `llama-3.2-11b-vision-preview`.
- **Problema:** Ambos retornaram erro "model is deprecated/decommissioned". A Groq **removeu todos os modelos de visão da plataforma** (verificado em 20/05/2026 via endpoint `/v1/models` — nenhum modelo com "vision" listado).
- **Conclusão:** Groq não é uma opção viável para análise de imagem no momento.

---

### 💡 Alternativas para análise de foto (para implementar no futuro)

Se o Gemini continuar bloqueando, as melhores opções para substituição são:

| Provider | Modelo | Pago/Grátis | Facilidade de integração |
|---|---|---|---|
| **OpenAI** | `gpt-4o-mini` | Pago por uso (muitíssimo barato) | ⭐⭐⭐⭐⭐ |
| **Anthropic** | `claude-3-5-haiku` | Pago por uso (muitíssimo barato) | ⭐⭐⭐⭐⭐ |
| **Together AI** | `Llama-3.2-90B-Vision` | $5 crédito grátis + pago | ⭐⭐⭐⭐ |
| **Mistral AI** | `pixtral-12b` | Cota grátis generosa | ⭐⭐⭐⭐ |
| **Fireworks AI** | `llama-v3p2-90b-vision` | Cota grátis + pago | ⭐⭐⭐⭐ |

A integração de qualquer um deles exige apenas:
1. Criar conta e gerar API Key.
2. Substituir a key no `.env` e no Cloudflare.
3. Ajustar ~10 linhas em `nutrition.functions.ts` (apenas a URL, o header de autenticação e o nome do modelo).

---

### 📁 Arquivos temporários criados (podem ser deletados)
- `get-models.mjs` — Script para listar modelos de visão da Groq (já cumpriu seu papel)
- `get-all-models.mjs` — Script para listar todos os modelos da Groq (já cumpriu seu papel)
- `test-gemini.mjs` — Script de teste da API do Gemini (já cumpriu seu papel)

---

### ✅ Estado final do código
O código em `nutrition.functions.ts` está:
- ✅ Usando Gemini 2.0 Flash com endpoint nativo (mais estável que o compatível com OpenAI).
- ✅ Usando function calling do Gemini para garantir resposta estruturada.
- ✅ Com tratamento de erro detalhado (erros 429, 402 e genéricos com logs no terminal).
- ✅ Recebendo imagens já comprimidas do frontend (~150KB).

---

## Sessão: 21/05/2026 — Sinal Sonoro no Cronômetro

### 🎯 Funcionalidade trabalhada
`src/routes/app.treinos.$id.tsx` e `src/routes/app.treinos.$id.foco.tsx` → timer de descanso entre séries

### 🔊 Problema
O cronômetro não emitia som audível (ou emitia um beep muito curto e imperceptível) ao final da contagem, dificultando o uso com fones de ouvido.

### 🛠️ Solução implementada

**`src/lib/utils.ts`** — Criada função `playBeep(duration = 2000)`:
- Usa Web Audio API (`AudioContext` + `OscillatorNode`)
- Gera tom senoidal de 880Hz por **2 segundos** com fade out suave
- Não depende de arquivos de áudio externos

**`src/routes/app.treinos.$id.tsx`** (tela de treino normal):
- Substituído o `new Audio(base64)` curto por `playBeep()`

**`src/routes/app.treinos.$id.foco.tsx`** (modo foco):
- Adicionado `playBeep()` que não existia antes

### ✅ Estado final
- ✅ Beep audível de 2 segundos ao fim do descanso
- ✅ Funciona nas duas telas de treino
- ✅ Zero dependências externas

---

## Sessão: 21/05/2026 — Migração da Análise de Foto para OpenRouter

### 🎯 Funcionalidade trabalhada
`src/server-fns/nutrition.functions.ts` → função `analyzePhoto`

### 🔍 Problema
A chave `GEMINI_API_KEY` gratuita excedeu o limite de requisições (erro 429) e a conta gratuita do Google bloqueia por precaução.

### 🛠️ Solução implementada
Substituída a API nativa do Gemini pelo **OpenRouter** (formato OpenAI), que permite escolher entre dezenas de modelos de visão com uma única chave.

**O que mudou no código:**
1. **Endpoint:** `generativelanguage.googleapis.com` → `openrouter.ai/api/v1/chat/completions`
2. **Autenticação:** Query param `?key=` → Header `Authorization: Bearer`
3. **Formato da imagem:** `inlineData` (Gemini) → `image_url` (OpenAI)
4. **Formato do tool call:** `functionDeclarations` (Gemini) → `tools[].function` (OpenAI)
5. **Resposta:** Extração de `candidates[0].content.parts[].functionCall` → `choices[0].message.tool_calls[0].function.arguments`
6. **Header extra:** `HTTP-Referer` e `X-Title` exigidos pelo OpenRouter

**Variável de ambiente:**
- Antes: `GEMINI_API_KEY`
- Agora: `OPENROUTER_API_KEY`

**Modelo padrão escolhido:** `qwen/qwen2.5-vl-72b-instruct` (bom custo-benefício com tool calling)

### 🔧 Problema encontrado
O modelo `qwen/qwen2.5-vl-72b-instruct` retornava erro `404 no endpoints found that support report_plate` — o OpenRouter não suporta function calling para esse modelo.

### 🛠️ Solução aplicada
Substituído tool calling por **JSON direto no texto da resposta**:
1. System prompt agora pede JSON puro sem markdown
2. Regex extrai o `{...}` do texto de resposta
3. Parse direto com `JSON.parse()`
4. Removeu código morto (`photoMacrosTool` — 30 linhas)

Isso torna a função compatível com **qualquer modelo de visão** do OpenRouter, independente de suporte a function calling.

### ✅ Estado atual
- ✅ Código migrado para OpenRouter sem dependência de tool calling
- ✅ Compatível com qualquer modelo de visão
- ⬜ **Usuário precisa:** Criar conta em [openrouter.ai](https://openrouter.ai) e colocar a chave em `OPENROUTER_API_KEY` no `.env`

---

## Sessão: 21/05/2026 — Correções no Relatório e Dashboard

### 🎯 Funcionalidades trabalhadas
- `src/routes/app.treinos.$id.foco.tsx` → localStorage do modo foco
- `src/routes/app.index.tsx` → card "Treino de hoje" no dashboard
- `src/routes/app.relatorio.tsx` → leitura dos dias no relatório (indiretamente)

### 🐞 Bug 1: Modo Foco sobrescrevia histórico

**Problema:** A chave do `localStorage` no modo foco não incluía a data:
- Modo normal: `workout-completed-{id}-2026-05-21` ✅
- Modo foco: `workout-completed-{id}` ❌

Cada uso do modo foco sobrescrevia o mesmo registro. O relatório lia as chaves e tentava extrair a data — sem ela, só o último dia aparecia.

**Solução:** Adicionada data na chave do modo foco (linha 37):
```ts
const today = new Date().toISOString().split("T")[0];
const lsKey = `workout-completed-${id}-${today}`;
```

### 🐞 Bug 2: Dashboard não reconhecia treino de hoje

**Problema:** O card "Treino de hoje" no dashboard (`app.index.tsx`) consultava `workouts WHERE workout_date = hoje`. Como a `workout_date` é a data de criação do treino (não a data de uso), treinos criados dias atrás e usados hoje não apareciam — mostrava "Nenhum".

**Solução:** Criada função `findTodayWorkout()` que:
1. Primeiro tenta achar treino criado hoje (comportamento antigo — rápido)
2. Se não achar, varre o `localStorage` por chaves `workout-completed-*-{hoje}`, extrai o ID e busca o nome no banco

### ✅ Estado final
- ✅ Modo foco preserva histórico por dia
- ✅ Relatório mostra todos os dias corretamente
- ✅ Dashboard reconhece treino mesmo que criado em data anterior

---

## Sessão: 21/05/2026 — Correção no PDF do Relatório

### 🎯 Funcionalidade trabalhada
`src/routes/app.relatorio.tsx` → exportação de PDF

### 🐞 Bug
O PDF listava treinos consultando `workouts` pela `workout_date` (data de **criação** no banco). Se o usuário criou o treino no dia 15 e treinou com ele nos dias 16, 17, 18..., apenas o dia 15 aparecia no relatório.

### 🛠️ Solução
Substituída a consulta ao banco pelos dados do `localStorage` (`loadCompletedLogs()`):
1. Lê todas as chaves `workout-completed-*` do navegador (que agora têm data graças à correção anterior)
2. Busca os nomes dos treinos no banco pelos IDs únicos encontrados
3. Agrupa por data e lista no PDF

### ✅ Estado final
- ✅ PDF agora mostra treinos pelas datas em que foram **realmente concluídos**
- ✅ Removeu query desnecessária ao banco

---

## Sessão: 22/05/2026 — Beep do Cronômetro mais audível com música

### 🎯 Funcionalidade trabalhada
`src/lib/utils.ts` → função `playBeep`

### 🔊 Problema
O beep usava onda senoidal (sine) de 880Hz com volume baixo, praticamente inaudível com fones durante música.

### 🛠️ Solução implementada

**O que mudou:**
1. **Onda quadrada** (`square`) — som muito mais agressivo, corta qualquer música de fundo
2. **3 bipes em sequência** — 250ms cada com pausa de 200ms, em vez de um tom único de 2s
3. **Frequências alternadas** — 880Hz → 660Hz → 880Hz (o cérebro capta mudança de tom mesmo com música)
4. **Volume aumentado** — gain de 0.4 para 0.5

### ✅ Estado final
- ✅ 3 bipes com tom alternado chamam atenção
- ✅ Zero dependências externas

---

## Sessão: 26/05/2026 — Melhorias no Barcode Scanner e Nova Seção de Medidas

### 🎯 Funcionalidades trabalhadas
- `src/components/BarcodeScanner.tsx` → Leitor de código de barras aprimorado
- `src/routes/app.medidas.tsx` → Nova funcionalidade de registro e histórico de medidas corporais
- `supabase/migrations/20260527003000_add_body_measurements.sql` → Migração do banco

### 🔍 Melhoria do Leitor de Código de Barras
**Problema:** A câmera estava lendo os códigos com baixa resolução, dificultando muito o foco e o escaneamento correto dos produtos.
**Solução:**
- Aumentada a resolução (`constraints`) de vídeo solicitada para a câmera (focando em resoluções HD como 1280x720 e 1920x1080).
- Forçado uso explícito da câmera traseira (`facingMode: 'environment'`).
- Adicionado a diretiva `TRY_HARDER` da biblioteca ZXing, fazendo o algoritmo tentar decodificar o código mais agressivamente.
- Adicionada uma animação visual de escaneamento (`scanline`) por cima da câmera no arquivo `styles.css`.

### 📏 Nova Funcionalidade: Medidas e Peso
**Problema:** Faltava um local para salvar o peso e demais medidas do corpo, com histórico de datas e categorização.
**Solução:**
- Criada a nova tabela no Supabase `body_measurements` com as devidas permissões RLS (Row Level Security).
- Criada a tela `/app/medidas` contendo: formulário de cadastro, resumo agrupado por tipos de medida, gráficos em linha mostrando a evolução no tempo, e listagem do histórico.
- Ícone de "Régua" adicionado ao menu inferior em `app.tsx`.

### ✅ Estado final
- Leitor configurado para alta resolução sem consumo de rede/tokens.
- Tela de medidas corporais finalizada.

---

## Sessão: 27/05/2026 — Análise de Medidas com IA

### 🎯 Funcionalidade trabalhada
- `src/server-fns/medidas.functions.ts` → Nova server function `analyzeMeasurements`.
- `src/routes/app.medidas.tsx` → Integração do botão "Coach IA" na interface.

### 🧠 Análise por IA (Integração)
**Problema:** O usuário possuía um histórico de treinos e também uma nova tela para registro de medidas corporais, porém não existia inteligência relacionando o esforço físico com a evolução dessas medidas.
**Solução:**
- Criada a nova server function `analyzeMeasurements` no backend, protegida por middleware de autenticação do Supabase.
- A função busca: (a) todas as medidas corporais, calculando o ganho/perda em cm de cada parte do corpo e (b) o histórico de treinos dos últimos 30 dias (nome, número de treinos, volume).
- Construído um prompt estruturado que envia esses dados formatados para a API do Groq (usando modelo `llama-3.3-70b-versatile`). A IA age como um Coach e gera insights diretos e motivacionais correlacionando os dados.
- Modificada a tela `/app/medidas` para exibir um novo botão com ícone de brilho ✨ que invoca a análise de forma sob-demanda e exibe em um painel estilizado.

### ✅ Estado final
- ✅ Botão "Coach IA" implementado na tela de Medidas.
- ✅ Integração do Groq LLaMA 3.3 funcional e analisando contexto de treinos VS evolução corporal.

---

## Sessão: 27/05/2026 — Migração de Supabase e Resolução de Erro de Compilação

### 🎯 Funcionalidades trabalhadas
- **Migração do Supabase**: Redirecionamento completo do banco de dados antigo (`mglvkocauwsdqbkqbyqi`) para o novo projeto do Supabase (`haavrgglnfbchiygspqw`).
- **Resolução de Bug no Frontend**: Correção de tag JSX não finalizada na rota de medidas.

### 🔌 Migração do Banco de Dados
**Problema:** O banco de dados original era controlado por chaves antigas de um projeto Supabase inativo do Lovable. Havia a necessidade de migrar todas as tabelas e dados para o novo projeto do usuário.
**Solução:**
- Criado o dump completo do banco de dados em `supabase/schema_completo.sql` para que o usuário possa importá-lo no novo painel.
- Atualizado o arquivo de configuração do Supabase local (`supabase/config.toml`) para o novo ID `haavrgglnfbchiygspqw`.
- Atualizado os fallbacks do cliente Supabase em `src/integrations/supabase/client.ts` para usar a URL e a Publishable Key do novo projeto.
- Atualizado o arquivo `wrangler.jsonc` para compatibilidade com o deploy na Cloudflare.

### 🐞 Correção de Sintaxe (Bug do JSX)
**Problema:** Ao realizar a build, o Vite retornava o erro `SyntaxError: Unterminated JSX contents. (374:10)` impedindo a compilação do projeto.
**Causa:** No arquivo `src/routes/app.medidas.tsx`, a tag `<div className="flex items-center gap-2">` (linha 188) que agrupa os botões de ação e o modal não estava sendo fechada.
**Solução:** Inserida a tag de fechamento `</div>` apropriada logo após `</Dialog>` no arquivo.

### ✅ Estado final
- ✅ Configurações do Supabase 100% atualizadas e apontando para o novo projeto.
- ✅ Erro de JSX resolvido de ponta a ponta.
- ✅ Compilação (`npm run build`) concluída com absoluto sucesso em ambos os ambientes (Client e SSR).

---

## Sessão: 29/05/2026 — Dashboard de Medidas Premium, Timeline e Detalhes do Coach IA

### 🎯 Funcionalidade trabalhada
`src/routes/app.medidas.tsx` → Tela de medidas corporais, visualização de dados e usabilidade do Coach IA

### 🔍 Problema inicial ou Motivação
O usuário manifestou dores principais de usabilidade na rota de medidas:
1. **Dificuldade de compreensão do Coach IA:** O usuário não entendia claramente o que o "Coach IA" fazia a partir de um botão simples no header.
2. **Deficiências na apresentação dos dados:** Os cards de resumo mostravam apenas o valor mais recente, sem deixar claro a data desse registro e sem permitir visualizar com facilidade as medidas de datas anteriores.
3. **Falha silenciosa de execução (Não acontece nada ao clicar):** Ao clicar no botão da IA, a requisição de servidor falhava silenciosamente com erro HTTP 401 (Unauthorized) devido à falta de cabeçalho de autorização.

### 🛠️ Solução implementada
Redesenhamos e refatoramos completamente a página `src/routes/app.medidas.tsx` adicionando recursos premium de interface, usabilidade e correção técnica:

1. **Card Explicativo do Coach IA:**
   - Adicionamos um banner interativo com fundo degradê sutil e um botão colapsável *"Como funciona?"*.
   - Ao ser expandido, o card descreve didaticamente o cruzamento analítico dos dados: histórico de medidas e consistência de treinos nos últimos 30 dias via LLaMA-3.3-70b (API do Groq).
   - O retorno da análise foi estilizado como um "Relatório Evolutivo do Coach" premium.

2. **Correção de Autorização (Auth Headers) na Server Function:**
   - Adicionamos o token de `session` do contexto do `useAuth()` à chamada de `analyzeMeasurements`.
   - Incluímos o cabeçalho `Authorization: Bearer ${session?.access_token}` nos headers da requisição, satisfazendo a validação rigorosa do middleware `requireSupabaseAuth` (que barrava requisições sem o token JWT).

3. **Cards Bento Grid de Medida Inteligentes:**
   - Inserimos a **data exata em pt-BR** (ex: `28 mai`) do registro mais recente no rodapé do card.
   - Exibimos a medida imediatamente anterior (`ant. XX.X cm`) como referência.
   - Implementamos **tags de variação/tendência inteligentes** baseadas nos objetivos físicos do usuário:
     - *Hipertrofia* (ombros, peito, braço, coxa, panturrilha): aumento de tamanho é marcado com tag verde (`↑ X.X cm`).
     - *Queima de gordura* (cintura, quadril): redução de tamanho é marcado com tag verde (`↓ X.X cm`).
     - Flutuações inversas ou neutras recebem cores adequadas e discretas.

4. **Sistema de Abas de Navegação (Tabs):**
   - **Aba 1: Evolução Individual:** Gráfico Recharts aprimorado e histórico detalhado apenas da medida ativa.
   - **Aba 2: Linha do Tempo Geral:** Histórico unificado que agrupa todas as medições por data cronológica de registro, conectadas por uma linha do tempo vertical pontilhada. Cada dia contém um grid de todas as medidas tiradas naquela data, simplificando a visualização de status passados e possibilitando a exclusão rápida.

### ✅ Estado final
- ✅ Seção explicativa interativa do Coach IA funcional e premium.
- ✅ Correção da chamada de API da IA com envio dos cabeçalhos de autorização do JWT (resolvendo o problema de "clicar e nada acontecer").
- ✅ Cards Bento Grid de medidas com data e tags coloridas de progresso inteligentes.
- ✅ Navegação por abas com gráfico individual de tendência e linha do tempo geral cronológica unificada.
- ✅ Compilação (`npm run build`) concluída com absoluto sucesso em ambos os ambientes (Client e SSR).

---

## Sessão: 29/05/2026 — Persistência de Treinos Concluídos no Supabase

### 🎯 Funcionalidade trabalhada
`src/routes/app.treinos.$id.tsx`, `src/routes/app.treinos.$id.foco.tsx`, `src/routes/app.index.tsx` e `src/routes/app.relatorio.tsx` → Armazenamento e histórico de séries concluídas (workout completed logs).

### 🔍 Problema ou Motivação
Anteriormente, ao concluir séries de exercícios nas páginas de treino detalhado ou modo foco, o estado das séries era persistido temporariamente no `localStorage` do navegador com o prefixo `workout-completed-*`. Isso causava:
1. Perda de dados no caso de limpeza de cache, troca de aparelho ou navegação anônima.
2. Inacessibilidade dos dados pelo lado do servidor (como o Coach IA ou geração de relatórios), impedindo análises de adesão mais profundas.

### 🛠️ Solução implementada
Migramos o rastreamento de conclusão do frontend local para o banco de dados do Supabase:

1. **Uso da Coluna Existente:** Aproveitamos a coluna `completed` (boolean) já criada anteriormente na tabela `sets` por uma migration, que não estava sendo utilizada.
2. **Atualização das Telas de Treino:**
   - Modificamos o detalhe do treino (`app.treinos.$id.tsx`) e o modo foco (`app.treinos.$id.foco.tsx`) para derivar o estado `completedSets` diretamente da lista de `sets` retornada do banco de dados.
   - O checkbox de conclusão agora dispara um update otimista no estado local e uma requisição assíncrona ao Supabase (`supabase.from("sets").update({ completed: !current })`).
3. **Refatoração do Dashboard:**
   - A função `findTodayWorkout` no `app.index.tsx` agora consulta o Supabase usando queries do tipo `inner join` para verificar se existem séries completadas no dia atual, em vez de realizar varreduras locais no `localStorage`.
4. **Refatoração do Relatório PDF:**
   - O `app.relatorio.tsx` agora possui uma função assíncrona `loadCompletedLogs` para resgatar e agregar o total de séries concluídas no banco e gerar o histórico por datas reais de execução, eliminando referências locais ao navegador.
5. **Sincronização Automática de Dados Legados:**
   - Implementamos no layout global do aplicativo (`app.tsx`) um hook de migração que varre o `localStorage` do dispositivo procurando chaves do tipo `workout-completed-*`.
   - Se chaves forem encontradas, o app envia em lote a conclusão destas séries (`completed: true`) para o Supabase, garantindo que o histórico antigo do celular do usuário seja recuperado e preservado permanentemente na nuvem.
   - As chaves locais são deletadas do `localStorage` somente após a resposta positiva de persistência do Supabase.

### ✅ Estado final
- ✅ Sincronização em tempo real de séries concluídas entre diferentes dispositivos e sessões do usuário.
- ✅ Dashboard e relatórios PDF operando de forma 100% dinâmica com consultas diretas ao banco.
- ✅ Histórico legado recuperado e integrado transparentemente via rotina de sincronização automática.
- ✅ Código mais limpo e livre de interações com o `localStorage` do navegador para o core das regras de negócio de treino.
- ✅ build validado com sucesso.

---

## Sessão: 02/06/2026 — Sugestão de Progressão de Carga Sempre Ativa no Coach IA

### 🎯 Funcionalidade trabalhada
`src/server-fns/chat.functions.ts` → system prompt do Coach IA

### 🔍 Problema ou Motivação
O usuário notou que em alguns treinos a IA sugeria aumento de carga e em outros não. A sugestão de progressão (ex: "tente subir para X kg na próxima sessão") era inconsistente — aparecia apenas quando o histórico de sessões indicava condições específicas. O desejo era que **todos os treinos** recebessem essa orientação motivacional.

### 🛠️ Solução implementada
1. **Nova variável de ambiente `COACH_ALWAYS_SUGGEST`:**
   - Adicionada ao `.env` com valor `true`.
   - Quando ativada, injeta instrução adicional no system prompt do Coach IA: *"Sempre informe ao usuário se ele pode aumentar a carga no próximo treino, mesmo que não haja histórico suficiente."*

2. **Refatoração do system prompt (`chat.functions.ts`):**
   - Removida a indentação excessiva do template literal (melhor legibilidade).
   - Adicionada concatenação condicional que verifica `process.env.COACH_ALWAYS_SUGGEST === "true"` antes de anexar a instrução extra.

### ⚙️ Configuração
| Variável | Valor | Efeito |
|---|---|---|
| `COACH_ALWAYS_SUGGEST` | `true` | IA sempre sugere progressão de carga |
| `COACH_ALWAYS_SUGGEST` | `false` ou ausente | Comportamento padrão (sugere apenas quando o histórico indica) |

> **Nota:** Para produção (Cloudflare), configurar via `npx wrangler secret put COACH_ALWAYS_SUGGEST` com valor `true`.

### ✅ Estado final
- ✅ Sugestão de aumento de carga presente em todas as respostas do Coach IA
- ✅ Configurável via variável de ambiente (reversível sem alterar código)
- ✅ Build validado com sucesso

---

## Sessão: 09/06/2026 — Melhorias no Barcode Scanner (Câmera, Detecção e Fallback)

### 🎯 Funcionalidades trabalhadas
- `src/components/BarcodeScanner.tsx` → Refatoração completa do leitor de código de barras
- `src/routes/app.nutricao.tsx` → Fluxo de fallback na busca por código de barras

### 🔍 Problemas e Soluções

**1. Câmera com baixa resolução:**
- **Problema:** A câmera traseira estava com resolução muito baixa, dificultando a leitura de códigos de barras — o foco não estabilizava e a imagem era granulada.
- **Solução:** As constraints de `getUserMedia` foram alteradas:
  - `facingMode` mudou de `{ ideal: "environment" }` (sugestão) para `"environment"` (exato) — força a câmera traseira de fato.
  - Adicionadas constraints de resolução: `width: { ideal: 1920 }, height: { ideal: 1080 }` — a câmera agora tenta capturar em HD/Full HD, melhorando drasticamente a nitidez.

**2. Detecção manual com falha:**
- **Problema:** O usuário precisava apertar um botão "Capturar" para tirar um snapshot e depois detectar. Isso exigia timing perfeito — o frame frequentemente saía borrado e o `BarcodeDetector` retornava "Nenhum código encontrado".
- **Solução:** Substituída a captura manual por um loop de detecção contínua via `requestAnimationFrame` a cada ~500ms. Agora o usuário só precisa apontar a câmera para o código que ele é detectado automaticamente quando entra em foco. Removido o botão de captura e adicionado um campo de input manual como fallback na parte inferior.

**3. Código lido mas produto não encontrado no Open Food Facts:**
- **Problema:** Mesmo com o código de barras sendo lido corretamente (ex: `7896263501391` — água mineral brasileira), a API direta do OFF (`/api/v2/product/{code}.json`) retornava "status: 0" (produto não cadastrado), e o app mostrava apenas um toast de erro.
- **Solução:** Novo fluxo em cascata no `onBarcode`:
  1. Tenta API direta do OFF por código de barras
  2. Se falhar, tenta `lookupNutrition` (busca textual OFF + quando falha, IA Groq estima macros)
  3. Se tudo falhar, abre diálogo em modo manual para o usuário preencher nome e macros

**4. Dados misturados entre leituras:**
- **Problema:** Após escanear um produto, escanear outro podia mostrar dados mesclados ou errados. O estado React do modal não era limpo entre as operações.
- **Solução:** Reset completo de todos os estados no início de `onBarcode`: `setQuery("")`, `setManual(false)`, `setMCal("")`, `setMProt("")`, `setMCarb("")`, `setMFat("")`, `setOpen(false)`. Cada leitura começa com estado zero e preenche apenas os dados certos.

### ✅ Estado final
- ✅ Câmera com resolução HD e estabilidade
- ✅ Detecção contínua automática — só apontar e esperar
- ✅ Fallback IA quando produto não está no Open Food Facts
- ✅ Input manual para digitar código à mão
- ✅ Estado limpo entre leituras — sem dados vazarem

---

## Sessão: 20/06/2026 — Correção de Leitura do Barcode Scanner

### 🎯 Funcionalidade trabalhada
`src/components/BarcodeScanner.tsx` — scanner de código de barras via câmera

### 🔍 Problemas e Soluções

**1. Leitura intermitente — às vezes lia, às vezes não:**
- **Problema:** O `BarcodeDetector` escaneava o frame inteiro da câmera em vez de apenas a área do guia visual. Em códigos longe ou mal centralizados, a detecção falhava.
- **Solução:** Crop do canvas — o `drawImage` agora recorta apenas a região equivalente ao guia visual (calculado com math de `object-fit: cover`) e passa só esse recorte para o detector.

**2. Falha em ambientes com pouca luz:**
- **Problema:** Sem flash, qualquer ambiente com iluminação não-ideal impedia a leitura.
- **Solução:** Adicionado botão de flash (torch) que usa `track.applyConstraints({ advanced: [{ torch: true }] })`. Só aparece se o dispositivo suportar.

**3. Imagem instável/borrada em celulares de gama média:**
- **Problema:** A resolução `1920x1080` causava motion blur em celulares mais fracos.
- **Solução:** Reduzido para `1280x720` com fallback genérico.

**4. Performance do canvas:**
- **Problema:** Canvas 2D sem flag de leitura frequente.
- **Solução:** Adicionado `{ willReadFrequently: true }` no `getContext`.

### ✅ Estado final
- ✅ Crop do canvas — escaneia só a área do guia
- ✅ Flash/torch para ambientes escuros
- ✅ Resolução 720p mais estável
- ✅ willReadFrequent para performance
---

## Sessão: 20/06/2026 — Câmera Nativa, Porção Detectada e Chip de Origem

### 🎯 Funcionalidades trabalhadas
- `src/components/BarcodeScanner.tsx` — botão de câmera nativa para leitura por foto local
- `src/routes/app.nutricao.tsx` — correção de porção detectada e chip visual de origem

### 🔍 Problemas e Soluções

**1. Câmera ao vivo com foco insuficiente em códigos pequenos:**
- **Problema:** No Samsung A56, o preview ao vivo não estabilizava bem o foco em códigos de barras miúdos.
- **Solução:** Adicionado um fallback de `Camera nativa` que abre a captura de imagem do celular para tirar uma foto mais estável e tentar a leitura sobre a imagem capturada.

**2. Consumo de tokens por imagem:**
- **Problema:** O usuário precisava preservar a cota free da API.
- **Solução:** A leitura por foto do barcode é feita localmente no navegador, com redimensionamento e descarte imediato da imagem. Nenhuma imagem é enviada para IA nesse fluxo.

**3. Produto detectado com porção errada:**
- **Problema:** Produtos como whey de `30g` estavam sendo tratados como `100g`, distorcendo os macros exibidos.
- **Solução:** O fluxo agora tenta interpretar `serving_size` ou `quantity` do Open Food Facts e escala os macros para a porção real detectada quando possível.

**4. Falta de clareza sobre a origem dos dados:**
- **Problema:** Não ficava claro se a porção veio do barcode, da IA ou do preenchimento manual.
- **Solução:** Criado um chip visual no topo do modal com cores distintas por origem: barcode em verde, IA em âmbar e manual em cinza.

### ✅ Estado final
- ✅ Leitura por câmera nativa como alternativa ao preview ao vivo
- ✅ Leitura local da foto sem custo de tokens
- ✅ Porção detectada e corrigida para produtos de 30g, 40g etc.
- ✅ Chip visual por origem dos dados no modal
- ✅ Build validado com sucesso

---

## Sessão: 24/06/2026 — Correção de Extração de Data no Scanner de Bioimpedância

### 🎯 Funcionalidade trabalhada
`src/server-fns/corpo.functions.ts` → prompt da IA vision (`analyzeBioimpedancePhoto`)
`src/routes/app.corpo.tsx` → validação de data no client

### 🔍 Problema
A data extraída da foto do laudo de bioimpedância da farmácia vinha errada. A IA vision (Qwen 2.5 VL 72B) frequentemente:
1. Confundia a data do exame com data de nascimento ou data de impressão do laudo
2. Errava a conversão de DD/MM/AAAA (formato brasileiro) para YYYY-MM-DD
3. Alucinava datas completamente quando não enxergava claramente

### 🛠️ Solução implementada

**1. Prompt da IA aprimorado (`corpo.functions.ts`):**
- Instrução explícita: data está SEMPRE no canto superior direito ou central do laudo, formato DD/MM/AAAA
- Conversão obrigatória: DD/MM/AAAA → YYYY-MM-DD (ex: 15/06/2026 → 2026-06-15)
- Ordem de prioridade: "Data do Exame" > "Data da Realização" > "Data da Medição"
- Proibição explícita: NÃO usar data de nascimento, impressão, validade ou pagamento
- Se ilegível → retornar null (NÃO inventar data)

**2. Validação de data no client (`app.corpo.tsx`):**
- Após extração, verifica se a data é:
  - Um `Date` válido (não NaN)
  - ≤ data atual (não no futuro)
  - ≥ 2020-01-01 (não absurdamente antiga)
- Se inválido → não preenche o campo de data + toast: "Data do exame não reconhecida — preencha manualmente"
- Usuário mantém controle manual total

### ✅ Estado final
- ✅ Prompt mais específico reduz chances de data errada
- ✅ Validação client-side com toast avisando se data for inválida
- ✅ Fallback manual preservado — usuário sempre pode corrigir
- ✅ Build de produção validado com sucesso

---

## Sessão: 24/06/2026 — Scanner de Bioimpedância com IA Vision

### 🎯 Funcionalidade trabalhada
`src/server-fns/corpo.functions.ts` → função `analyzeBioimpedancePhoto`
`src/routes/app.corpo.tsx` → botão "Escanear exame com IA" no Dialog de bioimpedância

### 🔍 Problema ou Motivação
O formulário de bioimpedância exigia que todos os 9 campos (peso, % gordura, massa muscular, massa óssea, água corporal, gordura visceral, TMB máquina, idade metabólica, data) fossem digitados manualmente — processo tedioso e propenso a erros.

### 🛠️ Solução implementada

1. **Nova server function `analyzeBioimpedancePhoto`:**
   - Aceita imagem base64 de um laudo/exame de bioimpedância.
   - Usa modelo vision `qwen/qwen2.5-vl-72b-instruct` via OpenRouter/Omniroute (mesmo já usado na nutrição).
   - Prompt instrui extração de todos os valores numéricos visíveis no laudo.
   - Retorna JSON estruturado com os 9 campos + data.

2. **Botão "Escanear exame com IA" no Dialog:**
   - Inserido dentro do Dialog existente de "Adicionar Bioimpedância", sem quebrar o layout.
   - Abre seletor de arquivo (`accept="image/*"`) — o SO pergunta se quer câmera ou galeria.
   - Compressão client-side: redimensiona para max 800px, JPEG 70% (economiza tokens).
   - Chamada à IA → preenche automaticamente os campos encontrados.
   - Toast informativo: `"5 de 9 campos preenchidos pela IA! Revise e salve."`
   - Formulário manual continua disponível normalmente.

### ✅ Estado final
- ✅ Leitura de exames por foto da câmera ou imagem da galeria
- ✅ Preenchimento automático de campos detectados pela IA vision
- ✅ Compressão de imagem client-side sem custo extra de tokens
- ✅ Formulário manual preservado como fallback
- ✅ Build de produção validado com sucesso

---

## Sessão: 24/06/2026 — Correção: Dois Botões (Câmera + Galeria) e Limite de Tokens

### 🎯 Funcionalidades trabalhadas
`src/routes/app.corpo.tsx` — botões de câmera e galeria no Dialog
`src/server-fns/corpo.functions.ts` — `maxTokens: 500` na chamada vision

### 🔍 Problemas e Soluções

**1. Botão único não mostrava opção de câmera:**
- **Problema:** Sem o atributo `capture="environment"`, alguns navegadores Android exibiam apenas "Galeria" e "Arquivos", sem a opção de câmera.
- **Solução:** Substituído o botão único por dois botões lado a lado com `flex-1`: "📷 Câmera" (com `capture="environment"`) e "🖼️ Galeria" (sem capture). O layout não quebra porque usam `flex gap-1.5` com `flex-1`.

**2. Erro 402 (créditos insuficientes) no OpenRouter:**
- **Problema:** O `callAiChatCompletion` sem `maxTokens` explícito usava o padrão de 65536 tokens, excedendo o limite da conta free (7273 tokens).
- **Solução:** Adicionado `maxTokens: 500` na chamada (a resposta JSON tem ~200 tokens). Também reduzida a compressão de imagem de 800px/70% para 600px/60% — imagem ~70% menor, menos tokens de entrada.

### ✅ Estado final
- ✅ Dois botões distintos: Câmera e Galeria
- ✅ Funciona em qualquer navegador/celular
- ✅ Respeita o limite de tokens da conta free do OpenRouter
- ✅ Build de produção validado com sucesso

---

## Sessão: 24/06/2026 — Correção do Botão Apagar que Abria IA em vez de Excluir

### 🎯 Funcionalidade trabalhada
`src/routes/app.corpo.tsx` — botão de lixeira nos cards de bioimpedância

### 🔍 Problema
Ao clicar no botão de lixeira (🗑️) para excluir um registro de bioimpedância, o `onClick` do `Card` pai também disparava — abrindo o diálogo de análise IA em vez de excluir o registro. O `e.stopPropagation()` no botão não impedia a propagação para o `Card`.

### 🛠️ Solução implementada
Adicionada **dupla camada de segurança** contra propagação indevida de eventos:

1. **Filtro no `Card.onClick`:** Antes de chamar `runBioLogAiAnalysis(log)`, verifica se o clique veio de um elemento com o atributo `data-delete-btn="true"` (ou um filho dele) usando `e.target.closest("[data-delete-btn]")`. Se sim, retorna sem abrir a IA.

2. **Marcador `data-delete-btn` no botão deletar:** Adicionado o atributo `data-delete-btn="true"` ao `<Button>` da lixeira. O `e.stopPropagation()` foi mantido como redundância.

### ✅ Estado final
- ✅ Botão de apagar funciona independente do clique no card
- ✅ Clique no card ainda abre IA normalmente (sem quebra de UX)
- ✅ Camada dupla de proteção contra propagação
- ✅ Build de produção validado com sucesso

---

## Sessão: 24/06/2026 — Correção de Datas UTC vs Local em Todo o App

### 🎯 Funcionalidades trabalhadas
- `src/lib/utils.ts` → nova função `getLocalDate()`
- 12 arquivos de rota: substituição de `new Date().toISOString().slice(0, 10)` por `getLocalDate()`

### 🔍 Problema
Todas as datas "hoje" eram calculadas com `new Date().toISOString().slice(0, 10)`, que retorna a data em **UTC**. Para usuários em fusos atrás do UTC (como Brasil, UTC-3), a partir das 21h o UTC já avançava pro dia seguinte, causando:
1. Nutrição mostrava/comia dados do dia errado
2. Dashboard mostrava calorias de "ontem" no card de calorias
3. Botão deletar parecia não funcionar (após deletar, `load()` recarregava com data UTC errada)
4. Coach IA, relatório PDF, medidas, peso — todos com datas desalinhadas

### 🛠️ Solução implementada

**`src/lib/utils.ts`** — Criada função utilitária:
```ts
export function getLocalDate(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
```

**Arquivos alterados** (substituição de UTC por data local):

| Arquivo | Linhas | Mudança |
|---------|--------|---------|
| `app.nutricao.tsx` | 158, 511 | `today` + `y` (ontem) |
| `app.index.tsx` | 54 | `today` do dashboard |
| `app.index.tsx` | 62-64 | `findTodayWorkout` — range UTC calculado via `setHours(0/23)` |
| `app.coach.tsx` | 56, 57 | `start` + `today` do Coach IA |
| `app.corpo.tsx` | 120 | `bioDate` default |
| `app.medidas.tsx` | 87 | `date` default |
| `app.peso.tsx` | 40 | `date` default |
| `app.receitas.$id.tsx` | 137 | `today` ao criar refeição |
| `app.relatorio.tsx` | 61, 62 | `start` + `today` do PDF |
| `app.nutricao-historico.tsx` | 32, 46 | `since` + `d` iterador |
| `app.treinos.index.tsx` | 79 | `today` ao duplicar |
| `app.templates.index.tsx` | 80 | `today` ao aplicar template |

### ✅ Estado final
- ✅ Todas as datas do app usam fuso horário **local**
- ✅ Dashboard, nutrição, medidas, peso, bioimpedância, treinos — datas consistentes
- ✅ Botão deletar funciona corretamente (load pós-delete usa data local)
- ✅ Build de produção validado com sucesso

---

## Sessão: 15/07/2026 — Bug workout_id no Dashboard (nullable quebra link)

### 🎯 Funcionalidade trabalhada
`src/routes/app.index.tsx` → função `findTodayWorkout`

### 🔍 Problema
O campo `workout_id` na tabela `workout_sessions` é nullable (`string | null`). Quando null, o código retornava `workout_id || ""`, gerando um link quebrado para `/app/treinos/$id` com id vazio.

### 🛠️ Solução implementada
1. Select agora inclui `id` (session id) junto com `workout_id`.
2. Se `workout_id` existir, usa ele (linka para o template original).
3. Se `workout_id` for null, cai no fallback existente (último template criado).

### ✅ Estado final
- ✅ Link do treino no dashboard nunca mais quebra
- ✅ Fallback preservado para treinos sem template vinculado

---

## Sessão: 15/07/2026 — Datas UTC Reintroduzidas no Chat

### 🎯 Funcionalidade trabalhada
`src/server-fns/chat.functions.ts` → função `sendChat`

### 🔍 Problema
No handler do `sendChat`, as variáveis `today` e `weekAgo` usavam `new Date().toISOString().slice(0,10)`, que retorna data em UTC. Isso fazia o chat buscar refeições, peso e treinos do dia errado para usuários em UTC-3 (Brasil) após as 21h.

**Causa raiz:** A correção de UTC de 24/06 tinha sido aplicada em 12 arquivos de rota, mas o `chat.functions.ts` não estava na lista de correção — e ainda usava `toISOString()`.

### 🛠️ Solução implementada
Substituído `new Date().toISOString().slice(0,10)` por `getLocalDate()`, mesma função utilitária usada no restante do app.

### ✅ Estado final
- ✅ Chat agora usa data local para filtrar contexto do usuário
- ✅ Consistente com as demais telas do app

---

## Sessão: 15/07/2026 — Error Boundary

### 🎯 Funcionalidade trabalhada
`src/routes/__root.tsx` → componente raiz

### 🔍 Problema
Qualquer erro de renderização em uma rota resultava em tela branca sem feedback para o usuário.

### 🛠️ Solução implementada
Adicionado componente `ErrorBoundary` (class component com `getDerivedStateFromError`) envolvendo o `<Outlet />`. Em caso de erro, exibe:
- Título "Oops!"
- Mensagem "Algo deu errado ao carregar esta página."
- Botão "Voltar ao início" que reseta o estado de erro

### ✅ Estado final
- ✅ Erros de rota capturados graciosamente
- ✅ Usuário consegue navegar de volta sem recarregar a página

---

## Sessão: 15/07/2026 — Dead Code: callGroqAPI e @zxing

### 🎯 Funcionalidades trabalhadas
- `src/server-fns/chat.functions.ts` → função `callGroqAPI`
- `package.json` → dependências `@zxing/browser` e `@zxing/library`
- Scripts temporários: `test-gemini.mjs`, `get-models.mjs`, `get-all-models.mjs`

### 🔍 Problema
1. A função `callGroqAPI` foi declarada mas nunca chamada — o chat usa `callAiChatCompletion` do `ai-settings.functions.ts`.
2. As dependências do ZXing foram substituídas pela API nativa `BarcodeDetector` em junho, mas continuavam no `package.json`.
3. Scripts de teste do Gemini/Groq não eram mais necessários.

### 🛠️ Solução implementada
1. Removida a declaração de `callGroqAPI` (19 linhas).
2. Removidas `@zxing/browser` e `@zxing/library` do `package.json`.
3. Removidos `test-gemini.mjs`, `get-models.mjs`, `get-all-models.mjs`.
4. `npm install` executado para atualizar node_modules.

### ✅ Estado final
- ✅ Código mais limpo e sem dead code
- ✅ Bundle ligeiramente menor sem as dependências ZXing
- ✅ Repositório sem arquivos de teste obsoletos

---

## Sessao: 15/07/2026 — date-fns removida, Nav Mobile e Heatmap

### 🎯 Funcionalidades trabalhadas
- `package.json` → remocao de dependencia morta
- `src/routes/app.tsx` → nav inferior adaptavel
- `src/components/Heatmap.tsx` → datas UTC e estado vazio

### 🔍 Problemas e Solucoes

**1. date-fns nao utilizada:**
- **Problema:** A lib `date-fns` estava no `package.json` mas nunca era importada em lugar nenhum.
- **Solucao:** Removida do `package.json` e `npm install` executado.

**2. Nav inferior apertada em celular:**
- **Problema:** 7 abas no menu inferior com texto em telas muito pequenas ficavam cortadas.
- **Solucao:** Texto oculto em telas `< sm` com `hidden sm:block`. Container alterado para `overflow-x-auto`.

**3. Heatmap com datas UTC e sem estado vazio:**
- **Problema:** O Heatmap usava `toISOString().slice(0,10)` para buscar refeicoes, mesmo bug de datas. Quando nao havia registros, mostrava apenas quadrados cinzas sem explicacao.
- **Solucao:** Substituido por `getLocalDate()`. Adicionado estado vazio com mensagem explicativa.

### ✅ Estado final
- ✅ Dependencia date-fns removida
- ✅ Nav adaptavel em qualquer tamanho de tela
- ✅ Heatmap com datas locais e estado vazio

---

## Sessao: 15/07/2026 — Prevencao de Flash de Tema, Aviso Coach e Error Handling

### 🎯 Funcionalidades trabalhadas
- `src/routes/__root.tsx` → script inline de tema
- `src/routes/app.coach.tsx` → aviso de dados insuficientes
- 6 arquivos de rota → console.error nos catches

### 🔍 Problemas e Solucoes

**1. Flash branco ao recarregar em modo escuro:**
- **Problema:** O tema era carregado via `useEffect` no React, causando um flash de tema claro antes do JavaScript aplicar a classe `dark` no `<html>`.
- **Solucao:** Script syncrono inline no `<head>` que le `localStorage` e aplica a classe imediatamente, antes de qualquer CSS renderizar.

**2. Coach sem aviso de dados insuficientes:**
- **Problema:** O usuario podia clicar em "Gerar analise da semana" sem ter nenhum registro, e a IA respondia algo generico sem contexto.
- **Solucao:** Antes de chamar a IA, verifica se ha refeicoes, treinos, peso ou agua. Se tudo estiver vazio, exibe toast de aviso.

**3. Catch blocks sem log:**
- **Problema:** Blocos `catch` exibiam toast para o usuario mas nao registravam o erro no console, dificultando debug em producao.
- **Solucao:** Adicionado `console.error(e)` em 6 arquivos (app.nutricao, app.coach, app.receitas.$id, app.relatorio).

### ✅ Estado final
- ✅ Zero flash de tema ao recarregar
- ✅ Coach avisa quando faltam dados
- ✅ Todos os erros registrados no console

---

## Sessao: 15/07/2026 — PWA / Service Worker

### 🎯 Funcionalidade trabalhada
`public/sw.js` → criacao do service worker
`src/routes/__root.tsx` → registro no cliente

### 🔍 Problema
O app tinha meta tags PWA, manifest.webmanifest e icones, mas nao tinha service worker. Isso significa que:
1. O navegador nunca oferecia "Adicionar a tela inicial"
2. O app nao funcionava offline
3. O cache de assets nao era gerenciado

### 🛠️ Solucao implementada

**1. Criacao do service worker (`public/sw.js`):**
- Cache-first para assets estaticos (JS, CSS, imagens, fontes)
- Network-first para navegacao (paginas sempre frescas quando online, fallback offline)
- Network-only para chamadas de API
- Cache atualizado no evento `activate` (versao `fitwellhub-v1`)
- Fallback para home quando offline

**2. Registro no cliente:**
- Script inline no `__root.tsx` apos `<Scripts />`

### ✅ Estado final
- ✅ App instalavel como PWA
- ✅ Cache de assets para carregamento mais rapido
- ✅ Fallback offline para navegacao
- ✅ Compativel com SSR + Cloudflare Workers

---

## Sessao: 15/07/2026 — Eliminacao Total de Datas UTC

### 🎯 Funcionalidade trabalhada
Varios arquivos → correcao de datas UTC para local

### 🔍 Problema
A correcao de datas UTC de 24/06/2026 tinha sido aplicada em 12 arquivos de rota, mas 6 ocorrencias em server functions e hooks ainda usavam `toISOString().slice(0,10)`:
1. `chat.functions.ts:123` — formatacao de data de treino no contexto da IA
2. `corpo.functions.ts:79` — 28d atras para calcular fator de atividade
3. `corpo.functions.ts:137` — 30d atras para buscar treinos
4. `corpo.functions.ts:146` — 7d atras para buscar nutricao
5. `medidas.functions.ts:38` — 30d atras para analise de medidas
6. `use-reminders.tsx:33` — todayKey para lembretes

### 🛠️ Solucao implementada
Substituidas todas por `getLocalDate(new Date(...))`. Adicionado import nos 3 arquivos que nao tinham.

### ✅ Estado final
- ✅ Zero ocorrencias de `toISOString().slice(0,10)` em todo o src/
- ✅ Todas as datas do app usam fuso local consistentemente

---

## Sessao: 15/07/2026 — Limpeza de Logs e .env.example

### 🎯 Funcionalidades trabalhadas
- `dev.log` e `vite-dev.log` → arquivos temporarios
- `.env.example` → documentacao de variaveis

### 🔍 Problema
1. Arquivos `dev.log` (vazio) e `vite-dev.log` (logs de build) estavam poluindo a raiz do projeto.
2. `.env.example` nao documentava as variaveis `OMNIROUTE_API_KEY` e `OMNIROUTE_BASE_URL`, apesar do codigo ja suportar OmniRoute.

### 🛠️ Solucao implementada
1. Arquivos de log deletados.
2. `.env.example` atualizado com as variaveis do OmniRoute.

### ✅ Estado final
- ✅ Raiz do projeto mais limpa
- ✅ .env.example reflete todas as variais suportadas

---

## Sessao: 15/07/2026 — Data UTC no Relatorio PDF (completed_at)

### 🎯 Funcionalidade trabalhada
`src/routes/app.relatorio.tsx` → funcao `loadCompletedLogs`

### 🔍 Problema
A linha `const date = (session.completed_at as string).slice(0, 10)` extraia a data UTC do campo `completed_at` (timestamptz). Para usuarios em UTC-3, treinos feitos apos as 21h apareciam com a data do dia seguinte no relatorio.

### 🛠️ Solucao implementada
Substituido por `getLocalDate(new Date(session.completed_at as string))`.

### ✅ Estado final
- ✅ Datas corretas no relatorio PDF para qualquer fuso horario

---

## Sessao: 15/07/2026 — Data UTC no Historico de Exercicios

### 🎯 Funcionalidade trabalhada
`src/routes/app.exercicios.$name.tsx` → pagina de historico individual de exercicio

### 🔍 Problema
A linha `const date = (sess.completed_at as string).slice(0, 10)` extraia a data UTC do campo `completed_at` (timestamptz). Isso fazia o grafico de evolucao do exercicio agrupar dados no dia errado para usuarios em UTC-3 apos as 21h.

### 🛠️ Solucao implementada
Substituido por `getLocalDate(new Date(sess.completed_at as string))`. Adicionado import de `getLocalDate`.

### ✅ Estado final
- ✅ Grafico de historico de exercicio com datas corretas
- ✅ Zero ocorrencias de `.slice(0, 10)` em todo o src/

---

## Sessao: 15/07/2026 — Novo Provedor: NVIDIA

### 🎯 Funcionalidade trabalhada
- `src/server-fns/ai-settings.functions.ts` → suporte a NVIDIA como provider
- `src/routes/app.ia.tsx` → UI para selecionar NVIDIA

### 🔍 Motivacao
O usuario precisava de uma alternativa ao OpenRouter, que tem mais restricoes de uso que a API direta da NVIDIA.

### 🛠️ Solucao implementada
Adicionado NVIDIA como provider de texto. Usa o endpoint `integrate.api.nvidia.com` com modelo `nemotron-70b`. A chave API e salva no campo `openrouter_api_key` (ambos usam formato OpenAI). Nenhuma migration necessaria.

### Como usar
1. Ir em `/app/ia`
2. Selecionar "NVIDIA" no select de provedor
3. Colar a chave da API da NVIDIA
4. Salvar

### ✅ Estado final
- ✅ NVIDIA funcional como provedor de texto
- ✅ Modelo padrao: Nemotron-70B
- ✅ Zero alteracoes no banco

---

## Sessao: 15/07/2026 — Modelo NVIDIA customizavel

### 🎯 Funcionalidade trabalhada
`src/routes/app.ia.tsx` — campo de modelo NVIDIA
`src/server-fns/ai-settings.functions.ts` — suporte a modelo personalizado

### 🔍 Problema
O modelo NVIDIA era fixo no codigo (Nemotron-70B). O usuario nao podia escolher outro modelo disponivel na API da NVIDIA.

### 🛠️ Solucao implementada
1. Adicionado campo de texto "Modelo NVIDIA" na UI quando o provedor NVIDIA esta selecionado.
2. O modelo e salvo no campo `omniroute_base_url` do banco (reutilizando coluna existente — sem migration).
3. `getTextModel()` agora aceita `settings` opcional: se provider for NVIDIA e `nvidia_model` estiver preenchido, usa o modelo personalizado.
4. Todos os callers atualizados para passar `settings`.

### ✅ Estado final
- ✅ Usuario pode digitar qualquer modelo NVIDIA
- ✅ Padrao continua sendo Nemotron-70B
- ✅ Zero migrations no banco

---

## Sessao: 15/07/2026 — Busca de modelos NVIDIA via API

### 🎯 Funcionalidade trabalhada
`src/server-fns/ai-settings.functions.ts` → funcao `fetchNvidiaModels`
`src/routes/app.ia.tsx` → select de modelos com busca dinamica

### 🔍 Problema
Usuario precisava saber o nome exato do modelo NVIDIA e digitar manualmente.

### 🛠️ Solucao implementada
1. Criada funcao `fetchNvidiaModels(apiKey)` que chama `GET /v1/models` da NVIDIA e filtra modelos `nvidia/*`.
2. Na UI, o input de modelo foi substituido por um select + botao de busca.
3. Usuario cola a chave, clica no botao de refresh, e os modelos disponiveis aparecem no select.

### ✅ Estado final
- ✅ Usuario ve todos os modelos disponiveis na conta NVIDIA
- ✅ Nao precisa mais digitar nome do modelo manualmente

---

## Sessao: 15/07/2026 — Busca de modelos NVIDIA e correcao de bugs

### 🎯 Funcionalidades trabalhadas
- `src/server-fns/ai-settings.functions.ts` → fetchNvidiaModels + correcao baseUrl
- `src/routes/app.ia.tsx` → select de modelos com busca
- `supabase/migrations/20260715000000_ai_settings_nvidia_provider.sql` → migration

### 🔍 Problemas e Solucoes

**1. Lista de modelos filtrada demais:**
- **Problema:** Filtro `id.startsWith("nvidia/")"` mostrava poucos modelos.
- **Solucao:** Removido filtro, agora mostra todos os modelos da API.

**2. CORS ao buscar modelos:**
- **Problema:** Browser bloqueava requisicao direta a API da NVIDIA.
- **Solucao:** Convertido para `createServerFn` (POST) que roteia pelo servidor.

**3. "Invalid URL" ao usar modelo NVIDIA:**
- **Problema:** `callAiChatCompletion` usava `options.baseUrl` (que continha o nome do modelo) como URL do endpoint.
- **Solucao:** `baseUrl` so usado quando provider e OmniRoute. Para NVIDIA a URL e fixa.

**4. CHECK constraint no banco:**
- **Problema:** Coluna `provider` so permitia 'groq', 'openrouter', 'omniroute'.
- **Solucao:** Migration que adiciona 'nvidia' ao constraint.

**5. Limite de requisicoes NVIDIA (ResourceExhausted):**
- **Problema:** Chave gratuita da NVIDIA tem limite de 48 requisicoes.
- **Nota:** Nao e bug do app. Usuario pode aguardar reset, usar modelos menores ou fazer upgrade da conta.

### ✅ Estado final
- ✅ Modelos NVIDIA buscados via API (sem digitar manualmente)
- ✅ Sem erros CORS
- ✅ Sem erro "Invalid URL"
- ✅ Migration para suportar provider nvidia no banco

---

## Sessão: 23/07/2026 — Ajustes: Descanso 60s e Beep mais alto

### 🎯 Funcionalidade trabalhada
- `src/routes/app.treinos.$id.tsx` — timer de descanso (linha 83)
- `src/routes/app.treinos.$id.foco.tsx` — timer de descanso (linha 34)
- `src/lib/utils.ts` — função `playBeep`

### ⏱ Mudança: Descanso de 90s → 60s
**Arquivos alterados:**
- `app.treinos.$id.tsx`: `restPreset` de `90` → `60`
- `app.treinos.$id.foco.tsx`: `restPreset` de `90` → `60`

### 🔊 Mudança: Beep do descanso mais alto
**Arquivo:** `src/lib/utils.ts` — função `playBeep`

**O que mudou:**
1. **Gain aumentado:** `0.5` → `1.0` (dobro da amplitude)
2. **Beep mais longo:** `beepLen` de `0.25s` → `0.4s` (cada bip dura mais, mais fácil de ouvir com música)

Mantido `osc.type = "square"` (onda quadrada — já é a mais penetrante) e as 3 frequências alternadas (880Hz → 660Hz → 880Hz).

### ✅ Estado final
- ✅ Timer de descanso inicia em **60s** (1 minuto) em vez de 90s
- ✅ Beep com o **dobro da amplitude** e **60% mais longo**
- ✅ Zero dependências externas

---

## Sessão: 23/07/2026 — Heatmap substituído por card de adesão em texto

### 🎯 Funcionalidade trabalhada
`src/components/Heatmap.tsx` → substituição completa do componente

### 🔍 Problema
O heatmap (quadriculado estilo GitHub com 12 semanas de quadrados coloridos) não era intuitivo para o usuário, que preferia não ter gráficos.

### 🛠️ Solução implementada
Substituído o grid visual por um card com:
1. **Barra de progresso** com % de adesão (dias com refeição registrada / 84 dias)
2. **4 cards em grid** com stats em texto:
   - 🔥 Sequência atual e melhor sequência de dias seguidos
   - 📊 Média de calorias por dia
   - 🎯 Dias dentro da meta calórica (≥90% da meta)
   - ⚡ Meta calórica definida

### ✅ Estado final
- ✅ Zero gráficos — tudo em texto e números
- ✅ Mesma informação, muito mais legível
- ✅ Zero novas queries ao banco (reusa os dados já buscados)

---

## Sessão: 24/07/2026 — Som do Descanso Ascendente (corta música no fone)

### 🎯 Funcionalidade trabalhada
`src/lib/utils.ts` → função `playBeep`

### 🔊 Problema
O som do fim do descanso tinha 3 bipes com padrão 880Hz → 660Hz → 880Hz (nota do meio mais grave — anti-climático). Mesmo com gain alto (1.0), o som não "cortava" a música no fone de forma eficaz.

### 🛠️ Solução implementada

**O que mudou:**
1. **Frequências ascendentes**: `[800, 1200, 1600]` — escala que SOBE, sinalizando psicologicamente "hora de voltar!"
2. **1600Hz agudo**: Frequência alta que poucos instrumentos/vocais ocupam, corta a música no fone
3. **Square wave mantida**: Rica em harmônicos, máxima presença
4. **Beep mais rápido**: `beepLen` de `0.4s` → `0.3s`, gap de `0.2s` → `0.1s` — padrão rítmico mais distinto, mais fácil do cérebro reconhecer com áudio concorrente

### ✅ Estado final
- ✅ 3 bipes ascendentes (800→1200→1600Hz) — som que sobe, chama atenção
- ✅ Corta música ambiente mesmo com fone
- ✅ Zero dependências externas

---

## Sessão: 02/08/2026 — Scanner salva na biblioteca + Confiança/Próxima ação no chat

### 🎯 Funcionalidades trabalhadas
- `src/routes/app.nutricao.tsx` → botão "Salvar na biblioteca" no diálogo de alimento
- `src/server-fns/chat.functions.ts` → `confidence` + `nextAction` no retorno do `sendChat`
- `src/routes/app.chat.tsx` → chip de confiança + próxima ação na última resposta

---

### 🔍 Contexto 1: Scanner não guardava produtos
O fluxo `onBarcode` (escaneia → Open Food Facts ou IA) **só preenchia o modal** e, ao confirmar, inseria em `meal_items` da refeição do **dia**. O produto não ia para `favorite_foods` nem `food_library` — então um alimento escaneado ontem não aparecia hoje (a tela carrega só `meal_items` de hoje). Sem favorito/biblioteca, o produto evaporava.

### 🛠️ Solução 1 — Botão "Salvar na biblioteca" (`app.nutricao.tsx`)
1. **Nova função `saveToLibrary`**: insere em `food_library` com payload espelhando o `FoodLibrary` (`user_id, name, category, grams, macros`) — macros já vêm na porção detectada pelo scanner, sem recálculo.
2. **Dedup por nome** (case-insensitive via `.ilike`): se já existir, `toast.error("'X' já existe na biblioteca")` e não insere.
3. **Botão `outline`** ao lado do "Adicionar" (mesmo diálogo), com ícone `Apple` — atende scanner, busca manual e IA. Categoria default "Outros" (editável depois no FoodLibrary).

### 🔍 Contexto 2: Roadmap chat (confiança + planejador) era real, mas descascado
Pendências 4 e 5 do `doc/roadmap/melhorias.md` existiam só no `/app/coach`, não no `/app/chat`. **Achado-chave:** o `coachAdvice` **não usa `response_format`/json_schema** — a IA responde em texto livre e `confidence`/`plan` são calculados **deterministicamente em JS** (`score >= 12 ? alta : >= 6 ? media : baixa`). Ou seja, "saída estruturada de IA" não existe nem no coach.

### 🛠️ Solução 2 — Confiança + próxima ação no chat (`chat.functions.ts` + `app.chat.tsx`)
1. **`fetchUserContext`** agora retorna `stats` (workoutCount, mealCount, weightCount, waterCount) contados dos arrays já buscados — **zero queries extras**. Nota: janelas diferem do coach (workouts usa `.limit(5)`, meals `gte weekAgo`) — heurística, suficiente.
2. **`sendChat`** calcula `confidence` e `nextAction` com a **mesma fórmula do coach** (`confidenceFromStats` / `nextActionFromStats`) e retorna `{ reply, confidence, nextAction }`. O banco persiste **só o reply** (os campos vão só no retorno para a UI).
3. **`app.chat.tsx`**: tipo `Msg` ganhou `confidence?`/`nextAction?`; na última resposta ao vivo, exibe chip colorido (baixa=amber, média=azul, alta=verde) + linha de próxima ação. Mensagens antigas recarregadas do banco ficam sem chips (comportamento preservado).
4. **Loop de `tools` (record_meal/record_workout) e prompt de IA intactos** — nada de json_schema, sem risco de quebrar o registro de refeição/treino.

### ✅ Estado final
- ✅ Alimento escaneado/manual/IA pode ser salvo na biblioteca em 1 toque (com dedup)
- ✅ Chat mostra confiança (baixa/média/alta) + próxima ação sob a última resposta
- ✅ Tool-use do chat (registrar refeição/treino) sem regressão
- ✅ `npm run build` validado (Client + SSR)
- ⬜ **Teste manual pendente (usuário):** escanear produto → salvar na biblioteca → conferir em "Meus alimentos"; duplicar scan → aviso; chat com tool-use de almoço/treino

---

## Sessão: 02/08/2026 — Pós-teste no celular: correção de overflow horizontal no diálogo do "+"

### 🔍 O que o teste do usuário revelou
1. **Scanner OK**: o produto escaneado foi salvo na biblioteca e apareceu em "Meus alimentos". ✅
2. **Bug de layout**: no celular, ao montar a lista do café da manhã, a página ficou **maior que a tela** (rolagem horizontal forçada para ler).
3. **Confusão de lógica (UX)**: o usuário não entendeu por que o botão "+" **não mostra a biblioteca** (só Recentes/Favoritos ou digitação manual), enquanto **clicar num alimento da lista** "Meus alimentos" (final da página) abre a escolha de refeição. Existem **duas portas de entrada** para adicionar alimento com padrões diferentes.

### 🐛 Causa raiz do overflow
O rodapé do diálogo do "+" ganhou **dois botões lado a lado com `flex-1`** ("Salvar na biblioteca" + "Adicionar"/"Calcular com IA e adicionar") quando o botão "Salvar na biblioteca" foi adicionado nesta sessão. O `Button` base tem **`whitespace-nowrap`** (`src/components/ui/button.tsx:8`), então cada botão tem min-content = largura total do texto. Em tela estreita, a soma dos dois + gap + padding do diálogo **excede o viewport** → scroll horizontal.

### 🛠️ Correção aplicada (`src/routes/app.nutricao.tsx:816`)
- Troca de `flex gap-2` por **`flex flex-wrap gap-2`** no rodapé do diálogo: em tela larga os botões ficam lado a lado; em celular estreito **empilham** (cada um em linha própria, largura total). Sem mais overflow.

### 🧭 Achado de UX — duas portas de adição (NÃO alterado, por decisão do usuário)
- **Botão "+"** → adiciona **por nome** (`lookupNutrition`: Open Food Facts → IA). **Não mostra a biblioteca** e a busca **não consulta** `food_library`.
- **"Meus alimentos"** (`FoodLibrary`, final da página) → lista salva com busca; clicar num alimento → "Adicionar à refeição" (refeição + porção). É aqui que o alimento escaneado fica acessível.
- O usuário entendeu a lógica e escolheu **"só explicar por enquanto"** — lógica mantida. Decisão em aberto: unificar as duas portas num "balcão único" (busca na biblioteca dentro do "+") ou fazer o `lookupNutrition` consultar a biblioteca antes da internet/IA.

### ✅ Estado final
- ✅ Overflow horizontal corrigido (`flex flex-wrap`) — build validado
- ⬜ **Re-teste manual (usuário):** abrir o "+" no celular e confirmar que os botões cabem na tela sem arrastar pro lado

---

## Sessão: 02/08/2026 — Balcão único no "+" + Plano semanal no chat

### 🎯 Funcionalidades trabalhadas
- `src/routes/app.nutricao.tsx` → seção "Da sua biblioteca" (busca + lista) dentro do diálogo do "+" — balcão único de adição
- `src/server-fns/nutrition.functions.ts` → exportados `CoachPlan`, `inferCoachObjective`, `buildCoachPlan` (helpers puros, sem mudança de lógica)
- `src/server-fns/chat.functions.ts` → `fetchUserContext` retorna `goals`; `sendChat` detecta intenção de plano e retorna `plan` determinístico
- `src/routes/app.chat.tsx` → card recolhível do plano semanal na última resposta

### 🔍 Contexto 1: Duas portas de adição confundiam o usuário (roadmap, nota UX 02/08)
O "+" adicionava por nome (Open Food Facts → IA, sem consultar `food_library`) e "Meus alimentos" (final da página) adicionava pela lista salva — padrões diferentes, e o alimento escaneado/salvo **não aparecia no "+"**. O usuário optou pelo **balcão único**.

### 🛠️ Solução 1 — Balcão único no "+" (`app.nutricao.tsx`)
1. **`loadLibrary()`**: página carrega `food_library` (id, name, grams, macros) em estado `library`; chamada no `load()` e após `saveToLibrary` (lista do diálogo atualiza na hora).
2. **Seção "Da sua biblioteca"** no diálogo do "+" (entre "Alimento" e "Porção"): campo de busca (`libQuery`) + lista filtrada (`max-h-48`, scroll). **Tap num item preenche o formulário** (nome, gramas, macros, `manual=true`) — o usuário ajusta a porção e toca "Adicionar", reaproveitando o fluxo atual.
3. **Rescale proporcional (`refGrams`)**: ao mudar a porção com um item da biblioteca preenchido, `mCal/mProt/mCarb/mFat` são escalados por `nova/ref` (mesmo comportamento do `confirmAdd` do FoodLibrary). `refGrams` é limpo ao editar o nome manualmente e no reset pós-`addFood`.
4. **"Meus alimentos"** embaixo segue como **gestão** (criar/editar/importar) — não foi alterado.

### 🔍 Contexto 2: Plano semanal só no /coach (roadmap item 5)
O `/coach` gerava o plano (foco, metas de treino/nutrição/acompanhamento, checklist) determinístico via `buildCoachPlan`, mas o chat só tinha confiança + próxima ação. Decisão do usuário: card **determinístico** no chat (sem json_schema, sem mudar prompt/IA) e **só quando a pergunta tiver intenção de plano**.

### 🛠️ Solução 2 — Plano no chat (`nutrition.functions.ts` + `chat.functions.ts` + `app.chat.tsx`)
1. **Exportados** `CoachPlan`, `inferCoachObjective`, `buildCoachPlan` de `nutrition.functions.ts` (sem tocar na lógica).
2. **`fetchUserContext`** passa a retornar `goals` (já buscado, zero queries extras).
3. **`sendChat`**: `const wantsPlan = /\b(plano|planej|planeja|semana|semanal|checklist|foco)\b/i.test(message)`; se sim, `plan = buildCoachPlan(stats, goals, inferCoachObjective(goals))` (objetivo automático, como o modo "auto" do /coach). Retorno `{ reply, confidence, nextAction, plan }` — banco persiste **só o reply**.
4. **`app.chat.tsx`**: componente `PlanCard` — card **recolhível** (Collapsible) com título, chip do objetivo, foco, "O que fazer hoje", 3 metas, checklist com bullets e próxima ação. Fechado por padrão. Histórico recarregado não tem `plan` → sem card.

### ✅ Estado final
- ✅ "+" vira balcão único: busca + lista da biblioteca, preenche formulário, rescale de porção
- ✅ Chat mostra plano semanal sob demanda (só quando pedir), sem poluir respostas comuns
- ✅ Loop de `tools` (record_meal/record_workout) e prompt de IA intactos
- ✅ `npm run build` validado; `tsc --noEmit` limpo nos arquivos tocados (erros pré-existentes de `body_measurements`/`BarcodeDetector` seguem fora de escopo)
- ⬜ **Teste manual (usuário):** "+" → buscar biblioteca → tocar item → mudar porção → macros escalam → Adicionar; chat: "qual meu plano da semana?" → card; "como estou na meta de proteína?" → sem card; `registra meu almoço: ...` → tool-use ok

---

## Sessão: 02/08/2026 — Testes automatizados (Vitest) — primeira bateria

### 🎯 O que foi feito
- **Setup Vitest**: `npm i -D vitest` (v4.1.10, compatível com Vite 7); bloco `test` no `vite.config.ts` (`environment: node`, `include: ["src/**/*.test.{ts,tsx}"]`); script `npm test` (`vitest run`). Sem jsdom — lógica é node puro.
- **Refactor para testabilidade** (SEM mudança de comportamento):
  - Novo `src/lib/coach-plan.ts` (puro, zero imports): `CoachPlan`/`CoachObjective`/`CoachGoals`/`CoachStats` + `inferCoachObjective` + `buildCoachPlan` (movidos de `nutrition.functions.ts`) + `confidenceFromStats` + `nextActionFromStats` (movidos de `chat.functions.ts`).
  - Novo `src/lib/food-utils.ts` (puro): `parseFoodWeight` + `scaleMacros` (movidos de `app.nutricao.tsx`).
  - Bônus de arquitetura: **some o cross-import** `chat.functions → nutrition.functions` (agora ambos importam de `@/lib/coach-plan`).
- **Bateria de testes (27 passando)**:
  - `coach-plan.test.ts`: `inferCoachObjective` (Emagrecimento/Hipertrofia/Recomposição/Manutenção + borda cal-baixa-prot-baixa→Recomposição); `buildCoachPlan` (foco, metas, próximo ação, checklist com 3 itens, objetivo preferido); `confidenceFromStats` (fronteiras 12/6); `nextActionFromStats` (prioridade treino→refeição→peso→rotina).
  - `food-utils.test.ts`: `parseFoodWeight` (g/kg/vírgula/ml default/inválidos); `scaleMacros` (serving vs 100g, escala, precedência, alias `energy-kcal`, arredondamento 1 casa).
  - `utils.test.ts`: `getLocalDate` (formato local, pad-start).

### ✅ Estado final
- ✅ `npm test` → **27 testes verdes** (3 arquivos)
- ✅ `npm run build` validado após o refactor
- ✅ `tsc --noEmit` limpo nos arquivos tocados
- ⬜ **Smoke manual:** Nutrição (buscar biblioteca, scanner) e Chat (plano da semana) — comportamento idêntico (refactor é só movimentação de código)

## Sessão: 02/08/2026 — Testes de UI (jsdom) + matemática pura de reescala (2ª bateria)

### 🎯 O que foi feito
- **Setup jsdom + testing-library**: `npm i -D jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event`. Novo `src/test/setup.ts` importando `@testing-library/jest-dom/vitest` + `afterEach(cleanup)` (sem `globals: true`, o auto-cleanup do RTL não dispara). `vite.config.ts`: `setupFiles` adicionado; **sem** `environmentMatchGlobs` (removido no Vitest 4) — o jsdom é ativado por **docblock** `// @vitest-environment jsdom` no topo dos testes `*.component.test.tsx`.
- **Extração `PlanCard`** (SEM mudança de comportamento): movido de `app.chat.tsx:53-111` para novo `src/components/plan-card.tsx` (componente apresentacional puro, só `plan` prop). `app.chat.tsx` removeu `Collapsible`/`ChevronDown` dos imports (só eram usados no card) e mantém `Sparkles` (header) e `CoachPlan` (`Msg.plan`).
- **Extração `rescaleMacros`**: a matemática inline do `onChange` da porção (`app.nutricao.tsx`) virou função pura `rescaleMacros(prev, refGrams, newGrams)` em `src/lib/food-utils.ts` (tipo `MacroState` exportado). Preserva o **detalhe real**: kcal arredonda para **inteiro**, P/C/G para **1 casa**; campos `""` permanecem `""`; guarda `refGrams/newGrams <= 0` → devolve `prev`.
- **Bateria (11 testes novos)**:
  - `food-utils.test.ts` +6: `rescaleMacros` — ratio 2x/0.5x, assimetria de arredondamento (kcal int vs P/C/G 1 casa), campos vazios, guarda `<=0`.
  - `plan-card.component.test.tsx` (jsdom) +6: título recolhido esconde conteúdo; chip de objetivo visível; expandir ao toque mostra foco/metas; checklist com N `<li>`; próxima ação; recolher de novo.

### ✅ Estado final
- ✅ `npm test` → **38 testes verdes** (4 arquivos: 27 primeira bateria + 6 rescale + 6 PlanCard, com 1 bloco a mais)
- ✅ `npm run build` validado após os refactors (PlanCard + rescaleMacros)
- ✅ `tsc --noEmit` limpo nos arquivos tocados (erros pré-existentes de `body_measurements`/`BarcodeDetector`/`profiles`/`vite.config` ficam fora de escopo)
- ⬜ **Smoke manual:** Chat — pergunta "qual o meu plano da semana?" → card idêntico (recolhe/expandiu igual); `Sparkles` do header continua.

## Sessão: 02/08/2026 — Testes unitários de ai-settings (lógica pura de providers) — 3ª bateria

### 🎯 O que foi feito
- **Extração para `src/lib/ai-settings.ts`** (puro, zero imports, testável em node): `normalizeAiSettings`, `resolveAiProvider`, `getTextModel`, `resolveAiApiKey`, `resolveAiChatEndpoint` (endpoint determinístico) + tipos `AiProvider`/`AiSettings`/`AiSettingsRow` (agnóstico do tipo do Supabase). **Preserva detalhes reais** que regridem fácil: `nvidia` usa `openrouter_api_key` (não a próxima), `nvidia_model` vem de `omniroute_base_url` (trim), fallback de env por provider com prioridade (omniroute → OPENROUTER → GROQ).
- **`ai-settings.functions.ts`** agora importa do módulo puro e **re-exporta** os símbolos (nenhum outro arquivo muda o import): `fetchAiSettings`/`fetchNvidiaModels`/`callAiChatCompletion` permanecem no server-fn (usam `supabase`/`fetch`/`createServerFn`). `callAiChatCompletion` passou a usar `resolveAiChatEndpoint`.
- **Bateria (17 testes novos)**: `src/lib/ai-settings.test.ts` — `normalizeAiSettings` (provider/fallback groq, nvidia_model, chaves), `resolveAiProvider`, `getTextModel` (default vs nvidia custom), `resolveAiApiKey` (armazenada vs env fallback, nvidia via openrouter, prioridade omniroute), `resolveAiChatEndpoint` (por provider + baseUrl custom + fallback groq).

### ✅ Estado final
- ✅ `npm test` → **55 testes verdes** (5 arquivos: 38 anterior + 17 ai-settings)
- ✅ `npm run build` validado (client + server)
- ✅ `tsc --noEmit` limpo nos arquivos tocados
- ⬜ **Smoke manual:** IA config (tela `/app/ia`, modelos NVIDIA) e chat com provider — sem mudança de comportamento esperada (refactor é só movimentação)

## Sessão: 02/08/2026 — Bundle splitting + router prefetch (carregamento inicial no celular)

### 📊 Medição antes
`dist/client/assets`: entry `index` **362 KB** (carregava em todas as rotas), `supabase` 199 KB, `recharts` 373 KB, `pdf` 378 KB, `html2canvas` 196 KB. O roadmap citava recharts/supabase como vilões, mas medição mostrou que **recharts e jspdf já eram lazy por rota** — o problema real era o entry grande com as deps misturadas.

### 🎯 O que foi feito
- **`manualChunks` granular** (`vite.config.ts`): a função agora separa deps estáveis por janela de uso — `react`, `router`, `query`, `supabase`, `radix`, `forms`, `ui-utils`, `charts`, `pdf`, `ui-misc`. Princípio: enumerar **deps** (não rotas), cada uma cai no primeiro bucket que casa; quem não casa fica no chunk default. Divide o entry e melhora cache hit entre deploys (deps mudam menos que o código do app).
- **Router prefetch** (`src/router.tsx`): `createRouter` agora tem `defaultPreload: "intent"` + `defaultPreloadStaleTime: 30_000`. A lazy route baixa no hover/focus do link → navegação quase instantânea no clique. Antes o default era `false` (sem prefetch).
- **Limpeza de import morto** (`src/routes/app.tsx`): `app.tsx` importava supabase top-level mas não usava (o supabase é usado por `auth-context` no shell e por `use-reminders`). Removido. O supabase client já era um chunk separado (199 KB) puxado pelo auth-context — indispensável em toda tela autenticada, então não dá pra tirar do primeiro load sem mexer no auth (fora de escopo).

### 📊 Resultado (cliente)
- Entry `index`: **362 KB → 144 KB** (primeiro load enxuto).
- `recharts` (384 KB) e `jspdf` (574 KB) **fora do entry** — só carregam nas rotas que usam.
- Surgiram chunks `react` (189 KB), `radix` (94 KB), `ui-utils` (54 KB) etc. — estáveis, paralelizam download e melhoram cache.
- `supabase` segue como chunk próprio (199 KB, necessário via auth).

### ⬜ Por conferir (smoke manual no celular)
- Primeiro load de `/app` deve parecer mais rápido.
- Navegar para `/app/medidas` (gráficos) → chart só carrega ao entrar (já era assim).
- Foco/hover num link (prefetch) → navegação quase instantânea.

## Sessão: 02/08/2026 — Testes de integração (FoodLibrary renderizado com supabase mock) — 4ª bateria

### 🎯 O que foi feito
- **Primeiro teste de integração** (`src/components/food-library.component.test.tsx`, jsdom): renderiza o componente `FoodLibrary` inteiro com um **supabase "fake" chainable** (injetado via `vi.mock` do `@/integrations/supabase/client`) e da server-fn `lookupNutrition` mockee. Confirma o fluxo real de dados:
  1. **load**: `useEffect` consulta `food_library` e lista os alimentos do banco.
  2. **busca**: filtra a lista pelo nome.
  3. **vazio**: card "Nenhum alimento" quando a biblioteca está vazia.
  4. **diálogo adicionar**: muda a porção (100→150g) → macros escalam no preview (195 kcal→**293**, prot 31→46.5) → confirma insert em `meal_items` com `ensureMeal` + `onItemAdded`.
  5. **validação**: "Adicionar" desabilitado quando a porção é zerada.
- **Mock inline em `vi.hoisted`** (lição): o `vi.mock` é hoisted ao topo, então **não consegue ler consts top-level** do módulo de teste. O supabase fake é construído **inline** no `vi.hoisted` (sem import externo) — por isso o helper separado `src/test/supabase-mock.ts` que criei acabou ficando sem uso (removido).

### ✅ Estado final
- ✅ `npm test` → **60 testes verdes** (6 arquivos: 55 anterior + 5 integração)
- ✅ `npm run build` validado (client + server)
- ✅ `tsc --noEmit` limpo nos arquivos tocados

## Sessão: 02/08/2026 — Expansão de integração: pages de CRUD (Lembretes + Metas) — 5ª bateria

### 🎯 O que foi feito
- **Escopo (decidido com o usuário = "de forma segura")**: estender o teste de integração a mais **componentes de página de CRUD** (não rotas inteiras via MemoryRouter). O MemoryRouter puxaria o layout `/app` inteiro (theme, reminders, nav, dezenas de `Link`) — superfície grande e frágil. Alvos: Lembretes e Metas, renderizando a página com supabase "fake" + `useAuth` mock.
- **`src/components/reminders-page.tsx` + `app.lembretes.tsx`**: extraí `RemindersPage` da rota para `src/components/` (a rota importa dele).
- **`src/components/goals-page.tsx` + `app.metas.tsx`**: extraí `GoalsPage` da rota para `src/components/`.
- **Por que extrair (lição importante)**: exportar a página **do arquivo de rota** faz o TanStack Router emitir warning de performance — "não será code-split e aumenta o bundle" (é o oposto do que fizemos no bundle splitting). Ao mover para `src/components/`, a rota fica limpa e o componente segue code-splitted.
- **Testes** (`reminders-page.component.test.tsx` **5**, `goals-page.component.test.tsx` **4**): 
  - Lembretes: carrega e lista; adiciona (`insert` `reminders`); não insere sem dias; toggle (`update`); remove (`delete`).
  - Metas: pré-carrega meta existente (`maybeSingle`); mostra soma calórica `macroKcal`; salvar → `upsert` `goals` + `navigate`; aviso "difere >50kcal".
- **Padrão**: `vi.hoisted` inline (vi.mock hoisted), `beforeEach(mock.reset)` p/ isolar calls entre testes, `Notification` stub no antes.

### ✅ Estado final
- ✅ `npm test` → **69 testes verdes** (8 arquivos: 60 + 5 lembretes + 4 metas)
- ✅ `npm run build` validado (client + server) — **sem** warning de code-split
- ✅ `tsc --noEmit` limpo nos arquivos tocados

---

## Sessão: 04/08/2026 — Fuso horário FIXO em America/Sao_Paulo (correção definitiva de UTC)

### 🎯 O que foi feito
- **`src/lib/utils.ts`**: `getLocalDate` reescrito para `Intl.DateTimeFormat` com `timeZone: "America/Sao_Paulo"` (antes usava `getFullYear/getMonth/getDate` — getters **dependentes do fuso do runtime**). Novos helpers: `getLocalDateMinusDays`, `formatLocalDate`, `todayBoundsSaoPaulo` (interna `toYmd`).
- **~15 arquivos** (server-fns `chat`/`medidas`/`corpo` + rotas `coach`/`relatorio`/`nutricao`/`nutricao-historico`/`peso`/`corpo`/`medidas`/`treinos`/`exercicios`/`index` + `Heatmap`) migrados para os helpers novos.
- **`src/lib/utils.test.ts`**: testes reescritos com instants absolutos (`new Date("...Z")`) — provam fuso independente da máquina (inclui borda 02:00Z vs 03:00Z).

### 🔍 Déficit real (por que voltou a aparecer)
Este é o terceiro ajuste de fuso; os dois anteriores **corrigiam o sintoma, não a causa**:
- **24/06** (sessão "Correção de Datas UTC vs Local em Todo o App"): trocou `toISOString()` por `getLocalDate()`.
- **15/07** (sessão "Datas UTC Reintroduzidas no Chat"): `getLocalDate()` também no `sendChat`.
- **Problema:** o `getLocalDate` ainda dependia do **fuso do runtime**. Funcionava no browser (aparelho em SP) e em dev local, mas o **Cloudflare Worker roda em UTC** — logo, de novo, uma refeição às 22h de SP = 01h UTC do dia seguinte caía no dia errado. A primeira correção padronizou o *uso* de `getLocalDate`, mas não tornou a *função* independente de fuso.

### 🛠️ Solução definitiva (fuso FIXO, independente do runtime)
1. **`getLocalDate(date?)`** — hoje/data do instant em `America/Sao_Paulo` via `Intl.DateTimeFormat.formatToParts`. Independente de runtime (browser, Worker UTC, servidor de teste, CI).
2. **`getLocalDateMinusDays(days, from?)`** — data civil SP de N dias atrás; **conta dias civis**, não subtrai ms (`Date.now() - N*86400000` desliza na virada de fuso). Usado nos filtros de janela (7/28/30 dias) dos server-fns e rotas.
3. **`formatLocalDate(iso, opts?)`** — string `YYYY-MM-DD` → pt-BR sem construir instant sujeito ao fuso. Corrige a exibição `new Date(x + "T00:00").toLocaleDateString("pt-BR")` que mostrava **ontem** no Worker (00:00Z = 21h do dia anterior em SP).
4. **`todayBoundsSaoPaulo()`** — limites ISO UTC de "hoje SP" (00:00 SP = 03:00Z) para query `gte/lte` em colunas TIMESTAMP. Corrige `app.index.tsx` (treino-de-hoje), que montava `dayStart/dayEnd` com `now.getFullYear()` (dia UTC no Worker).

### 🧭 Decisões (alinhadas com o usuário)
- **São Paulo fixo em todo o app** (SP sem horário de verão desde 2020 → UTC-3 estável), mesmo no Worker.
- **Timestamps no banco continuam `new Date().toISOString()` em UTC** (`completed_at`, `created_at`) — instante absoluto, correto; só a leitura/formação usa SP. Sem migration, preserva histórico.
- **NÃO mexer**: cálculo de idade (diferença de calendário em anos); `use-reminders.tsx` `getHours()` (dispara no **relógio do aparelho** — correto para lembrete); cronômetro de treino (`Date.now() - startedAt`, duração de instante).

### ✅ Estado final
- ✅ **`TZ=UTC npx vitest run` → 75 testes verdes** (prova independência de fuso; antes eram 69)
- ✅ `tsc --noEmit` sem erros novos (só pré-existentes de schema Supabase: `body_measurements`/`profiles`)
- ✅ `npm run build` validado (client + SSR)
- ⬜ **Teste manual no celular (usuário):** registrar refeição/medida às 21h–23h do relógio de SP e confirmar que fica no dia de SP (não vira amanhã); conferir datas do histórico (não mostram ontem) — de preferência no deploy com o Worker.

---

## Sessão: 08/08/2026 — Refeição duplicada (card de calorias em dobro) + coach perdido

### 🎯 O que foi feito
O usuário registrou **um** café da manhã e o card de calorias do dia mostrou **o dobro**; o coach IA também somou errado. A causa-raiz era a mesma: **duas linhas `meals` para o mesmo (user_id, meal_date, meal_type)** — não existia nenhuma constraint única. A tela de Nutrição só renderiza a **primeira** refeição por tipo (`meals.find(meal_type)`), então a duplicada ficava **invisível**, mas o card do dia e o coach somavam os `meal_items` das **duas**. O caso do usuário veio do botão **"Copiar de ontem"**, mas o chat (`record_meal`) e um duplo-toque também criavam duplicadas.

### 🛠️ Correções (código + banco)
1. **`app.nutricao.tsx` — `ensureMeal` à prova de duplicata**: antes consultava só o estado em memória (desatualizado); agora (1) procura na lista, (2) **consulta o banco** por `(user_id, meal_date, meal_type)` com `maybeSingle`, (3) insere só se não existir e **trata corrida 23505** (re-consulta e usa o vencedor). 
2. **`app.nutricao.tsx` — guard anti double-tap**: `writingRef` + `guard(async fn)` serializa `addFood`, `addRecent`, `addFavoriteToMeal`, `confirmPhotoItems` e `duplicateYesterday`. Na segunda tecnologia, o botão é bloqueado até a primeira terminar.
3. **`chat.functions.ts` — `executeRecordMeal`**: o chat criava uma **nova** refeição a cada `record_meal`. Agora **reaproveita** a refeição do dia/tipo já existente (`maybeSingle`) e só insere se não houver; itens vão para o `meal_id` resolvido.
4. **MIGRATION `20260808000000_dedupe_meals_duplicate.sql`** (⚠️ o usuário precisa aplicar): (1) reponta `meal_items` das duplicadas para a refeição **mais antiga** do grupo; (2) deleta as refeições duplicadas; (3) deduplica `meal_items` **idênticos** (efeito double-tap); (4) `CREATE UNIQUE INDEX` `meals(user_id, meal_date, meal_type)` — **proteção definitiva**. Remove o índice antigo `meals_user_date_idx` (redundante).

### ✅ Estado final
- ✅ `TZ=UTC npx vitest run` → **75 testes verdes** (nenhum teste da área de nutrição/chat quebrado)
- ✅ `tsc --noEmit` sem erros novos nos arquivos tocados (62 pré-existentes de schema Supabase — não relacionados)
- ✅ `npm run build` validado (client + SSR)
- ✅ **Migration APLICADA** no Supabase em 08/08/2026 (a etapa 1 precisou de correção: `JOIN "keep" k ON ...` no `UPDATE...FROM` falhava com `42703: column k.user_id does not exist` — reescrita como `UPDATE ... SET (subquery correlacionada) ... WHERE ... IN (subquery)`); banco agora tem `UNIQUE INDEX meals(user_id, meal_date, meal_type)` e dados duplicados antigos limpos.

---

## Sessão: 08/08/2026 — Auditoria de cálculos + ver ontem (detalhe por dia) + fix scanner

### 🎯 O que o usuário perguntou
"Consigo ver a alimentação do dia anterior?" e "os cálculos nutricionais estão corretos?" → auditamos a matemática, corrigimos um bug real do scanner e adicionamos a visualização detalhada de um dia no histórico.

### 🔍 Auditoria (resultado)
- **Somas diárias** (card do dashboard, total da página, gráfico do histórico, coach): soma simples de `meal_items` do dia — **corretas**; o "dobro" era dado duplicado (já resolvido).
- **Escala por gramas corrigida nos caminhos principais**: busca por nome (`lookupNutrition`), biblioteca "+", editar item, recentes/favoritos.
- **BUG REAL encontrado — scanner de código de barras** (`onBarcode`): o fluxo **não** setava `refGrams`. Resultado: escanear um produto e depois **mudar a "Porção (g)" NÃO reescalava os macros** — ficava o valor da porção escaneada (subestimava kcal). 

### 🛠️ Correções e melhorias
1. **`app.nutricao.tsx` — fix scanner**: `setRefGrams(null)` no início do scan (também evita refGrams obsoleto no caminho manual); `setRefGrams(servingGrams)` no ramo Open Food Facts; `setRefGrams(100)` no fallback IA. Agora mudar a porção após escanear reescala proporcional.
2. **NOVO `src/components/nutrition-day-detail.tsx` (`NutDayDetail`)**: card "Alimentação do dia" com date input (padrão: **ontem** — a tela principal já é hoje; max = hoje). Lista as refeições/itens do dia selecionado agrupadas por tipo (Café da manhã→Ceia) com gramas/kcal/P/C/G e **total do dia**. Vai pela mesma estrutura do `meals.find` + `meal_items` — com o unique index, no máximo uma refeição por tipo/dia.
   - **Detalhe importante**: efeito depende de `user?.id` (string estável), **não** do objeto `user` — o contexto recria o objeto a cada render e sem isso o `useEffect` re-buscava em loop (a128amento também o teste). 
3. **`app.nutricao-historico.tsx`**: `<NutDayDetail />` integrado no topo da "Visão geral" (antes dos gráficos).

### ✅ Estado final
- ✅ `TZ=UTC npx vitest run` → **78 testes verdes** (75 + 3 novos em `nutrition-day-detail.component.test.tsx` com o padrão `vi.hoisted` de supabase mock + useAuth)
- ✅ `tsc --noEmit` sem erros novos nos arquivos tocados (62 pré-existentes — baseline)
- ✅ `npm run build` validado (client + SSR)

## Sessão: 09/08/2026 — Metas diárias não salvavam (ON CONFLICT (user_id) sem constraint no banco real)

### 🎯 O que o usuário perguntou
"Ao salvar a estratégia de proteína (conservador/moderado/padrão treino) em Metas diárias, aparece: `there is no unique or exclusion constraint matching the ON CONFLICT specification`."

### 🔍 Causa raiz
A tabela `goals` **do banco real** foi criada pelo `schema_completo.sql` com **PK artificial `id`** e `user_id` **sem constraint única**. Mas o app salva com `supabase.from("goals").upsert(payload, { onConflict: "user_id" })` — em **5 lugares**: home (`app.index.tsx`, auto-sync `goal_auto`), página de Metas (`goals-page.tsx`), Nutrição (`app.nutricao.tsx` auto-sync) e Coach (`app.coach.tsx`, ajuste de calorias). O Postgres só aceita `ON CONFLICT (user_id)` se houver `UNIQUE` em `user_id`. A tabela `ai_settings` tem `user_id` como PK (por isso lá o upsert funciona e o erro aparecia só em `goals`).

### 🛠️ Correção
1. **Nova migration `supabase/migrations/20260809000000_goals_user_id_unique.sql`** (SQL puro, código TS intocado):
   - **Dedupe** — se houver mais de uma linha por `user_id`, mantém a mais recente: `DELETE … WHERE ctid IN (SELECT ctid FROM ranked WHERE rn>1)` com `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY updated_at DESC, ctid DESC)`.
   - **`CREATE UNIQUE INDEX goals_user_id_key ON public.goals(user_id)`** — é isso que o `ON CONFLICT` precisa. `IF NOT EXISTS` protege banco que já tenha `user_id` como PK.
2. **`supabase/schema_completo.sql`**: `user_id UUID NOT NULL UNIQUE REFERENCES …` — recriar o banco à mão não reimporta o bug.

### ✅ Estado final
- ✅ Migration aplicada pelo usuário no **Supabase SQL Editor** → salvar a estratégia de proteção voltou a funcionar.
- ✅ Sem mudanças de TS/testes (só SQL).
- A partir daqui, o home volta a sincronizar a meta automaticamente sem erro silencioso.

---

## Sessão: 10/08/2026 — Relógio de descanso (treinos) não fica mais fixo ao rolar

### 🎯 Funcionalidade trabalhada
`src/styles.css` → regra global `html, body` de prevenção de overflow horizontal (introduzida no commit `448f33f`, 08/08/2026)

### 🔍 Problema relatado
O usuário notou que o **timer de descanso** em `src/routes/app.treinos.$id.tsx:614` (`sticky top-[57px] z-20`) parou de ficar "grudado" na tela ao rolar os exercícios para baixo. O mesmo valia para o cabeçalho do app (`src/routes/app.tsx:60`, `sticky top-0 z-10`).

### 🐞 Causa raiz
O índice `git log -S "sticky top-[57px]"` provou que o timer **sempre foi sticky** (desde `0fb044a`, "add daily workout report") — o código da tela não mudou. O que quebrou foi o commit **`448f33f`** ("prevencao de overflow horizontal"), que adicionou em `src/styles.css`:

```css
html, body {
  max-width: 100vw;
  overflow-x: hidden;
}
```

**Por que `overflow-x: hidden` quebra `position: sticky`:** conforme a spec de CSS Overflow, quando um dos eixos é `hidden` o outro (`overflow-y`) **computa para `auto`**. Isso promove o `html`/`body` a **container de rolagem (scrollport)**. O sticky então se ancora no scrollport do `body` — que nunca rola (o conteúdo está na página principal) — em vez do viewport real. Resultado: o elemento nunca "gruda". É o bug clássico de "adicionei `overflow-x: hidden` para evitar scroll horizontal e o sticky parou".

### 🛠️ Solução aplicada
Em `src/styles.css`, trocado `overflow-x: hidden` por **`overflow-x: clip`** (mantendo `max-width: 100vw` e o comentário explicativo):

```css
html, body {
  max-width: 100vw;
  overflow-x: clip;
}
```

- `overflow: clip` recorta o transbordamento horizontal **sem criar scrollport** — o `position: sticky` volta a se ancorar no viewport e o timer/header "grudam" de novo, com a prevenção de overflow preservada.
- **Fallback em navegadores antigos** (sem suporte a `clip`, ~pré-2022): o valor é ignorado → `overflow-x: visible` → o overflow horizontal volta a existir, mas o sticky também volta. Degradação aceitável para PWA mobile.
- Nenhuma outra mudança na cadeia de ancestrais (layout `app.tsx` e `main` estão sem `overflow`) — fix isolado e mínimo.

### ✅ Estado final
- ✅ Timer de descanso e header voltam a ficar fixos ao rolar
- ✅ Prevenção de overflow horizontal no mobile preservada
- ✅ Mudança só em CSS (sem testes/Vitest afetados; sem type-check a fazer)
