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
