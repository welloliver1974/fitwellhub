/** Valor padrão de descanso quando ninguém configurou o exercício. */
export const DEFAULT_REST_SECONDS = 90;

/** Opções exibidas no seletor de descanso por exercício. */
export const REST_OPTIONS = [45, 60, 75, 90, 120, 150, 180] as const;

/** Presets do cardio (modo foco) em segundos. */
export const CARDIO_REST_OPTIONS = [900, 1200, 1800, 2400] as const;

/**
 * Resolve o descanso efetivo de um exercício.
 *
 * Regra:
 * - `0` é valor válido e significa "sem cronômetro" (cardio).
 * - `null`/`undefined`/inválido => exercício sem configuração, então usamos o
 *   preset escolhido pelo usuário na tela (comportamento antigo do app).
 * - Qualquer valor entre 0 e 900 é respeitado.
 */
export function resolveRestSeconds(
  restSeconds?: number | null,
  fallbackSeconds: number = DEFAULT_REST_SECONDS,
): number {
  const value = restSeconds === null || restSeconds === undefined ? NaN : Number(restSeconds);
  if (Number.isFinite(value) && value >= 0 && value <= 900) return value;
  return fallbackSeconds;
}
