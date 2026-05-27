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
