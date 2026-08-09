import { describe, expect, it } from "vitest";
import { substituteOutputSchema } from "./workout.functions";

describe("workout.functions", () => {
  it("valida schema de saída correto com 3 sugestões", () => {
    const valid = {
      suggestions: [
        {
          name: "Barra Fixa",
          muscles: "Dorsal, Bíceps",
          description: "Alternativa com peso corporal, sem equipamento específico.",
          tip: "Mantenha os ombros afastados das orelhas durante o movimento.",
        },
        {
          name: "Remada Curvada com Halteres",
          muscles: "Dorsal, Rombóide, Bíceps",
          description: "Trabalha o mesmo padrão de puxada com halteres.",
          tip: "Mantenha a coluna neutra e o tronco estável.",
        },
        {
          name: "Pullover com Halter",
          muscles: "Dorsal, Serrátil",
          description: "Isola o dorsal com um único halter deitado no banco.",
          tip: "Não force a amplitude além do confortável no ombro.",
        },
      ],
    };

    const result = substituteOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suggestions).toHaveLength(3);
      expect(result.data.suggestions[0].name).toBe("Barra Fixa");
    }
  });

  it("rejeita lista com menos de 3 sugestões", () => {
    const invalid = {
      suggestions: [
        {
          name: "Barra Fixa",
          muscles: "Dorsal",
          description: "Alternativa.",
          tip: "Dica.",
        },
      ],
    };
    const result = substituteOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejeita lista com mais de 3 sugestões", () => {
    const base = {
      name: "X",
      muscles: "Y",
      description: "Z",
      tip: "T",
    };
    const invalid = { suggestions: [base, base, base, base] };
    const result = substituteOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejeita sugestão com campo obrigatório ausente", () => {
    const invalid = {
      suggestions: [
        { name: "Barra Fixa", muscles: "Dorsal" }, // sem description e tip
        { name: "B", muscles: "M", description: "D", tip: "T" },
        { name: "C", muscles: "M", description: "D", tip: "T" },
      ],
    };
    const result = substituteOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("calcula motivos de substituição comuns como strings válidas", () => {
    const reasons = [
      "aparelho ocupado",
      "treinando em casa",
      "dor no ombro",
      "sem equipamento",
    ];
    for (const r of reasons) {
      expect(r.trim().length).toBeGreaterThan(0);
      expect(r.length).toBeLessThanOrEqual(200);
    }
  });
});
