// Utilitários puros de parsing/escala de alimentos (scanner Open Food Facts).
// Sem imports — testável em node. Movidos de app.nutricao.tsx.

export function parseFoodWeight(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== "string") return null;

  const match = value.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|gramas?|grams?)?/i);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = (match[2] ?? "g").toLowerCase();
  if (unit.startsWith("kg")) return amount * 1000;
  return amount;
}

export function scaleMacros(n: Record<string, unknown>, grams: number) {
  const ratio = grams / 100;
  const servingCalories = Number(n["energy-kcal_serving"] ?? n["energy_serving"]);
  const servingProtein = Number(n["proteins_serving"]);
  const servingCarbs = Number(n["carbohydrates_serving"]);
  const servingFat = Number(n["fat_serving"]);
  const hasServingMacros = [servingCalories, servingProtein, servingCarbs, servingFat].some(
    (v) => Number.isFinite(v) && v > 0,
  );

  if (hasServingMacros) {
    return {
      calories: Math.round(Number.isFinite(servingCalories) ? servingCalories : 0),
      protein_g: Math.round((Number.isFinite(servingProtein) ? servingProtein : 0) * 10) / 10,
      carbs_g: Math.round((Number.isFinite(servingCarbs) ? servingCarbs : 0) * 10) / 10,
      fat_g: Math.round((Number.isFinite(servingFat) ? servingFat : 0) * 10) / 10,
    };
  }

  return {
    calories: Math.round(Number(n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0) * ratio),
    protein_g: Math.round(Number(n["proteins_100g"] ?? 0) * ratio * 10) / 10,
    carbs_g: Math.round(Number(n["carbohydrates_100g"] ?? 0) * ratio * 10) / 10,
    fat_g: Math.round(Number(n["fat_100g"] ?? 0) * ratio * 10) / 10,
  };
}

// Tipo do estado de macros do diálogo de adicionar alimento (campos vazios = "").
export type MacroState = {
  calories: number | "";
  protein_g: number | "";
  carbs_g: number | "";
  fat_g: number | "";
};

// Reescala proporcional dos macros ao mudar a porção (g), mantendo o detalhe
// real do handler inline original: kcal arredonda para INTEIRO, P/C/G para 1 casa.
// Campos vazios ("") permanecem vazios. Se refGrams/newGrams <= 0, devolve prev
// (espelha a guarda `typeof v === "number" && v > 0` do onChange em app.nutricao.tsx).
export function rescaleMacros(prev: MacroState, refGrams: number, newGrams: number): MacroState {
  if (typeof newGrams !== "number" || newGrams <= 0 || refGrams <= 0) return prev;
  const ratio = newGrams / refGrams;
  const scale1 = (n: number | "") =>
    n === "" ? "" : Math.round(n * ratio * 10) / 10;
  return {
    calories: prev.calories === "" ? "" : Math.round(Number(prev.calories) * ratio),
    protein_g: scale1(prev.protein_g),
    carbs_g: scale1(prev.carbs_g),
    fat_g: scale1(prev.fat_g),
  };
}

// Normaliza a leitura da IA de uma tabela nutricional (foto do rótulo): kcal
// INTEIRO, P/C/G a 1 casa (idem scaleMacros/rescaleMacros); serving_g ausente/
// inválida -> 100 (convenção "por 100g"); macros ausentes/inválidos -> 0; nome
// ausente -> "". Sem imports — testável em node.
export function normalizeLabelMacros(raw: {
  name?: string | null;
  serving_g?: number | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}): {
  name: string;
  serving_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
} {
  // Campo numérico: inválido (null/NaN/negativo/zero) vira 0.
  const toNum = (v: number | null | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const serving = Math.round(toNum(raw.serving_g));

  return {
    name: raw.name?.trim() ?? "",
    serving_g: serving > 0 ? serving : 100,
    calories: Math.round(toNum(raw.calories)),
    protein_g: Math.round(toNum(raw.protein_g) * 10) / 10,
    carbs_g: Math.round(toNum(raw.carbs_g) * 10) / 10,
    fat_g: Math.round(toNum(raw.fat_g) * 10) / 10,
  };
}
