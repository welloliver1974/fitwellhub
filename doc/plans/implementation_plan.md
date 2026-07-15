# Plano de Implementação - Refatoração e Desacoplamento do Coach IA

Refatoração e organização de [chat.functions.ts](file:///e:/Apps/fitwell/fitwellhub/src/server-fns/chat.functions.ts) para separar a orquestração do agente (IA) da persistência de dados no Supabase. Isso aumenta a consistência, a manutenibilidade e a testabilidade da ferramenta de chat.

## Roteiro Rápido e Seguro

### Fase 1 - Baixo risco
- Melhorar apenas textos, estados de carregamento e explicações visuais.
- Não mudar regras de negócio.
- Manter o fluxo atual do Coach e das telas de medidas.

### Fase 2 - Saída estruturada opcional
- Adicionar campos novos sem remover o texto atual.
- Usar primeiro em uma tela só, de preferência `app.medidas.tsx`.
- Se algo falhar, o app continua mostrando o retorno em markdown.

### Fase 3 - Confiança e próxima ação
- Calcular um sinal simples de "dados suficientes" versus "dados fracos".
- Exibir uma próxima ação prática no final da análise.
- Levar o padrão para o Coach geral somente depois de validar a primeira tela.

### Regra de segurança
- Uma mudança por vez.
- Rodar `npm run build` após cada etapa.
- Testar manualmente com poucos dados, muitos dados e sem histórico.

## User Review Required

> [!IMPORTANT]
> A refatoração manterá a compatibilidade total com os schemas de banco de dados existentes e com o fluxo do frontend do TanStack Start. Nenhuma alteração de comportamento externo é esperada.

## Proposed Changes

### Servidor / IA

#### [MODIFY] [chat.functions.ts](file:///e:/Apps/fitwell/fitwellhub/src/server-fns/chat.functions.ts)

Refatorar o arquivo dividindo-o nas seguintes responsabilidades:

1. **Definição de Tipos e Esquemas**: Manter o `inputSchema` e os schemas de ferramentas do Groq.
2. **Função de Busca de Contexto (`fetchUserContext`)**:
   - Isolamento das queries de goals, meals, water, weights e history.
   - Cálculo do `dailyTotals` e formatação do `ctxText`.
3. **Gerenciador de Mensagens (`saveChatMessage`)**:
   - Salvar mensagens de usuário e assistente de forma isolada.
4. **Chamada de API do Groq (`callGroqAPI`)**:
   - Abstração da requisição HTTP para a API de chat completions do Groq.
5. **Executores de Ferramentas (Tool Executors)**:
   - `executeRecordMeal`: Insere refeição e itens nutricionais no banco.
   - `executeRecordWorkout`: Valida se o treino já existe e insere sessão e séries no banco.
6. **Orquestrador Central (`sendChat`)**:
   - Integra todas as subfunções em um fluxo limpo e robusto, tratando erros individualmente por chamada de ferramenta.

## Verification Plan

### Automated Tests
* Nossos testes automáticos serão executados via compilação e verificação de tipos do TypeScript para garantir que nenhuma tipagem ou importação foi quebrada.
  * Executar `npm run build` na pasta do projeto.

### Manual Verification
* Enviar mensagens de texto comuns para o Coach IA para validar a resposta.
* Registrar uma refeição por chat (ex: "comi 200g de arroz e 100g de frango") e verificar se a refeição e os macros foram registrados corretamente.
* Registrar um treino por chat (ex: "fiz treino de peito, supino 3 séries de 10 reps com 60kg") e verificar se o treino e séries correspondentes foram gerados nas tabelas de histórico do Supabase.
