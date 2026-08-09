import { describe, expect, it } from "vitest";
import { labelSchema } from "./nutrition.functions";

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