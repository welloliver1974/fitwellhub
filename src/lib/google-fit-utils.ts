export interface GoogleFitDailyMetrics {
  steps: number;
  activeCalories: number;
  distanceMeters: number;
}

/**
 * Faz o parse da resposta da API de agregação do Google Fitness:
 * POST https://fitness.googleapis.com/fitness/v1/users/me/dataset:aggregate
 */
export function parseGoogleFitAggregateResponse(response: any): GoogleFitDailyMetrics {
  let totalCalories = 0;
  let totalDistance = 0;
  const stepsByStream: Record<string, number> = {};

  if (!response) {
    return { steps: 0, activeCalories: 0, distanceMeters: 0 };
  }

  // Normaliza buckets ou dataset direto na raiz
  const buckets = Array.isArray(response.bucket)
    ? response.bucket
    : Array.isArray(response.dataset)
      ? [{ dataset: response.dataset }]
      : [];

  for (const bucket of buckets) {
    if (!bucket || !Array.isArray(bucket.dataset)) continue;

    for (const dataset of bucket.dataset) {
      if (!Array.isArray(dataset.point)) continue;

      const streamId = (dataset.dataSourceId || dataset.dataTypeName || "unknown").toLowerCase();
      const isStepStream = streamId.includes("step");
      const isCalorieStream = streamId.includes("calories");
      const isDistanceStream = streamId.includes("distance");

      for (const point of dataset.point) {
        const pointType = (point.dataTypeName || "").toLowerCase();
        const isPointStep = pointType ? pointType.includes("step") : isStepStream;
        const isPointCal = pointType ? pointType.includes("calories") : isCalorieStream;
        const isPointDist = pointType ? pointType.includes("distance") : isDistanceStream;

        const values = point.value;
        if (!Array.isArray(values) || values.length === 0) continue;

        if (isPointStep) {
          const val = values[0].intVal ?? values[0].fpVal ?? 0;
          stepsByStream[streamId] = (stepsByStream[streamId] || 0) + Number(val);
        } else if (isPointCal) {
          const val = values[0].fpVal ?? values[0].intVal ?? 0;
          totalCalories += Number(val);
        } else if (isPointDist) {
          const val = values[0].fpVal ?? values[0].intVal ?? 0;
          totalDistance += Number(val);
        }
      }
    }
  }

  // Para passos: se houver stream oficial de "estimated_steps", ele tem prioridade absoluta
  let selectedSteps = 0;
  let foundEstimated = false;

  for (const [streamId, count] of Object.entries(stepsByStream)) {
    if (streamId.includes("estimated_steps") && count > 0) {
      selectedSteps = count;
      foundEstimated = true;
      break;
    }
  }

  if (!foundEstimated) {
    // Se não encontrou estimated_steps com passos, seleciona o maior valor entre os streams de passos
    for (const count of Object.values(stepsByStream)) {
      if (count > selectedSteps) selectedSteps = count;
    }
  }

  const roundedSteps = Math.round(selectedSteps);
  
  // Detecção de BMR (Taxa Metabólica Basal) no Google Fit:
  // Se totalCalories for excessivamente alta para os passos dados (ex: > 300 kcal para menos de 3000 passos ou > 0.15 kcal/passo),
  // significa que a API com.google.calories.expended incluiu a TMB acumulada do dia.
  // Nesse caso, usamos a estimativa fisiológica real de calorias ativas da movimentação/passos.
  let resolvedActiveCalories = 0;
  if (totalCalories > 0) {
    const isLikelyIncludingBmr =
      (roundedSteps > 0 && totalCalories > 300 && totalCalories > roundedSteps * 0.15) ||
      (roundedSteps === 0 && totalCalories > 150);

    if (isLikelyIncludingBmr) {
      resolvedActiveCalories = estimateActiveCaloriesFromSteps(roundedSteps);
    } else {
      resolvedActiveCalories = Math.round(totalCalories);
    }
  } else if (roundedSteps > 0) {
    resolvedActiveCalories = estimateActiveCaloriesFromSteps(roundedSteps);
  }

  const roundedCalories = resolvedActiveCalories;
  const roundedDistance =
    Math.round(totalDistance) || (roundedSteps > 0 ? Math.round(roundedSteps * 0.75) : 0);

  return {
    steps: roundedSteps,
    activeCalories: roundedCalories,
    distanceMeters: roundedDistance,
  };
}

/**
 * Estimativa aproximada de calorias gastas em caminhada caso a API retorne apenas passos:
 * Média de ~0.04 kcal por passo para um adulto médio de 70-80kg.
 */
export function estimateActiveCaloriesFromSteps(steps: number, weightKg = 75): number {
  if (steps <= 0) return 0;
  const factor = (weightKg / 75) * 0.04;
  return Math.round(steps * factor);
}
