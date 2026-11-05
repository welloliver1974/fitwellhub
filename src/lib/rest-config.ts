/** Valor padrão quando o exercício não tem descanso configurado. */
export const DEFAULT_REST_SECONDS = 90;

/** Opções exibidas no seletor de descanso por exercício. */
export const REST_OPTIONS = [45, 60, 75, 90, 120, 150, 180] as const;

/** Presets do cardio (modo foco) em segundos. */
export const CARDIO_REST_OPTIONS = [900, 1200, 1800, 2400] as const;

/**
 * Resolve o descanso efetivo de um exercício.
 * Cardio não usa timer de musculação; qualquer valor inválido cai no padrão.
 */
export function resolveRestSeconds(
  restSeconds?: number | null,
  isCardio = false,
): number {
  if (isCardio) return 0;
  const value = Number(restSeconds);
  if (Number.isFinite(value) && value >= 0 && value <= 900) return value;
  return DEFAULT_REST_SECONDS;
}
