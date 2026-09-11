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
  let steps = 0;
  let activeCalories = 0;
  let distanceMeters = 0;

  if (!response || !Array.isArray(response.bucket)) {
    return { steps, activeCalories, distanceMeters };
  }

  for (const bucket of response.bucket) {
    if (!Array.isArray(bucket.dataset)) continue;

    for (const dataset of bucket.dataset) {
      if (!Array.isArray(dataset.point)) continue;

      const datasetType = (dataset.dataSourceId || dataset.dataTypeName || "").toLowerCase();

      for (const point of dataset.point) {
        const pointType = (point.dataTypeName || "").toLowerCase();
        const typeName = pointType || datasetType;
        const values = point.value;
        if (!Array.isArray(values) || values.length === 0) continue;

        if (typeName.includes("step")) {
          // Passos vêm como intVal ou fpVal
          const val = values[0].intVal ?? values[0].fpVal ?? 0;
          steps += Number(val);
        } else if (typeName.includes("calories")) {
          // Calorias vêm como fpVal ou intVal
          const val = values[0].fpVal ?? values[0].intVal ?? 0;
          activeCalories += Number(val);
        } else if (typeName.includes("distance")) {
          // Distância em metros
          const val = values[0].fpVal ?? values[0].intVal ?? 0;
          distanceMeters += Number(val);
        }
      }
    }
  }

  const roundedSteps = Math.round(steps);
  const roundedCalories =
    Math.round(activeCalories) || (roundedSteps > 0 ? estimateActiveCaloriesFromSteps(roundedSteps) : 0);
  const roundedDistance =
    Math.round(distanceMeters) || (roundedSteps > 0 ? Math.round(roundedSteps * 0.75) : 0);

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
