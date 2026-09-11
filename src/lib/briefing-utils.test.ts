import { describe, it, expect } from "vitest";
import { getPeriodOfDay, generateDeterministicBriefing } from "./briefing-utils";

describe("briefing-utils", () => {
  it("deve classificar os períodos do dia corretamente", () => {
    // 08:00 -> manha
    const d1 = new Date("2026-09-10T08:00:00");
    expect(getPeriodOfDay(d1)).toBe("manha");

    // 14:30 -> tarde
    const d2 = new Date("2026-09-10T14:30:00");
    expect(getPeriodOfDay(d2)).toBe("tarde");

    // 21:00 -> noite
    const d3 = new Date("2026-09-10T21:00:00");
    expect(getPeriodOfDay(d3)).toBe("noite");

    // 02:00 -> noite
    const d4 = new Date("2026-09-10T02:00:00");
    expect(getPeriodOfDay(d4)).toBe("noite");
  });

  it("deve gerar briefing matinal com treino planejado", () => {
    const res = generateDeterministicBriefing({
      period: "manha",
      userName: "Well Oliver",
      workoutName: "Treino A - Peito",
    });
    expect(res.title).toContain("Bom dia, Well!");
    expect(res.message).toContain("Treino A - Peito");
    expect(res.actionLink).toBe("/app/treinos");
  });

  it("deve gerar aviso de proteína pendente à noite", () => {
    const res = generateDeterministicBriefing({
      period: "noite",
      userName: "Well",
      proteinConsumed: 80,
      proteinGoal: 150, // faltam 70g
      waterMl: 2500,
      waterGoal: 2500,
    });
    expect(res.message).toContain("proteína");
    expect(res.actionLink).toBe("/app/nutricao");
  });
});
