# Biblioteca de Alimentos (Food Library)

## Objetivo

Acelerar o registro de refeições na aba **Nutrição** com um acervo pessoal de alimentos
consumidos com frequência, cada um já com a tabela nutricional preenchida. Ao adicionar,
informa-se a porção em gramas e os macros recalculam proporcionalmente — sem depender de
digitar o nome e chamar a IA toda vez.

## Decisões de produto

| Decisão | Escolha |
|---|---|
| Relação com Favoritos | **Biblioteca separada** — `favorite_foods` (coração) continua funcionando como está |
| Porção ao adicionar | **Gramas flexíveis com recálculo** — alimento guardado por porção de referência (default 100g); ao adicionar, os macros escalam proporcionalmente ao que o usuário digitar |
| Conteúdo inicial | **Começa vazia + botão "Importar pack"** — pack de alimentos brasileiros comuns (valores TACO aproximados, ~50 itens) importável em 1 clique; o usuário poda o que não usa |
| Acesso | **Seção dentro da tela de Nutrição** — card colapsável "Meus alimentos", sem rota nova |

## Arquivos

| Arquivo | Ação | O que contém |
|---|---|---|
| `supabase/migrations/20260801000000_food_library.sql` | novo | Tabela `food_library`, RLS (`own ... all`), índice em `user_id` |
| `src/integrations/supabase/types.ts` | editado | Tipo `food_library` (Row/Insert/Update), espelhando `favorite_foods` + campo `category` |
| `src/lib/food-pack-taco.ts` | novo | `FOOD_PACK` (~50 alimentos BR comuns por 100g) e `FOOD_CATEGORIES` (8 categorias) |
| `src/components/FoodLibrary.tsx` | novo | Seção + diálogos: buscar, criar/editar (com "Calcular macros com IA"), importar pack, adicionar à refeição com recálculo em tempo real |
| `src/routes/app.nutricao.tsx` | editado | Renderiza `<FoodLibrary>` ao final, reutilizando `ensureMeal` e `load` existentes |

## Schema (migration)

```sql
CREATE TABLE public.food_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  grams numeric NOT NULL DEFAULT 100,
  calories numeric NOT NULL DEFAULT 0,
  protein_g numeric NOT NULL DEFAULT 0,
  carbs_g numeric NOT NULL DEFAULT 0,
  fat_g numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.food_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own food_library all" ON public.food_library
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_food_library_user ON public.food_library(user_id);
```

## Fluxo de adicionar à refeição (recálculo)

`meal_items` recebe `name`, `grams`, `calories`, `protein_g`, `carbs_g`, `fat_g`.
Do acervo vem a porção de referência (`food.grams`) e os macros correspondentes.
Ao digitar `N` gramas: `ratio = N / food.grams`, e cada macro é multiplicado por `ratio`
(calorias arredondadas; proteína/carboidrato/gordura com 1 casa decimal).
O preview do dialog mostra os valores recalculados em tempo real antes de confirmar.

## Sobre o FatSecret

O app/site FatSecret BR bloqueia scraping (buscas devolveram 404) e sua base não é acessível
offline. Existe uma **API pública** (OAuth 1.0a, cadastro de app, Client ID/Secret, rate limit)
que poderia virar uma busca ao vivo no futuro. Decidido: **não integrar agora**; o pack TACO
offline cobre o caso de uso inicial sem chaves nem internet.

## Como aplicar

1. Rodar a migration no Supabase: `supabase db push` ou colar o SQL no SQL Editor do painel.
2. Abrir a aba Nutrição → seção **"Meus alimentos"** → **"Importar pack"**.

## Verificação

- `npx tsc --noEmit` sem erros nos arquivos novos (`FoodLibrary`, `food-pack-taco`, `app.nutricao`).
- `npx eslint` limpo nos arquivos novos (erros CRLF restantes em outros arquivos são pré-existentes).
- Importar pack cria ~50 itens; busca filtra; editar/criar com "Calcular macros com IA" preenche macros;
  adicionar com gramas diferentes recalcula o preview; Favoritos/Recentes seguem intactos.
