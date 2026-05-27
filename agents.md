# AGENTS.md

Registro de ações realizadas por agentes autônomos (IA) no projeto FitWell Hub.

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
