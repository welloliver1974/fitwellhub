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

  it("deve gerar saudação elegante sem o termo guerreiro quando não houver nome", () => {
    const resTarde = generateDeterministicBriefing({
      period: "tarde",
    });
    expect(resTarde.title).toBe("Boa tarde! ⚡");
    expect(resTarde.title.toLowerCase()).not.toContain("guerreiro");

    const resManha = generateDeterministicBriefing({
      period: "manha",
    });
    expect(resManha.title).toBe("Bom dia! ☀️");
    expect(resManha.title.toLowerCase()).not.toContain("guerreiro");

    const resNoite = generateDeterministicBriefing({
      period: "noite",
      waterMl: 1000,
      waterGoal: 2500,
    });
    expect(resNoite.title).toBe("Boa noite! 🌙");
    expect(resNoite.title.toLowerCase()).not.toContain("guerreiro");
  });

  it("deve saudar pelo primeiro nome com a primeira letra maiúscula no período da tarde", () => {
    const res = generateDeterministicBriefing({
      period: "tarde",
      userName: "carlos silva",
    });
    expect(res.title).toBe("Boa tarde, Carlos! ⚡");
  });
});
