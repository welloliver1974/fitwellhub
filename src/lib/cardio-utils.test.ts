import { describe, it, expect } from "vitest";
import {
  isCardioExercise,
  parseCardioMeta,
  serializeCardioMeta,
  calculateCardioCalories,
  formatCardioSummary,
} from "./cardio-utils";

describe("cardio-utils", () => {
  it("detects cardio by exercise name correctly", () => {
    expect(isCardioExercise("Esteira")).toBe(true);
    expect(isCardioExercise("Caminhada pós-treino")).toBe(true);
    expect(isCardioExercise("Corrida na esteira")).toBe(true);
    expect(isCardioExercise("Bicicleta ergométrica")).toBe(true);
    expect(isCardioExercise("Elíptico")).toBe(true);
    expect(isCardioExercise("Escada")).toBe(true);
    expect(isCardioExercise("Supino reto")).toBe(false);
    expect(isCardioExercise("Agachamento livre")).toBe(false);
    expect(isCardioExercise("Puxada alta")).toBe(false);
  });

  it("respects explicit isCardio flag in notes", () => {
    const customCardio = serializeCardioMeta({ isCardio: true });
    expect(isCardioExercise("Meu Exercício Maluco", customCardio)).toBe(true);

    const forcedWeight = serializeCardioMeta({ isCardio: false });
    expect(isCardioExercise("Esteira com peso", forcedWeight)).toBe(false);
  });

  it("calculates realistic calories for walking on treadmill with incline (ACSM)", () => {
    // 20 min @ 4 km/h with 8% incline for an 80kg person:
    // Speed m/min = 4 * 16.6667 = 66.67
    // VO2 = 0.1 * 66.67 + 1.8 * 66.67 * 0.08 + 3.5 = 6.67 + 9.60 + 3.5 = 19.77
    // kcal/min = (19.77 * 80) / 200 = 7.91 kcal/min
    // total 20 min = ~158 kcal
    const kcal = calculateCardioCalories({
      durationMin: 20,
      speedKmh: 4.0,
      inclinePct: 8,
      weightKg: 80,
    });
    expect(kcal).toBeGreaterThanOrEqual(140);
    expect(kcal).toBeLessThanOrEqual(175);
  });

  it("formats cardio summary cleanly", () => {
    const summary = formatCardioSummary({
      name: "Esteira",
      durationMin: 20,
      speedKmh: 4.0,
      inclinePct: 8,
      weightKg: 80,
    });
    expect(summary).toContain("Esteira");
    expect(summary).toContain("20 min");
    expect(summary).toContain("4 km/h");
    expect(summary).toContain("8% inclinação");
    expect(summary).toContain("kcal");
  });

  it("parses and serializes metadata safely", () => {
    const meta = {
      isCardio: true,
      durationMin: 25,
      speedKmh: 5.5,
      inclinePct: 4,
      notes: "Caminhada moderada",
    };
    const serialized = serializeCardioMeta(meta);
    const parsed = parseCardioMeta(serialized, "Exercício");
    expect(parsed.isCardio).toBe(true);
    expect(parsed.durationMin).toBe(25);
    expect(parsed.speedKmh).toBe(5.5);
    expect(parsed.inclinePct).toBe(4);
    expect(parsed.notes).toBe("Caminhada moderada");
  });
});
