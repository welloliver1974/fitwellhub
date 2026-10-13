import { describe, expect, it } from "vitest";
import { labelSchema, sanitizeRawLabelData } from "./nutrition.functions";

describe("labelSchema (leitura da tabela nutricional pela foto)", () => {
  const validRead = {
    name: "Biscoito Integral",
    serving_g: 30,
    calories: 145.6,
    protein_g: 4.3,
    carbs_g: 20.1,
    fat_g: 5,
  };

  it("aceita uma leitura valida com todos os campos", () => {
    const result = labelSchema.safeParse(validRead);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.serving_g).toBe(30);
      expect(result.data.calories).toBe(145.6);
      expect(result.data.name).toBe("Biscoito Integral");
    }
  });

  it("aceita name null (produto sem nome visivel na embalagem)", () => {
    const result = labelSchema.safeParse({ ...validRead, name: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBeNull();
  });

  it("aceita a convencao por 100g (sem nome, serving_g=100)", () => {
    const result = labelSchema.safeParse({
      name: null,
      serving_g: 100,
      calories: 350,
      protein_g: 10,
      carbs_g: 70,
      fat_g: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita leitura sem serving_g", () => {
    const { serving_g: _ignored, ...semServing } = validRead;
    expect(labelSchema.safeParse(semServing).success).toBe(false);
  });

  it("rejeita leitura sem calories (macros numericos obrigatorios)", () => {
    const { calories: _ignored, ...semCal } = validRead;
    expect(labelSchema.safeParse(semCal).success).toBe(false);
  });

  it("rejeita serving_g nao numerica", () => {
    expect(labelSchema.safeParse({ ...validRead, serving_g: "30g" }).success).toBe(false);
  });
});

describe("sanitizeRawLabelData", () => {
  it("limpa strings com unidades e vírgulas decimais", () => {
    const raw = {
      name: "   Iogurte Grego  ",
      serving_g: "100g",
      calories: "120,5 kcal",
      protein_g: "6,8 g",
      carbs_g: "12g",
      fat_g: "3,5",
    };
    const sanitized = sanitizeRawLabelData(raw);
    expect(sanitized.name).toBe("Iogurte Grego");
    expect(sanitized.serving_g).toBe(100);
    expect(sanitized.calories).toBe(120.5);
    expect(sanitized.protein_g).toBe(6.8);
    expect(sanitized.carbs_g).toBe(12);
    expect(sanitized.fat_g).toBe(3.5);

    expect(labelSchema.safeParse(sanitized).success).toBe(true);
  });

  it("trata nulls e valores vazios com fallbacks seguros", () => {
    const raw = {
      name: null,
      serving_g: null,
      calories: null,
      protein_g: undefined,
      carbs_g: "",
      fat_g: null,
    };
    const sanitized = sanitizeRawLabelData(raw);
    expect(sanitized.name).toBeNull();
    expect(sanitized.serving_g).toBe(100);
    expect(sanitized.calories).toBe(0);
    expect(sanitized.protein_g).toBe(0);
    expect(sanitized.carbs_g).toBe(0);
    expect(sanitized.fat_g).toBe(0);

    expect(labelSchema.safeParse(sanitized).success).toBe(true);
  });
});