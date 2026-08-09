# Plano de Melhorias: Módulo de Nutrição e Coach IA (FitWell Hub)

Este documento descreve detalhadamente as especificações técnicas, regras de negócio e passos de implementação para as melhorias do módulo de Nutrição (`/app/nutricao`) e integração com o Coach IA. Qualquer agente de IA ou desenvolvedor pode seguir este guia para implementar estas funcionalidades de forma isolada ou conjunta.

---

## 📋 Sumário de Funcionalidades

1. [Badge de Estado Calórico Inteligente (Déficit / Manutenção / Superávit)](#1-badge-de-estado-calórico-inteligente)
2. [Atalho para "Registro Rápido de Refeição" (Quick Add)](#2-atalho-para-registro-rápido-de-refeição-quick-add)
3. [Botões de Gramagem e Porções Pré-definidas](#3-botões-de-gramagem-e-porções-pré-definidas)
4. [Gráfico de Distribuição Percentual de Macros (% P / C / G)](#4-gráfico-de-distribuição-percentual-de-macros--p--c--g)
5. [Mini-Card de Insights em Tempo Real do Coach IA](#5-mini-card-de-insights-em-tempo-real-do-coach-ia)

---

## 1. Badge de Estado Calórico Inteligente

### 🎯 Objetivo
Exibir visualmente e de relance na tela de Nutrição o estado térmico/metabólico atual do usuário no dia (Déficit, Manutenção ou Superávit) com base nas calorias registradas e na sua meta calculada via TDEE.

### 📐 Regras de Negócio & Lógica
- **Fórmula do Saldo**: `saldo = caloriasConsumidas - metaCalorica`
- **Classificação**:
  - `saldo < -100`: **🟢 Déficit Calórico** (`Math.abs(saldo)` kcal abaixo da meta). Indicado para emagrecimento/cutting.
  - `-100 <= saldo <= 100`: **🔵 Manutenção Calórica** (±`Math.abs(saldo)` kcal da meta). Indicado para manutenção e recomposição.
  - `saldo > 100`: **🟠 Superávit Calórico** (`+saldo` kcal acima da meta). Indicado para hipertrofia/bulking.

### 🛠️ Passos de Implementação
1. **Arquivo**: [src/routes/app.nutricao.tsx](file:///e:/Apps/fitwell/fitwellhub/src/routes/app.nutricao.tsx)
2. **Local**: Dentro do `Card` de Resumo Nutricional no topo da página.
3. **Componente**: Usar um `Badge` (ou div pill com Tailwind) e ícones da `lucide-react` (`TrendingDown`, `Minus`, `TrendingUp`).
```tsx
const calorieDiff = consumed.calories - userGoals.calories;
const status =
  calorieDiff < -100
    ? { label: `Déficit (${Math.abs(Math.round(calorieDiff))} kcal)`, variant: "emerald", icon: TrendingDown }
    : calorieDiff > 100
      ? { label: `Superávit (+${Math.round(calorieDiff)} kcal)`, variant: "amber", icon: TrendingUp }
      : { label: "Manutenção Calórica", variant: "blue", icon: Minus };
```

---

## 2. Atalho para "Registro Rápido de Refeição" (Quick Add)

### 🎯 Objetivo
Permitir que o usuário lance rapidamente uma refeição fora de casa ou um prato por quilo sem precisar buscar alimento por alimento na tabela TACO/OpenFoodFacts.

### 📐 Regras de Negócio & Lógica
- O usuário escolhe a **Refeição** (*Café da manhã*, *Almoço*, *Jantar*, *Lanche*).
- Define um **Nome/Descrição** (ex: *"Almoço por quilo - Restaurante"*).
- Preenche as **Calorias (kcal)** [Obrigatório].
- Preenche opcionalmente **Proteínas (g)**, **Carboidratos (g)**, **Gorduras (g)** (com fallback para 0 se omitido).
- Define gramagem estimada (padrão `100g`).
- Insere diretamente na tabela Supabase `meal_items`.

### 🛠️ Passos de Implementação
1. **Criar Componente**: `src/components/quick-add-meal-dialog.tsx`
2. **Campos**:
   - `mealType` (Select)
   - `name` (Input text, ex: "Refeição genérica / fora de casa")
   - `calories` (Input number)
   - `protein_g`, `carbs_g`, `fat_g` (Input number)
3. **Integração no Menu**: Adicionar um botão `<Zap className="h-5 w-5" />` com o título *"Registro Rápido"* ao lado do botão de Adicionar Alimento no cabeçalho de `/app/nutricao`.

---

## 3. Botões de Gramagem e Porções Pré-definidas

### 🎯 Objetivo
Reduzir a fricção de digitar números na hora de cadastrar a porção de um alimento, oferecendo botões de 1-clique para quantidades comuns.

### 📐 Regras de Negócio & Lógica
- Chips disponíveis: `50g`, `100g`, `150g`, `200g`, `250g`, `300g`.
- Ao clicar em um chip:
  - Atualiza o estado `grams` do formulário.
  - Se houver `refGrams` e macros de referência, executa a função de escala proporcional `rescaleMacros` para ajustar calorias e macros automaticamente.

### 🛠️ Passos de Implementação
1. **Arquivos**: 
   - [src/routes/app.nutricao.tsx](file:///e:/Apps/fitwell/fitwellhub/src/routes/app.nutricao.tsx) (modal de Adicionar alimento)
   - [src/components/FoodLibrary.tsx](file:///e:/Apps/fitwell/fitwellhub/src/components/FoodLibrary.tsx)
2. **UI**: Adicionar uma linha de botões `button type="button"` em estilo pill (`rounded-full bg-secondary text-xs px-2 py-1`) logo abaixo do `<Input type="number" value={grams} />`.

---

## 4. Gráfico de Distribuição Percentual de Macros (% P / C / G)

### 🎯 Objetivo
Visualizar a distribuição relativa de macronutrientes na dieta do dia (proporção de calorias provenientes de Proteína, Carboidrato e Gordura).

### 📐 Regras de Negócio & Lógica
- **Fatores Energéticos**:
  - 1g Proteína = 4 kcal
  - 1g Carboidrato = 4 kcal
  - 1g Gordura = 9 kcal
- **Cálculo**:
  - `pKcal = consumed.protein_g * 4`
  - `cKcal = consumed.carbs_g * 4`
  - `fKcal = consumed.fat_g * 9`
  - `totalKcalMacros = pKcal + cKcal + fKcal`
  - `% Proteína = totalKcalMacros > 0 ? (pKcal / totalKcalMacros) * 100 : 0`
  - `% Carboidrato = totalKcalMacros > 0 ? (cKcal / totalKcalMacros) * 100 : 0`
  - `% Gordura = totalKcalMacros > 0 ? (fKcal / totalKcalMacros) * 100 : 0`

### 🛠️ Passos de Implementação
1. **Arquivo**: [src/routes/app.nutricao.tsx](file:///e:/Apps/fitwell/fitwellhub/src/routes/app.nutricao.tsx)
2. **UI**: Adicionar uma barra dividida em 3 segmentos coloridos (ex: Azul/Cobre/Verde) no `Card` de Resumo Nutricional com a porcentagem correspondente de cada macro abaixo das barras de valores absolutos.

---

## 5. Mini-Card de Insights em Tempo Real do Coach IA

### 🎯 Objetivo
Fornecer orientações contextuais curtas e proativas do Coach IA diretamente na tela de Nutrição sem que o usuário precise abrir o chat.

### 📐 Regras de Negócio & Exemplo de Gatilhos
- **Gatilho de Proteína à Tarde**: Se o horário local for `>= 16:00` e `consumed.protein_g / userGoals.protein_g < 0.5`, exibir:
  > 💡 *Dica do Coach:* Você consumiu menos de 50% da sua meta de proteína hoje. Inclua uma fonte magra no lanche da tarde ou jantar.
- **Gatilho de Limite Calórico**: Se `remainingMacros.calories <= 200` e `remainingMacros.calories > 0` antes do jantar:
  > 💡 *Dica do Coach:* Seu saldo de calorias restante está em ${Math.round(remainingMacros.calories)} kcal. Sugerimos uma refeição leve rica em fibras e proteína.

### 🛠️ Passos de Implementação
1. **Arquivo**: [src/routes/app.nutricao.tsx](file:///e:/Apps/fitwell/fitwellhub/src/routes/app.nutricao.tsx)
2. **Posição**: Entre o Card de Resumo de Calorias e a lista de refeições registradas.
3. **Estilo**: Card compacto com borda destacada e ícone `<Sparkles className="h-4 w-4 text-primary" />`.

---

## 🧪 Plano de Testes e Validação
Ao implementar cada uma destas etapas:
1. Executar os testes unitários da aplicação: `npm test -- --run`
2. Garantir que não haja regressão nas telas de `/app/nutricao`, `/app/index` ou `/app/chat`.
3. Validar a renderização em dispositivos mobile (telas pequenas de até 360px de largura).
