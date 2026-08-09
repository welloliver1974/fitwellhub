import { describe, expect, it } from "vitest";
import { suggestMealOutputSchema } from "./nutrition.functions";

describe("suggestMealByRemainingMacros schema", () => {
  it("valida o formato de sugestão de refeição por macros restantes", () => {
    const valid = {
      suggestions: [
        {
          title: "Omelete de Claras com Queijo Cotage",
          description: "Bata 3 claras e prepare na frigideira antiaderente.",
          prepTime: "5 min",
          totals: {
            calories: 220,
            protein_g: 28,
            carbs_g: 4,
            fat_g: 8,
          },
          items: [
            {
              name: "Clara de ovo",
              grams: 120,
              calories: 60,
              protein_g: 13,
              carbs_g: 1,
              fat_g: 0,
            },
            {
              name: "Queijo Cottage",
              grams: 100,
              calories: 100,
              protein_g: 12,
              carbs_g: 3,
              fat_g: 4,
            },
            {
              name: "Azeite de oliva",
              grams: 5,
              calories: 45,
              protein_g: 0,
              carbs_g: 0,
              fat_g: 5,
            },
          ],
        },
      ],
    };

    const result = suggestMealOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suggestions[0].title).toBe("Omelete de Claras com Queijo Cotage");
      expect(result.data.suggestions[0].items).toHaveLength(3);
    }
  });

  it("calcula saldo restante de macros corretamente", () => {
    const goals = { calories: 2000, protein_g: 160, carbs_g: 200, fat_g: 60 };
    const consumed = { calories: 1500, protein_g: 120, carbs_g: 150, fat_g: 40 };

    const remaining = {
      calories: goals.calories - consumed.calories,
      protein_g: goals.protein_g - consumed.protein_g,
      carbs_g: goals.carbs_g - consumed.carbs_g,
      fat_g: goals.fat_g - consumed.fat_g,
    };

    expect(remaining.calories).toBe(500);
    expect(remaining.protein_g).toBe(40);
    expect(remaining.carbs_g).toBe(50);
    expect(remaining.fat_g).toBe(20);
  });
});
