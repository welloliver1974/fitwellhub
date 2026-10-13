# Plano de Ação: Padronização e Modernização dos Gráficos (FitWell Hub)

> **Status:** Concluído e Validado (Merge na Main)  
> **Data:** 13/10/2026  
> **Objetivo:** Resolver problemas visuais e de renderização nos gráficos do app, eliminando erros de CSS/SVG, truncamento em telas mobile, tooltips genéricas e ausência de identidade visual fitness moderna.

---

## 1. Contexto e Diagnóstico

Ao auditar os gráficos do projeto ([Recharts 2.15.4](https://recharts.org/)), foram identificados cinco gargalos estruturais:

1. **Bug Crítico de Cores no SVG (`hsl(oklch(...))`):**  
   As variáveis do tema no `src/styles.css` usam `oklch` (ex: `--primary: oklch(0.82 0.18 165)`). O código passava `stroke="hsl(var(--primary))"`, gerando CSS inválido. O SVG falhava e caía em preto/currentColor, tornando linhas quase invisíveis no tema escuro.
2. **Eixo Y Cortado no Mobile:**  
   Gambiarras de margem negativa (`margin={{ left: -25 }}`) cortam os primeiros dígitos dos números (ex: `7` de `78.5 kg`) em celulares.
3. **Escalas Distorcidas no Mesmo Eixo (`app.corpo.tsx`):**  
   Gordura (%) e Músculo (kg) dividiam a mesma escala Y sem eixo duplo, esmagando a curva de gordura no fundo do gráfico.
4. **Tooltips Desalinhadas:**  
   Uso do `<Tooltip />` padrão do Recharts, que exibe caixas brancas com bordas cinzas e chaves brutas de código (`peso : 81.2`).
5. **Poluição Visual nos 30 Dias de Nutrição:**  
   30 barras empilhadas exprimidas em telas mobile de 360px sem agrupamento ou ajuste de densidade no eixo X.

---

## 2. Protocolo de Segurança e Backup (Executar ANTES de Codificar)

Antes de iniciar qualquer edição nos componentes existentes, execute estritamente os comandos abaixo para garantir **risco zero** e recuperação instantânea:

### A. Criar Tag de Restauração (Snapshot Imutável)
```bash
git tag backup-pre-graficos-20261012
```

### B. Criar Branch de Trabalho Isolada
```bash
git checkout -b feat/graficos-modernos
```
*(A branch `main` permanece 100% intocada e funcionando).*

### C. Criar Cópia Física Local de Segurança (Espelho dos Arquivos)
Criar uma pasta de segurança temporária para consulta direta caso precise comparar o código original:
```powershell
New-Item -ItemType Directory -Force -Path "doc/backup_graficos_originais"
Copy-Item "src/routes/app.peso.tsx" -Destination "doc/backup_graficos_originais/"
Copy-Item "src/routes/app.medidas.tsx" -Destination "doc/backup_graficos_originais/"
Copy-Item "src/routes/app.corpo.tsx" -Destination "doc/backup_graficos_originais/"
Copy-Item "src/routes/app.exercicios.`$name.tsx" -Destination "doc/backup_graficos_originais/"
Copy-Item "src/routes/app.nutricao-historico.tsx" -Destination "doc/backup_graficos_originais/"
```

### D. Procedimento de Rollback Imediato (Se precisar cancelar tudo)
Se qualquer problema ocorrer e você quiser voltar imediatamente ao estado original:
```bash
git checkout main
```
*Em menos de 5 segundos, todo o código volta ao estado atual exato.*

---

## 3. Arquitetura da Solução

Em vez de estilizar o Recharts de forma solta em cada página, centralizaremos os componentes reutilizáveis em `src/components/charts/`:

```
src/components/charts/
├── chart-theme.ts         # Tokens de cores compatíveis com SVG/Hex/OKLCH (Neon Mint, Amber, Rose, Cyan, Dark Card)
├── ChartTooltip.tsx       # Popover dark com backdrop-blur, borda sutil, ícones e formatação de unidades
├── AreaTrendChart.tsx     # Gráfico de área/linha contínua com gradiente suave (glow) para Peso, Medidas e Cargas
├── NutritionBarsChart.tsx # Gráfico de barras verticais e empilhadas com densidade inteligente para 7d e 30d
└── DualMetricChart.tsx    # Gráfico para Bioimpedância com eixos duplos calibrados (Esquerda: %, Direita: kg)
```

### Paleta SVG (`chart-theme.ts`):
* **Primary (Neon Mint):** `#2dd4a8` / `oklch(0.82 0.18 165)`
* **Accent (Bright Mint):** `#73ffb8` / `oklch(0.88 0.18 160)`
* **Destructive / Fat (Coral Red):** `#f43f5e`
* **Muscle (Cyan Blue):** `#38bdf8`
* **Grid & Borders:** `rgba(255, 255, 255, 0.08)`
* **Card Popover Background:** `rgba(26, 31, 31, 0.95)`

---

## 4. Checklist de Execução Faseada

### Fase 0: Salvaguardas & Backup
- [x] Executar tag `backup-pre-graficos-20261013` no Git
- [x] Criar e mudar para a branch `feat/graficos-modernos`
- [x] Criar cópia espelho dos 5 arquivos em `doc/backup_graficos_originais/`

### Fase 1: Fundação do Módulo de Gráficos (`src/components/charts/`)
- [x] Criar `src/components/charts/chart-theme.ts` com tokens de cores e configurações de grid/eixos
- [x] Criar `src/components/charts/ChartTooltip.tsx` com container estilizado e formatador flexível
- [x] Criar `src/components/charts/AreaTrendChart.tsx` com suporte a gradiente linear (`<defs><linearGradient>`), dot com halo no último valor e margens responsivas seguras

### Fase 2: Migração Progressiva dos Gráficos de Tendência
- [x] **1. Peso Corporal (`src/routes/app.peso.tsx`):**
  - Substituir Recharts inline por `AreaTrendChart`
  - Margem esquerda segura (sem cortar números de peso)
  - Tooltip formatando `kg` e data em português
  - Validar no navegador e conferir se o build passa
- [x] **2. Evolução de Exercício (`src/routes/app.exercicios.$name.tsx`):**
  - Substituir gráfico de carga máxima / tempo de cardio por `AreaTrendChart`
  - Tooltip formatando `kg` ou `min`
  - Validar responsividade
- [x] **3. Medidas Corporais (`src/routes/app.medidas.tsx`):**
  - Substituir LineChart customizado por `AreaTrendChart`
  - Remover estilos inline quebrados `hsl(var(...))`
  - Manter consistência com a lista de histórico

### Fase 3: Migração dos Gráficos Complexos
- [x] **4. Nutrição - Histórico (`src/routes/app.nutricao-historico.tsx`):**
  - Criar componente `NutritionBarsChart.tsx`
  - Gráfico 1: Calorias por dia com linha de meta pontilhada (`ReferenceLine`)
  - Gráfico 2: Macros por dia (Proteína, Carboidrato, Gordura)
  - No filtro de 30 dias: aplicar filtro de ticks no eixo X (mostrar a cada 5 dias) para evitar textos amontoados
- [x] **5. Bioimpedância (`src/routes/app.corpo.tsx`):**
  - Criar `DualMetricChart.tsx` com eixos Y duplos independentes (`yAxisId="left"` com % e `yAxisId="right"` com kg) e abas de métricas individuais
  - Resolver o achatamento da linha de gordura

### Fase 4: Auditoria Técnica e Validação
- [x] Rodar `npm run build` para garantir zero erros de tipagem TypeScript (Build concluído com sucesso em cliente e SSR)
- [x] Validar responsividade em viewport mobile estreito (360px a 390px) e desktop
- [x] Verificar consistência no modo escuro com paleta Dark Athletic (sem falhas de SVG)

### Fase 5: Revisão e Merge
- [x] Apresentar todas as telas ao usuário para validação visual
- [x] Se aprovado: mesclar a branch `feat/graficos-modernos` na `main`
- [x] Remover a pasta temporária `doc/backup_graficos_originais/`
- [x] Registrar no changelog (`doc/changelog/FIXLOG.md` e `doc/changelog/AGENTS.md`)

---

## 5. Mapeamento de Arquivos Impactados

| Caminho do Arquivo | Ação Prevista |
| :--- | :--- |
| `src/components/charts/chart-theme.ts` | **Novo** - Definições de cores e constantes |
| `src/components/charts/ChartTooltip.tsx` | **Novo** - Tooltip elegante dark com blur |
| `src/components/charts/AreaTrendChart.tsx` | **Novo** - Gráfico de área e linha |
| `src/components/charts/NutritionBarsChart.tsx` | **Novo** - Gráfico de barras calorias e macros |
| `src/components/charts/DualMetricChart.tsx` | **Novo** - Gráfico com 2 eixos para bioimpedância |
| `src/routes/app.peso.tsx` | **Modificado** - Refatoração para usar `AreaTrendChart` |
| `src/routes/app.exercicios.$name.tsx` | **Modificado** - Refatoração para usar `AreaTrendChart` |
| `src/routes/app.medidas.tsx` | **Modificado** - Refatoração para usar `AreaTrendChart` |
| `src/routes/app.nutricao-historico.tsx` | **Modificado** - Refatoração para usar `NutritionBarsChart` |
| `src/routes/app.corpo.tsx` | **Modificado** - Refatoração para usar `DualMetricChart` |
| `doc/INDEX.md` | **Modificado** - Registro do plano no índice de documentação |
