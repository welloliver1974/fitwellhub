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

### ✅ Próximos passos
1. ✅ Código migrado para OpenRouter
2. ⬜ **Usuário precisa:** Criar conta em [openrouter.ai](https://openrouter.ai), gerar uma chave e colar no `.env` em `OPENROUTER_API_KEY`
3. ⬜ Se quiser trocar de modelo, basta alterar a string `model` na requisição — sem mudar código
