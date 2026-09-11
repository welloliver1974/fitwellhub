# Plano de Novas Funcionalidades e Evolução do FitWell Hub

> **Data de Criação:** 10/09/2026  
> **Status:** Aberto para priorização e escolha de funcionalidades  
> **Contexto:** Após a conclusão das fases anteriores (Modo Foco com vibração tátil, Scanner de Rótulos por OCR/IA, balcão único de nutrição, alertas inteligentes de hidratação/macros, relatórios e testes automatizados), este documento consolida a próxima geração de melhorias de produto, IA, UX e engajamento para o **FitWell Hub**.

---

## 📊 Matriz Comparativa de Funcionalidades

| # | Funcionalidade | Categoria | Impacto | Esforço | Prioridade Sugerida |
|---|---|---|---|---|---|
| **1** | [Gerador de Fichas de Treino por IA](#1-gerador-de-fichas-de-treino-por-ia-workout-routine-builder) | Treinos & IA | 🚀 Muito Alto | 🟨 Médio | ⭐ Alta |
| **2** | [Sobrecarga Progressiva & 1RM no Modo Foco](#2-sobrecarga-progressiva-inteligente--1rm-estimado-no-modo-foco) | Treinos & Performance | 🚀 Muito Alto | 🟨 Médio | ⭐ Alta |
| **3** | [Daily Briefing do Coach IA na Home](#3-daily-briefing-do-coach-ia-no-topo-da-home) | Coach IA & UX | 💡 Alto | 🟩 Baixo | ✅ Concluída (10/09/2026) |
| **4** | [Gerador de Lista de Compras Inteligente](#4-gerador-de-lista-de-compras-inteligente-smart-grocery-list) | Nutrição & Rotina | 💡 Alto | 🟨 Médio | 🔹 Média |
| **5** | [Sistema de Ofensivas (Streaks) & Conquistas](#5-sistema-de-ofensivas-streaks-e-conquistas-gamificadas) | Engajamento & Retenção | 🎯 Alto | 🟨 Médio | 🔹 Média |
| **6** | [Modo "Refeição Livre & Rebalanceamento Semanal"](#6-modo-refeição-livre--rebalanceamento-calórico-semanal) | Nutrição Avançada | 💡 Alto | 🟨 Médio | 🔹 Média |
| **7** | [Timer com Alertas em Segundo Plano (Web Notifications/Áudio)](#7-timer-de-descanso-com-alerta-em-segundo-plano) | Treinos & PWA | 🔹 Médio | 🟩 Baixo | ✅ Concluída (10/09/2026) |
| **8** | [Card de Compartilhamento Diário / Stories](#8-card-de-compartilhamento-diário--stories-instagramwhatsapp) | Social & Visual | 🔹 Médio | 🟩 Baixo | ▫️ Opcional |
| **9** | [Integração de Passos & Gasto Calórico Ativo (Google Fit)](#9-integração-de-passos-e-gasto-calórico-ativo-wearables--health-connect) | Saúde & Sensores | 🚀 Muito Alto | 🟨 Médio | ✅ Concluída (10/09/2026) |

---

## 1. Gerador de Fichas de Treino por IA (Workout Routine Builder)

### 🎯 Objetivo
Permitir que o usuário monte uma divisão semanal completa de treinos (ou treinos individuais) sob medida em poucos segundos via IA, salvando os templates diretamente no Supabase sem necessidade de cadastrar exercício por exercício manualmente.

### 💡 Cenário Atual vs Proposto
* **Atual:** O usuário cria um treino do zero e precisa buscar/digitar cada exercício, configurar séries, repetições e descansos manualmente um a um.
* **Proposto:** Um assistente em modal ou página dedicada (`/app/treinos/gerador`) com perguntas objetivas:
  1. **Objetivo:** Hipertrofia (massa muscular), Força pura, Emagrecimento/Definição, Saúde e longevidade.
  2. **Frequência semanal:** 3 dias (Full Body ou ABC), 4 dias (Upper/Lower), 5 dias (Push/Pull/Legs/Upper/Lower), 6 dias (PPL 2x).
  3. **Nível:** Iniciante, Intermediário, Avançado.
  4. **Equipamento:** Academia comercial completa, Academia de condomínio/Halteres, Treino em casa (calistenia/elásticos).
  5. **Restrições & Foco:** Campo de texto livre (ex.: *"Sem agachamento livre por dores no joelho, focar em deltóide lateral"*).
* **Execução:** A IA processa o prompt usando `response_format` (JSON Schema estruturado), retorna a lista completa de treinos com nomes, posições, séries recomendadas, faixa de repetições e tempo de descanso, e permite preview antes de salvar nos templates ou na grade de treinos.

### 🛠️ Especificação Técnica
* **Arquivos:**
  * `src/server-fns/workout-generator.functions.ts`: função de servidor para chamar o LLM com schema estrito.
  * `src/routes/app.treinos.gerador.tsx` ou componente de diálogo em `src/routes/app.treinos.index.tsx`.
* **Persistência:** Inserção em lote nas tabelas `workouts` (ou `workout_templates`), `exercises` e `workout_sets`.

---

## 2. Sobrecarga Progressiva Inteligente & 1RM Estimado no Modo Foco

### 🎯 Objetivo
Transformar o Modo Foco (`/app/treinos/$id/foco`) em um assistente ativo de hipertrofia e progressão de carga (auto-periodização), calculando a força máxima estimada (1RM) e sugerindo incrementos automáticos de peso ou repetições.

### 💡 Cenário Atual vs Proposto
* **Atual:** O Modo Foco exibe no cabeçalho do exercício a última carga/reps registradas, mas não calcula evolução de força nem sugere metas para a série atual.
* **Proposto:**
  1. **Cálculo de 1RM Estimado:** Utilização das fórmulas clássicas de Epley e Brzycki:
     $$\text{1RM} = \text{Carga} \times \left(1 + \frac{\text{Reps}}{30}\right)$$
  2. **Badge de Recorde Pessoal (PR):** Se a carga + reps da série atual superarem o 1RM histórico daquele exercício, disparar animação/badge comemorativo na tela (*"🔥 Novo Recorde Pessoal (PR) no Supino!"*).
  3. **Sugestão de Sobrecarga:** Se na sessão anterior o usuário completou o teto da faixa (ex.: 3x12 com 20kg), o card da série exibe um chip sutil: *"Sugerido: subir para 22kg (+10%) para 8-10 reps"*.
  4. **Histórico Visual no Exercício (`/app/exercicios/$name`):** Gráfico de linha mostrando a evolução do 1RM e do volume de treino ao longo dos meses.

### 🛠️ Especificação Técnica
* **Arquivos:**
  * `src/lib/progression-utils.ts`: funções puras `calculate1RM(weight, reps)`, `detectPR(history, currentWeight, currentReps)` e `suggestNextWeight(previousSets)`.
  * `src/routes/app.treinos.$id.foco.tsx`: integração do badge de PR e sugestão visual de carga.
  * Testes unitários com Vitest cobrindo os cálculos de 1RM e limites fisiológicos.

---

## 3. Daily Briefing do Coach IA no Topo da Home

### 🎯 Objetivo
Recepcionar o usuário diariamente na Home (`/app`) com uma mensagem humana, motivadora e estratégica do Coach IA, contextualizada com o momento do dia, o treino planejado e o status da dieta.

### 💡 Cenário Atual vs Proposto
* **Atual:** A Home é composta por barras de progresso (macros, calorias, água) e heatmap de atividades, exigindo que o usuário interprete seus dados por conta própria.
* **Proposto:** Um card visual moderno logo abaixo da saudação:
  * **Turno da Manhã:**
    > *"Bom dia, Well! Hoje está previsto o Treino B (Costas e Bíceps). Sua meta calórica é 2.400 kcal — garanta um bom aporte de carboidratos no almoço para ter rendimento máximo mais tarde."*
  * **Turno da Noite:**
    > *"Dia finalizado! Você bateu 2.8L de água e completou o treino de pernas. Faltaram apenas 15g de proteína para fechar a meta — que tal um shake rápido antes de dormir?"*
  * **Botões de Ação Rápida:** *"Ir para o Treino"*, *"Registrar Ceia"*, ou *"Perguntar ao Coach no Chat"*.
  * **Otimização de Custo/Cache:** Armazenamento local (localStorage) por turno (manhã/tarde/noite) para não onerar tokens de IA a cada recarregamento da tela.

### 🛠️ Especificação Técnica
* **Arquivos:**
  * `src/components/daily-briefing-card.tsx`: card recolhível/elegante no topo da Home.
  * `src/server-fns/briefing.functions.ts`: função rápida com prompt conciso alimentado pelo contexto do dia.
  * Fallback determinístico offline (frases prontas baseadas nas regras de déficit/água/treino se a IA demorar ou não houver conexão).

---

## 4. Gerador de Lista de Compras Inteligente (Smart Grocery List)

### 🎯 Objetivo
Conectar a dieta do usuário e suas receitas à rotina real de compras de supermercado, eliminando o trabalho manual de calcular quantidades semanais de comida.

### 💡 Cenário Atual vs Proposto
* **Atual:** O app possui receitas e biblioteca de alimentos, mas nenhuma integração com supermercado ou planejamento de compras.
* **Proposto:**
  * Aba ou botão em `/app/nutricao/compras` onde o usuário pode escolher: *"Gerar lista para os próximos 7 dias baseada no meu padrão de consumo"*.
  * A IA agrupa os ingredientes por categorias reais de supermercado:
    * 🥩 **Açougue / Proteínas:** Frango (2kg), Ovos (30 un), Patinho moído (1kg), Whey Protein.
    * 🥦 **Hortifrúti:** Banana prata (1 dúzia), Maçã (1kg), Batata doce (1.5kg), Espinafre.
    * 🍚 **Cereais & Grãos:** Arroz parboilizado, Aveia em flocos finos.
    * 🥛 **Laticínios & Frios:** Iogurte desnatado, Queijo cottage.
  * Checklist interativo no celular para marcar o que já foi colocado no carrinho.
  * Botão de *"Copiar para WhatsApp"* ou exportar texto formatado.

### 🛠️ Especificação Técnica
* **Arquivos:**
  * `src/routes/app.nutricao.compras.tsx`
  * `src/server-fns/grocery.functions.ts`
  * Tabela Supabase local ou `localStorage` para persistir o checklist durante a ida ao mercado.

---

## 5. Sistema de Ofensivas (Streaks) e Conquistas Gamificadas

### 🎯 Objetivo
Aumentar drasticamente a retenção e o compromisso diário do usuário celebrando consistência em vez de apenas registrar números.

### 💡 Cenário Atual vs Proposto
* **Atual:** O app exibe o Heatmap anual estilo GitHub, mas não calcula dias consecutivos nem premia marcos históricos.
* **Proposto:**
  1. **Contador de Ofensiva (Streak):** Indicador com ícone de chama no cabeçalho da Home:
     * Ex.: *"🔥 7 dias consecutivos de consistência (treino + metas diárias)"*.
     * Alerta preventivo se o dia estiver acabando e faltar pouco para não perder a sequência.
  2. **Mural de Conquistas (Badges):**
     * 🥇 *Clube dos 100kg:* Primeiro supino, agachamento ou terra com 3 dígitos.
     * 💧 *Hidratação Perfeita:* 7 dias seguidos batendo a meta de água.
     * 🥗 *Mestre dos Macros:* 5 dias dentro da faixa calórica estipulada.
     * 🏋️ *Guerreiro Semanal:* 4 treinos concluídos em uma mesma semana.
  3. Modal comemorativo com confetes quando uma conquista for destravada.

### 🛠️ Especificação Técnica
* **Arquivos:**
  * `src/lib/streaks-utils.ts`: lógica pura para calcular sequências contínuas a partir de `workout_sessions` e `meal_items`.
  * `src/components/streak-badge.tsx` e `src/components/achievements-modal.tsx`.
  * Nova tabela simples `user_achievements (user_id, badge_id, unlocked_at)`.

---

## 6. Modo "Refeição Livre & Rebalanceamento Calórico Semanal"

### 🎯 Objetivo
Ajudar o usuário a lidar com eventos sociais, jantares fora ou fins de semana sem culpa, recalculando a meta calórica dos dias subsequentes para manter o balanço energético semanal inalterado.

### 💡 Cenário Atual vs Proposto
* **Atual:** Se o usuário consome 1.500 kcal acima da meta em um sábado, o app apenas mostra a barra vermelha de excesso, gerando sensação de fracasso.
* **Proposto:**
  * Botão na Nutrição: *"Compensar excesso da semana"*.
  * O app calcula o saldo calórico semanal acumulado e sugere distribuir suavemente o excesso nos próximos 3 a 5 dias:
    * Exemplo: Excesso de 600 kcal no domingo → Redução leve de 120 kcal/dia de segunda a sexta-feira.
  * O Coach IA envia uma mensagem tranquilizadora: *"Eventos sociais fazem parte de uma vida saudável sustentável. Rebalanceamos suas calorias suavemente para os próximos dias sem dietas restritivas radicais."*

---

## 7. Timer de Descanso com Alerta em Segundo Plano

### 🎯 Objetivo
Garantir que o usuário seja alertado sobre o fim do tempo de descanso mesmo se a tela do smartphone apagar ou se ele alternar para o aplicativo de música (Spotify) ou mensagens (WhatsApp).

### 💡 Cenário Atual vs Proposto
* **Atual:** O timer do Modo Foco emite bipes sonoros e vibrações apenas enquanto a aba do navegador estiver ativa e visível no primeiro plano.
* **Proposto:**
  * Integração com a **Web Notification API** (suportada em PWAs instaladas no Android e iOS 16.4+).
  * Quando o timer zera, mesmo com a tela bloqueada, o celular vibra e dispara a notificação do sistema: *"Descanso finalizado! Hora da próxima série de Supino Reto."*
  * Manter áudio contínuo através de elemento de áudio em background.

---

## 8. Card de Compartilhamento Diário / Stories (Instagram/WhatsApp)

### 🎯 Objetivo
Permitir que o usuário gere com 1 clique uma imagem elegante e minimalista com o resumo das suas vitórias do dia para compartilhar nas redes sociais.

### 💡 O que contém o card gerado:
* Data e título do treino realizado (ex.: *"Treino A - Peito & Tríceps Concluído"*).
* Carga total levantada na sessão (Volume Load: somatório de séries × reps × kg).
* Meta de água batida (ex.: *"2.8L hidratado"*).
* Frase motivacional ou insight gerado pelo Coach IA.
* Identidade visual estética dark mode com degradê do FitWell Hub.
* Exportação direta via `html2canvas` ou Canvas API nativo.

---

## 9. Integração de Passos e Gasto Calórico Ativo (Wearables / Health Connect)

### 🎯 Objetivo
Sincronizar passos diários, distância e queima calórica ativa diretamente do **Samsung Galaxy Watch** (via **Google Fit REST API**) para calcular o gasto calórico ativo real e ajustar o TDEE dinamicamente na Home (`/app`).

### 💡 Arquitetura & Fluxo de Dados
```
[ Samsung Galaxy Watch ]
         │ (Wear OS / Bluetooth)
         ▼
[ Samsung Health ]
         │ (Sincronização nativa de parceiro ativada pelo usuário)
         ▼
[ Google Fit Cloud ]
         │ (Google Fitness REST API / OAuth 2.0)
         ▼
[ FitWell Hub ] (Passos do dia, calorias ativas e ajuste dinâmico do TDEE)
```

### 📐 Regras de Negócio & Lógica
1. **Conexão Simples:** Na tela de perfil ou configurações (`/app/perfil` ou `/app/ia`), botão *"Conectar com Google Fit"*. O usuário autoriza o escopo de leitura de atividades (`fitness.activity.read`).
2. **Armazenamento Seguro:** `tokens` (access token e refresh token) salvos na tabela `user_integrations` vinculada ao `user_id`.
3. **Métricas Consumidas:**
   * **Passos do dia (`com.google.step_count.delta`):** Exibidos na Home ao lado da meta de passos (ex: `8.450 / 10.000 passos`).
   * **Calorias Ativas (`com.google.calories.expended`):** Adicionadas ao cálculo de saldo calórico do dia.
4. **Impacto no TDEE e Metas:**
   * Se o usuário gastou 350 kcal ativas caminhando no dia, a meta de calorias daquele dia pode ser ajustada dinamicamente para manter o déficit/superávit programado sem passar fome.

### 🛠️ Especificação Técnica
* **Arquivos:**
  * `src/server-fns/google-fit.functions.ts`: rotas de autenticação OAuth 2.0 (redirecionamento e troca de `code` por tokens) e consulta ao endpoint `https://fitness.googleapis.com/fitness/v1/users/me/dataset:aggregate`.
  * `src/components/steps-progress-card.tsx`: card de passos e queima calórica na Home.
  * Tabela Supabase: `user_integrations (id, user_id, provider, access_token, refresh_token, expires_at, created_at)`.
* **Esforço:** 🟨 Médio (o Google Fit REST API já padroniza todo o retorno).

---

## 📌 Próximos Passos Recomendados

Quando você estiver pronto para implementar, a ordem mais recomendada de execução por retorno de valor é:

1. **Sprint 1 (Treino de Alto Nível):** [Gerador de Fichas de Treino por IA](#1-gerador-de-fichas-de-treino-por-ia-workout-routine-builder) + [Sobrecarga Progressiva & 1RM](#2-sobrecarga-progressiva-inteligente--1rm-estimado-no-modo-foco).
2. **Sprint 2 (Experiência Diária):** [Daily Briefing do Coach IA na Home](#3-daily-briefing-do-coach-ia-no-topo-da-home) + [Sistema de Ofensivas (Streaks)](#5-sistema-de-ofensivas-streaks-e-conquistas-gamificadas).
3. **Sprint 3 (Nutrição e Rotina Prática):** [Gerador de Lista de Compras Inteligente](#4-gerador-de-lista-de-compras-inteligente-smart-grocery-list) + [Rebalanceamento Calórico Semanal](#6-modo-refeição-livre--rebalanceamento-calórico-semanal).
