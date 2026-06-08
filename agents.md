# AGENTS.md

Registro de ações realizadas por agentes autônomos (IA) no projeto FitWell Hub.

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
