import { describe, expect, it } from "vitest";
import { normalizeLabelMacros, parseFoodWeight, rescaleMacros, scaleMacros } from "@/lib/food-utils";

describe("parseFoodWeight", () => {
  it("parseia gramas e unidades", () => {
    expect(parseFoodWeight("30 g")).toBe(30);
    expect(parseFoodWeight("100 gramas")).toBe(100);
    expect(parseFoodWeight("150g")).toBe(150);
  });

  it("converte kg para gramas", () => {
    expect(parseFoodWeight("1.5 kg")).toBe(1500);
    expect(parseFoodWeight("0,5 kg")).toBe(500); // virgula como separador decimal
  });

  it("aceita numero puro com default g", () => {
    expect(parseFoodWeight("20")).toBe(20);
    expect(parseFoodWeight("250ml")).toBe(250); // unidade desconhecida vira default g
  });

  it("aceita numero e rejeita invalidos", () => {
    expect(parseFoodWeight(50)).toBe(50);
    expect(parseFoodWeight(0)).toBeNull();
    expect(parseFoodWeight("abc")).toBeNull();
    expect(parseFoodWeight("")).toBeNull();
    expect(parseFoodWeight(null)).toBeNull();
  });
});

describe("scaleMacros", () => {
  it("usa macros da porcao declarada (serving) direto", () => {
    const macros = scaleMacros(
      {
        "energy-kcal_serving": 150,
        "proteins_serving": 5,
        "carbohydrates_serving": 30,
        "fat_serving": 2,
      },
      100,
    );
    expect(macros).toEqual({ calories: 150, protein_g: 5, carbs_g: 30, fat_g: 2 });
  });

  it("escala macros por 100g pela porcao informada", () => {
    const macros = scaleMacros(
      {
        "energy-kcal_100g": 350,
        "proteins_100g": 10,
        "carbohydrates_100g": 70,
        "fat_100g": 2,
      },
      150,
    );
    expect(macros).toEqual({ calories: 525, protein_g: 15, carbs_g: 105, fat_g: 3 });
  });

  it("serving tem precedencia sobre 100g", () => {
    const macros = scaleMacros(
      { "energy-kcal_serving": 150, "energy-kcal_100g": 350 },
      200,
    );
    expect(macros.calories).toBe(150);
  });

  it("aceita o alias energy-kcal sem sufixo", () => {
    const macros = scaleMacros({ "energy-kcal": 250 }, 100);
    expect(macros.calories).toBe(250);
  });

  it("arredonda macros para 1 casa decimal", () => {
    const macros = scaleMacros({ "proteins_100g": 3, "energy-kcal_100g": 0 }, 150);
    expect(macros.protein_g).toBe(4.5);
  });
});

describe("rescaleMacros", () => {
  const prev = { calories: 200, protein_g: 10, carbs_g: 30, fat_g: 2 };

  it("dobra os macros com ratio 2x (ref 100 -> 200)", () => {
    const r = rescaleMacros(prev, 100, 200);
    expect(r).toEqual({ calories: 400, protein_g: 20, carbs_g: 60, fat_g: 4 });
  });

  it("cai pela metade com ratio 0.5x (ref 200 -> 100)", () => {
    const r = rescaleMacros({ ...prev, protein_g: 15 }, 200, 100);
    expect(r).toEqual({ calories: 100, protein_g: 7.5, carbs_g: 15, fat_g: 1 });
  });

  it("kcal arredonda para inteiro, P/C/G para 1 casa (ratio 1.5x)", () => {
    const r = rescaleMacros({ calories: 150, protein_g: 7, carbs_g: 21, fat_g: 3 }, 100, 150);
    expect(r).toEqual({ calories: 225, protein_g: 10.5, carbs_g: 31.5, fat_g: 4.5 });
  });

  it("campos vazios permanecem vazios", () => {
    const r = rescaleMacros({ calories: "", protein_g: "", carbs_g: 30, fat_g: "" }, 100, 200);
    expect(r).toEqual({ calories: "", protein_g: "", carbs_g: 60, fat_g: "" });
  });

  it("devolve prev inalterado quando newGrams ou refGrams <= 0", () => {
    expect(rescaleMacros(prev, 100, 0)).toEqual(prev);
    expect(rescaleMacros(prev, 0, 100)).toEqual(prev);
  });
});

describe("normalizeLabelMacros", () => {
  it("arredonda kcal para inteiro e P/C/G para 1 casa", () => {
    const r = normalizeLabelMacros({
      name: "Biscoito",
      serving_g: 30,
      calories: 145.6,
      protein_g: 4.34,
      carbs_g: 20.05,
      fat_g: 5,
    });
    expect(r.calories).toBe(146);
    expect(r.protein_g).toBe(4.3);
    expect(r.carbs_g).toBe(20.1); // Math.round(20.05*10)/10
    expect(r.fat_g).toBe(5);
  });

  it("serving_g ausente ou inválida cai para 100 (convenção por 100g)", () => {
    expect(normalizeLabelMacros({ serving_g: null as any, calories: 10 }).serving_g).toBe(100);
    expect(normalizeLabelMacros({ serving_g: 0, calories: 10 }).serving_g).toBe(100);
    expect(normalizeLabelMacros({ serving_g: -30, calories: 10 }).serving_g).toBe(100);
  });

  it("mantém serving_g declarada", () => {
    expect(normalizeLabelMacros({ serving_g: 30, calories: 10 }).serving_g).toBe(30);
    expect(normalizeLabelMacros({ serving_g: 30.4, calories: 10 }).serving_g).toBe(30);
  });

  it("campos ausentes/inválidos viram 0", () => {
    const r = normalizeLabelMacros({ serving_g: 30, protein_g: null as any });
    expect(r.protein_g).toBe(0);
    expect(r.carbs_g).toBe(0);
    expect(r.fat_g).toBe(0);
    expect(r.calories).toBe(0);
  });

  it("name ausente vira vazio e trim aparou espaços", () => {
    expect(normalizeLabelMacros({ serving_g: 30, calories: 1 }).name).toBe("");
    expect(normalizeLabelMacros({ name: "  X  ", serving_g: 30, calories: 1 }).name).toBe("X");
  });
});
