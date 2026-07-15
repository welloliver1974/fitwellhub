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
