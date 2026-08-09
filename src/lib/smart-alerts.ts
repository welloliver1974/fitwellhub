// Alertas inteligentes dos lembretes (item 7.4 do roadmap): disparos
// CONDICIONAIS aos dados do dia, ao contrário dos lembretes fixos (horário
// manual). As condições espelham o card "Dica do Coach" da Nutrição
// (src/routes/app.nutricao.tsx, item 5) + um gatilho novo de hidratação.
// Funções puras — sem imports de app, testáveis em node.

export type SmartAlertKey = "protein" | "calories" | "water";

export type SmartAlert = {
  key: SmartAlertKey;
  title: string;
  body: string;
};

export type SmartAlertInput = {
  /** Hora local civil (0–23) usada para as janelas de disparo. */
  hour: number;
  consumed: { calories: number; protein_g: number };
  /** goals.protein_g (0 = sem meta → gatilho de proteína silencioso). */
  proteinGoal: number;
  /** goals.calories - consumed.calories. */
  remainingCalories: number;
  /** Soma de hoje de water_logs.ml. */
  waterMl: number;
};

// Avalia os gatilhos na ordem fixa protein → calories → water e retorna só os
// que bateram. Dedupe (1 por gatilho/dia) é responsabilidade do chamador.
export function evaluateSmartAlerts(input: SmartAlertInput): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const { hour, consumed, proteinGoal, remainingCalories, waterMl } = input;

  // Gatilho 1 — fim da tarde (>=16h) e proteína < 50% da meta (e comeu algo).
  if (
    hour >= 16 &&
    proteinGoal > 0 &&
    consumed.calories > 0 &&
    consumed.protein_g / proteinGoal < 0.5
  ) {
    const pct = Math.round((consumed.protein_g / proteinGoal) * 100);
    alerts.push({
      key: "protein",
      title: "💡 Dica do Coach",
      body: `Você consumiu apenas ${pct}% da meta de proteína hoje. Inclua uma fonte magra no lanche da tarde ou no jantar.`,
    });
  }

  // Gatilho 2 — antes do jantar (<20h) e saldo calórico restante baixo (<=200 kcal).
  if (
    hour < 20 &&
    consumed.calories > 0 &&
    remainingCalories > 0 &&
    remainingCalories <= 200
  ) {
    alerts.push({
      key: "calories",
      title: "💡 Dica do Coach",
      body: `Seu saldo restante está em ${Math.round(remainingCalories)} kcal. Prefira uma refeição leve rica em fibras e proteína no jantar.`,
    });
  }

  // Gatilho 3 — de noite (>=20h) e nenhuma água registrada no dia.
  if (hour >= 20 && waterMl === 0) {
    alerts.push({
      key: "water",
      title: "💧 Hidratação",
      body: "Você ainda não registrou água hoje. Beba um copo de água agora.",
    });
  }

  return alerts;
}