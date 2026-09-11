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

      for (const point of dataset.point) {
        const typeName = point.dataTypeName;
        const values = point.value;
        if (!Array.isArray(values) || values.length === 0) continue;

        if (typeName === "com.google.step_count.delta") {
          // Passos vêm como intVal
          const val = values[0].intVal ?? values[0].fpVal ?? 0;
          steps += Number(val);
        } else if (typeName === "com.google.calories.expended") {
          // Calorias vêm como fpVal
          const val = values[0].fpVal ?? values[0].intVal ?? 0;
          activeCalories += Number(val);
        } else if (typeName === "com.google.distance.delta") {
          // Distância em metros
          const val = values[0].fpVal ?? values[0].intVal ?? 0;
          distanceMeters += Number(val);
        }
      }
    }
  }

  return {
    steps: Math.round(steps),
    activeCalories: Math.round(activeCalories),
    distanceMeters: Math.round(distanceMeters),
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
