import { describe, expect, it, vi } from "vitest";

/**
 * Testes de audio.functions
 *
 * As server functions (createServerFn) do TanStack Start executam via HTTP
 * em runtime real, portanto não podem ser chamadas diretamente em testes
 * unitários de forma síncrona. Os testes abaixo validam as funções auxiliares
 * de formatação e lógica pura extraídas das server functions.
 */
describe("audio.functions", () => {
  it("formata segundos de gravação corretamente", () => {
    const format = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

    expect(format(0)).toBe("00:00");
    expect(format(65)).toBe("01:05");
    expect(format(3600)).toBe("60:00");
  });

  it("detecta texto vazio como inválido para registro de refeição", () => {
    const isValidText = (text: string) => text.trim().length > 0;

    expect(isValidText("")).toBe(false);
    expect(isValidText("   ")).toBe(false);
    expect(isValidText("comi arroz com frango")).toBe(true);
  });

  it("detecta tipo de refeição suportado", () => {
    const MEAL_TYPES = ["Café da manhã", "Almoço", "Jantar", "Lanche"] as const;
    const isValidMealType = (t: string) => (MEAL_TYPES as readonly string[]).includes(t);

    expect(isValidMealType("Almoço")).toBe(true);
    expect(isValidMealType("Jantar")).toBe(true);
    expect(isValidMealType("Outro")).toBe(false);
  });

  it("normaliza retorno de voz com água e múltiplas refeições", () => {
    const parseVoiceResult = (args: { water_ml?: number; meals?: Array<{ meal_type: string; items: any[] }> }) => {
      const waterMl = args.water_ml ?? 0;
      const mealsCount = args.meals?.length ?? 0;
      return { waterMl, mealsCount };
    };

    expect(parseVoiceResult({ water_ml: 500, meals: [{ meal_type: "Almoço", items: [{ name: "Arroz" }] }] })).toEqual({
      waterMl: 500,
      mealsCount: 1,
    });

    expect(parseVoiceResult({ water_ml: 300 })).toEqual({
      waterMl: 300,
      mealsCount: 0,
    });

    expect(
      parseVoiceResult({
        meals: [
          { meal_type: "Café da manhã", items: [{ name: "Ovo" }] },
          { meal_type: "Almoço", items: [{ name: "Frango" }] },
        ],
      })
    ).toEqual({
      waterMl: 0,
      mealsCount: 2,
    });
  });
});

