import { describe, expect, it } from "vitest";
import { evaluateSmartAlerts } from "@/lib/smart-alerts";

// Estado padrão em que NENHUM gatilho bate.
const quiet = {
  hour: 12,
  consumed: { calories: 1000, protein_g: 140 },
  proteinGoal: 140,
  remainingCalories: 700,
  waterMl: 1000,
};

const keys = (input: Parameters<typeof evaluateSmartAlerts>[0]) =>
  evaluateSmartAlerts(input).map((a) => a.key);

describe("evaluateSmartAlerts — proteína", () => {
  const base = { ...quiet, hour: 16 };

  it("dispara quando consumiu < 50% da meta de proteína após as 16h", () => {
    const alerts = evaluateSmartAlerts({ ...base, consumed: { calories: 1000, protein_g: 60 } });
    expect(alerts.map((a) => a.key)).toEqual(["protein"]);
    expect(alerts[0].body).toContain("43%");
  });

  it("não dispara com exatamente 50% (60/120) da meta", () => {
    expect(
      keys({ ...base, proteinGoal: 120, consumed: { calories: 1000, protein_g: 60 } }),
    ).toEqual([]);
  });

  it("não dispara antes das 16h", () => {
    expect(keys({ ...quiet, hour: 15, consumed: { calories: 1000, protein_g: 60 } })).toEqual([]);
  });

  it("não dispara sem comida registrada (consumed.calories === 0)", () => {
    expect(keys({ ...base, consumed: { calories: 0, protein_g: 0 } })).toEqual([]);
  });

  it("não dispara sem meta de proteína (proteinGoal === 0)", () => {
    expect(
      keys({ ...base, proteinGoal: 0, consumed: { calories: 1000, protein_g: 80 } }),
    ).toEqual([]);
  });

  it("não dispara acima de 50% da meta", () => {
    expect(keys({ ...base, consumed: { calories: 1000, protein_g: 105 } })).toEqual([]);
  });
});

describe("evaluateSmartAlerts — calorias restantes", () => {
  const base = { ...quiet, hour: 19 };

  it("dispara com saldo restante <= 200 kcal antes das 20h", () => {
    expect(keys({ ...base, remainingCalories: 150 })).toEqual(["calories"]);
    expect(keys({ ...base, remainingCalories: 1 })).toEqual(["calories"]);
    expect(keys({ ...base, remainingCalories: 200 })).toEqual(["calories"]);
  });

  it("não dispara com saldo zerado ou negativo", () => {
    expect(keys({ ...base, remainingCalories: 0 })).toEqual([]);
    expect(keys({ ...base, remainingCalories: -50 })).toEqual([]);
  });

  it("não dispara com saldo acima de 200 kcal", () => {
    expect(keys({ ...base, remainingCalories: 201 })).toEqual([]);
  });

  it("não dispara às 20h ou depois", () => {
    expect(keys({ ...base, hour: 20, remainingCalories: 150 })).toEqual([]);
  });

  it("não dispara sem comida registrada", () => {
    expect(
      keys({ ...base, consumed: { calories: 0, protein_g: 0 }, remainingCalories: 150 }),
    ).toEqual([]);
  });
});

describe("evaluateSmartAlerts — água", () => {
  it("dispara à noite (>=20h) sem água registrada", () => {
    expect(keys({ ...quiet, hour: 20, waterMl: 0 })).toEqual(["water"]);
    expect(keys({ ...quiet, hour: 23, waterMl: 0, consumed: { calories: 0, protein_g: 0 } })).toEqual([
      "water",
    ]);
  });

  it("não dispara antes das 20h", () => {
    expect(keys({ ...quiet, hour: 19, waterMl: 0 })).toEqual([]);
  });

  it("não dispara com água registrada", () => {
    expect(keys({ ...quiet, hour: 20, waterMl: 500 })).toEqual([]);
  });
});

describe("evaluateSmartAlerts — combinações e ordem fixa", () => {
  it("protein + calories juntos (18h), ordem protein → calories", () => {
    const alerts = evaluateSmartAlerts({
      hour: 18,
      consumed: { calories: 1000, protein_g: 60 },
      proteinGoal: 140,
      remainingCalories: 150,
      waterMl: 500,
    });
    expect(alerts.map((a) => a.key)).toEqual(["protein", "calories"]);
  });

  it("protein + water juntos (21h), ordem protein → water", () => {
    const alerts = evaluateSmartAlerts({
      hour: 21,
      consumed: { calories: 1000, protein_g: 60 },
      proteinGoal: 140,
      remainingCalories: 150,
      waterMl: 0,
    });
    expect(alerts.map((a) => a.key)).toEqual(["protein", "water"]);
  });

  it("nenhum gatilho em horário calmo (12h)", () => {
    expect(keys(quiet)).toEqual([]);
  });
});