import { describe, it, expect } from "vitest";
import { parseGoogleFitAggregateResponse, estimateActiveCaloriesFromSteps } from "./google-fit-utils";

describe("google-fit-utils", () => {
  it("deve processar resposta vazia ou indefinida retornando zeros", () => {
    expect(parseGoogleFitAggregateResponse(null)).toEqual({
      steps: 0,
      activeCalories: 0,
      distanceMeters: 0,
    });
    expect(parseGoogleFitAggregateResponse({})).toEqual({
      steps: 0,
      activeCalories: 0,
      distanceMeters: 0,
    });
  });

  it("deve somar corretamente passos, calorias e distância de múltiplos datasets", () => {
    const mockResponse = {
      bucket: [
        {
          dataset: [
            {
              point: [
                {
                  dataTypeName: "com.google.step_count.delta",
                  value: [{ intVal: 4500 }],
                },
                {
                  dataTypeName: "com.google.step_count.delta",
                  value: [{ intVal: 3200 }],
                },
              ],
            },
            {
              point: [
                {
                  dataTypeName: "com.google.calories.expended",
                  value: [{ fpVal: 325.8 }],
                },
              ],
            },
            {
              point: [
                {
                  dataTypeName: "com.google.distance.delta",
                  value: [{ fpVal: 5400 }],
                },
              ],
            },
          ],
        },
      ],
    };

    const res = parseGoogleFitAggregateResponse(mockResponse);
    expect(res.steps).toBe(7700);
    expect(res.activeCalories).toBe(326);
    expect(res.distanceMeters).toBe(5400);
  });

  it("deve estimar calorias ativas por passos proporcionalmente ao peso", () => {
    expect(estimateActiveCaloriesFromSteps(0)).toBe(0);
    expect(estimateActiveCaloriesFromSteps(10000, 75)).toBe(400); // 10000 * 0.04 = 400
    expect(estimateActiveCaloriesFromSteps(10000, 90)).toBe(480);
  });
});
