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

  it("deve priorizar stream oficial estimated_steps quando múltiplos streams de passos existirem", () => {
    const mockResponse = {
      bucket: [
        {
          dataset: [
            {
              dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
              point: [{ value: [{ intVal: 6200 }] }],
            },
            {
              dataSourceId: "raw:com.google.step_count.delta:com.google.android.gms:samsung_raw",
              point: [{ value: [{ intVal: 1500 }] }],
            },
          ],
        },
      ],
    };

    const res = parseGoogleFitAggregateResponse(mockResponse);
    expect(res.steps).toBe(6200); // Priorizou estimated_steps sem somar 1500 indevidamente
  });

  it("deve processar resposta direta unbucketed (response.dataset)", () => {
    const mockResponse = {
      dataset: [
        {
          dataTypeName: "com.google.step_count.delta",
          point: [{ value: [{ intVal: 4800 }] }],
        },
      ],
    };

    const res = parseGoogleFitAggregateResponse(mockResponse);
    expect(res.steps).toBe(4800);
  });

  it("deve filtrar BMR e retornar gasto ativo real quando o Google Fit retornar calorias totais diárias", () => {
    // Caso real do usuário: 788 passos e 1877 kcal retornadas pelo Google Fit com.google.calories.expended
    const mockResponse = {
      bucket: [
        {
          dataset: [
            {
              point: [
                {
                  dataTypeName: "com.google.step_count.delta",
                  value: [{ intVal: 788 }],
                },
              ],
            },
            {
              point: [
                {
                  dataTypeName: "com.google.calories.expended",
                  value: [{ fpVal: 1877.4 }],
                },
              ],
            },
          ],
        },
      ],
    };

    const res = parseGoogleFitAggregateResponse(mockResponse);
    expect(res.steps).toBe(788);
    // 788 passos não queimam 1877 kcal! A estimativa ativa deve ser realista (~32 kcal)
    expect(res.activeCalories).toBeLessThan(100);
    expect(res.activeCalories).toBe(32);
  });
});

