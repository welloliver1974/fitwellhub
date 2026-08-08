import { describe, expect, it } from "vitest";
import { isDefaultGoals, matchesSuggestion, suggestGoals } from "@/lib/nutrition-goals";

describe("isDefaultGoals", () => {
  it("reconhece a meta padrão gravada pelo signup", () => {
    expect(isDefaultGoals({ calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 65 })).toBe(true);
  });

  it("rejeita metas customizadas", () => {
    expect(isDefaultGoals({ calories: 1800, protein_g: 160, carbs_g: 150, fat_g: 70 })).toBe(false);
  });

  it("rejeita null/undefined", () => {
    expect(isDefaultGoals(null)).toBe(false);
    expect(isDefaultGoals(undefined)).toBe(false);
  });
});

describe("suggestGoals", () => {
  it("calorias = TDEE; proteína = 2g/kg; macros batem com a soma calórica", () => {
    // tdee 2400, peso 80 → P 160g (4kcal/g), G 67g (9kcal/g), C 289g (4kcal/g)
    const s = suggestGoals(2400, 80);
    expect(s.calories).toBe(2400);
    expect(s.protein_g).toBe(160);
    expect(s.fat_g).toBe(67);
    expect(s.carbs_g).toBe(289);
    const sum = s.protein_g * 4 + s.fat_g * 9 + s.carbs_g * 4;
    expect(Math.abs(sum - s.calories)).toBeLessThanOrEqual(4); // arredondamento
  });

  it("carbo nunca fica negativo", () => {
    const s = suggestGoals(1000, 150); // proteína alta demais p/ o TDEE
    expect(s.carbs_g).toBeGreaterThanOrEqual(0);
  });

  it("segundo exemplo consistente (tdee 2000, peso 70)", () => {
    const s = suggestGoals(2000, 70);
    expect(s.protein_g).toBe(140);
    expect(s.fat_g).toBe(56);
    expect(s.carbs_g).toBe(234);
    const sum = s.protein_g * 4 + s.fat_g * 9 + s.carbs_g * 4;
    expect(Math.abs(sum - s.calories)).toBeLessThanOrEqual(4);
  });
});

describe("matchesSuggestion", () => {
  it("true quando a meta atual bate com a sugestão", () => {
    const s = suggestGoals(2400, 80);
    expect(matchesSuggestion(s, 2400, 80)).toBe(true);
  });

  it("false quando a meta difere da sugestão (customizada)", () => {
    expect(matchesSuggestion({ calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 65 }, 2400, 80)).toBe(false);
  });
});
