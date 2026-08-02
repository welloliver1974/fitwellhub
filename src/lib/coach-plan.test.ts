import { describe, expect, it } from "vitest";
import {
  buildCoachPlan,
  confidenceFromStats,
  inferCoachObjective,
  nextActionFromStats,
} from "@/lib/coach-plan";

describe("inferCoachObjective", () => {
  it("infere Emagrecimento para calorias <=1900 e proteina >=120", () => {
    expect(inferCoachObjective({ calories: 1800, protein_g: 120 })).toBe("Emagrecimento");
  });

  it("infere Hipertrofia para calorias >=2300 e proteina >=150", () => {
    expect(inferCoachObjective({ calories: 2500, protein_g: 160 })).toBe("Hipertrofia");
  });

  it("infere Recomposicao corporal para calorias entre 0 e 2300 (fora dos cortes)", () => {
    expect(inferCoachObjective({ calories: 2000, protein_g: 140 })).toBe("Recomposicao corporal");
  });

  it("cai em Manutencao quando nao ha metas ou a proteina nao fecha o corte", () => {
    expect(inferCoachObjective({ calories: 2400, protein_g: 140 })).toBe("Manutencao");
    expect(inferCoachObjective(undefined)).toBe("Manutencao");
    expect(inferCoachObjective({})).toBe("Manutencao");
  });

  it("com caloria baixa mas proteina abaixo do corte, vai para Recomposicao corporal", () => {
    expect(inferCoachObjective({ calories: 1800, protein_g: 100 })).toBe("Recomposicao corporal");
  });
});

describe("buildCoachPlan", () => {
  const emagrecimentoStats = { workoutCount: 0, mealCount: 2, weightCount: 0, waterCount: 0 };
  const emagrecimentoGoals = { calories: 1800, protein_g: 120 };

  it("monta plano completo para Emagrecimento sem treinos", () => {
    const plan = buildCoachPlan(emagrecimentoStats, emagrecimentoGoals);
    expect(plan.title).toBe("Plano da proxima semana");
    expect(plan.objective).toBe("Emagrecimento");
    expect(plan.focus).toBe("Criar rotina e aderencia");
    expect(plan.trainingGoal).toContain("2 a 3 treinos");
    expect(plan.nextAction).toBe(
      "Abra a semana com 2 treinos marcados e uma meta simples de registro alimentar.",
    );
    expect(plan.checklist).toHaveLength(3);
  });

  it("muda o foco de Hipertrofia quando ja treina 3+ vezes", () => {
    const plan = buildCoachPlan(
      { workoutCount: 3, mealCount: 5, weightCount: 1, waterCount: 5 },
      { calories: 2500, protein_g: 160 },
    );
    expect(plan.objective).toBe("Hipertrofia");
    expect(plan.focus).toBe("Subir carga e preservar recuperacao");
  });

  it("respeita objetivo preferido mesmo com metas ambiguas", () => {
    const plan = buildCoachPlan(emagrecimentoStats, undefined, "Emagrecimento");
    expect(plan.objective).toBe("Emagrecimento");
    expect(plan.focus).toBe("Criar rotina e aderencia");
  });

  it("sempre devolve as chaves esperadas", () => {
    const plan = buildCoachPlan({}, undefined, "Manutencao");
    for (const key of [
      "title",
      "objective",
      "focus",
      "todaySummary",
      "trainingGoal",
      "nutritionGoal",
      "trackingGoal",
      "nextAction",
    ] as const) {
      expect(typeof plan[key]).toBe("string");
    }
    expect(Array.isArray(plan.checklist)).toBe(true);
  });
});

describe("confidenceFromStats", () => {
  it("alta para score >= 12", () => {
    expect(
      confidenceFromStats({ workoutCount: 3, mealCount: 5, weightCount: 2, waterCount: 4 }),
    ).toBe("alta");
    // fronteira exata
    expect(
      confidenceFromStats({ workoutCount: 3, mealCount: 4, weightCount: 2, waterCount: 3 }),
    ).toBe("alta");
  });

  it("media para score >= 6", () => {
    expect(
      confidenceFromStats({ workoutCount: 2, mealCount: 2, weightCount: 2, waterCount: 2 }),
    ).toBe("media");
    // fronteira exata
    expect(
      confidenceFromStats({ workoutCount: 1, mealCount: 2, weightCount: 1, waterCount: 2 }),
    ).toBe("media");
  });

  it("baixa para score < 6", () => {
    expect(
      confidenceFromStats({ workoutCount: 1, mealCount: 1, weightCount: 1, waterCount: 0 }),
    ).toBe("baixa");
  });
});

describe("nextActionFromStats", () => {
  it("prioriza treino quando nao ha treinos", () => {
    expect(nextActionFromStats({ workoutCount: 0, mealCount: 1, weightCount: 1 })).toContain(
      "treino",
    );
  });

  it("sugere refeicoes quando ha treino mas nao refeicoes", () => {
    expect(nextActionFromStats({ workoutCount: 1, mealCount: 0, weightCount: 1 })).toContain(
      "refeicoes",
    );
  });

  it("sugere peso quando falta peso", () => {
    expect(nextActionFromStats({ workoutCount: 1, mealCount: 1, weightCount: 0 })).toContain(
      "peso",
    );
  });

  it("mantem rotina quando tudo presente", () => {
    expect(nextActionFromStats({ workoutCount: 1, mealCount: 1, weightCount: 1 })).toBe(
      "Mantenha a rotina atual e revise os dados na proxima atualizacao.",
    );
  });
});
