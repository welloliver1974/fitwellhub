/**
 * cardio-utils.ts
 * Utilitários para detecção, armazenamento e cálculo fisiológico de exercícios cardiovasculares / aeróbicos.
 */

export interface CardioMeta {
  isCardio: boolean;
  inclinePct?: number;
  speedKmh?: number;
  durationMin?: number;
  distanceKm?: number;
  notes?: string;
}

const CARDIO_KEYWORDS = [
  "esteira",
  "cardio",
  "aeróbico",
  "aerobico",
  "caminhada",
  "corrida",
  "bike",
  "bicicleta",
  "spinning",
  "elíptico",
  "eliptico",
  "escada",
  "remo seco",
  "remador",
  "corda naval",
  "pular corda",
  "treadmill",
  "hiit",
  "transport",
];

/**
 * Verifica se um exercício é do tipo Cardio/Aeróbico com base nas notas (explícito) ou no nome.
 */
export function isCardioExercise(name?: string | null, rawNotes?: string | null): boolean {
  if (rawNotes) {
    try {
      const parsed = JSON.parse(rawNotes);
      if (typeof parsed?.isCardio === "boolean") {
        return parsed.isCardio;
      }
    } catch {
      if (rawNotes.toLowerCase().includes("[cardio]") || rawNotes.toLowerCase().includes("tipo: cardio")) {
        return true;
      }
    }
  }

  if (!name) return false;
  const normalized = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return CARDIO_KEYWORDS.some((kw) => {
    const kwNorm = kw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return normalized.includes(kwNorm);
  });
}

/**
 * Lê os metadados de cardio armazenados nas notas do exercício (ou valores default se não houver).
 */
export function parseCardioMeta(rawNotes?: string | null, name?: string | null): CardioMeta {
  const isCardio = isCardioExercise(name, rawNotes);
  if (!rawNotes) {
    return { isCardio };
  }

  try {
    const parsed = JSON.parse(rawNotes);
    if (typeof parsed === "object" && parsed !== null) {
      return {
        isCardio: typeof parsed.isCardio === "boolean" ? parsed.isCardio : isCardio,
        inclinePct: typeof parsed.inclinePct === "number" ? parsed.inclinePct : undefined,
        speedKmh: typeof parsed.speedKmh === "number" ? parsed.speedKmh : undefined,
        durationMin: typeof parsed.durationMin === "number" ? parsed.durationMin : undefined,
        distanceKm: typeof parsed.distanceKm === "number" ? parsed.distanceKm : undefined,
        notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
      };
    }
  } catch {
    // Se não for JSON, é texto livre nas notas
    const inclineMatch = rawNotes.match(/inclin[aã]?[cç][aã]o[:\s]*(\d+(\.\d+)?)/i);
    const speedMatch = rawNotes.match(/vel(ocidade)?[:\s]*(\d+(\.\d+)?)/i);
    return {
      isCardio,
      inclinePct: inclineMatch ? parseFloat(inclineMatch[1]) : undefined,
      speedKmh: speedMatch ? parseFloat(speedMatch[2]) : undefined,
      notes: rawNotes,
    };
  }

  return { isCardio };
}

/**
 * Serializa os metadados de cardio para persistência na coluna `notes`.
 */
export function serializeCardioMeta(meta: CardioMeta): string {
  return JSON.stringify({
    isCardio: meta.isCardio,
    inclinePct: meta.inclinePct != null && !isNaN(meta.inclinePct) ? Number(meta.inclinePct) : undefined,
    speedKmh: meta.speedKmh != null && !isNaN(meta.speedKmh) ? Number(meta.speedKmh) : undefined,
    durationMin: meta.durationMin != null && !isNaN(meta.durationMin) ? Number(meta.durationMin) : undefined,
    distanceKm: meta.distanceKm != null && !isNaN(meta.distanceKm) ? Number(meta.distanceKm) : undefined,
    notes: meta.notes?.trim() || undefined,
  });
}

/**
 * Estima o gasto calórico aproximado (kcal) através da fórmula metabólica ACSM (American College of Sports Medicine)
 * para esteira com inclinação e velocidade.
 *
 * Fórmula ACSM Caminhada (<= 6.0 km/h):
 *   VO2 (mL/kg/min) = 0.1 * S + 1.8 * S * grade + 3.5
 *   Onde S = velocidade em m/min (km/h * 16.6667)
 *   grade = fração da inclinação (ex: 8% = 0.08)
 *
 * Fórmula ACSM Corrida (> 6.0 km/h):
 *   VO2 (mL/kg/min) = 0.2 * S + 0.9 * S * grade + 3.5
 *
 * Gasto em Kcal/min = (VO2 / 3.5 * 3.5 * pesoKg) / 200 = (VO2 * pesoKg) / 200
 */
export function calculateCardioCalories(params: {
  durationMin: number;
  speedKmh?: number | null;
  inclinePct?: number | null;
  weightKg?: number | null;
}): number {
  const duration = Number(params.durationMin) || 0;
  if (duration <= 0) return 0;

  const speedKmh = Number(params.speedKmh) || 0;
  const inclinePct = Number(params.inclinePct) || 0;
  const weightKg = params.weightKg && params.weightKg > 35 && params.weightKg < 220 ? params.weightKg : 75;

  // Se velocidade não for informada, adota caminhada leve/moderada (4.0 km/h)
  const effectiveSpeed = speedKmh > 0 ? speedKmh : 4.0;
  const speedMetersPerMin = effectiveSpeed * (1000 / 60);
  const gradeFraction = Math.max(0, inclinePct) / 100;

  let vo2: number;
  if (effectiveSpeed <= 6.0) {
    // Caminhada ACSM
    vo2 = 0.1 * speedMetersPerMin + 1.8 * speedMetersPerMin * gradeFraction + 3.5;
  } else {
    // Corrida ACSM
    vo2 = 0.2 * speedMetersPerMin + 0.9 * speedMetersPerMin * gradeFraction + 3.5;
  }

  // Kcal por minuto = (VO2 * pesoKg) / 200
  const kcalPerMinute = (vo2 * weightKg) / 200;
  return Math.round(kcalPerMinute * duration);
}

/**
 * Formata um resumo legível e profissional do cardio para histórico, notas e Coach IA.
 */
export function formatCardioSummary(params: {
  name: string;
  durationMin: number;
  speedKmh?: number | null;
  inclinePct?: number | null;
  weightKg?: number | null;
}): string {
  const parts: string[] = [];
  if (params.durationMin > 0) parts.push(`${params.durationMin} min`);
  if (params.speedKmh && params.speedKmh > 0) parts.push(`${params.speedKmh} km/h`);
  if (params.inclinePct != null && params.inclinePct > 0) parts.push(`${params.inclinePct}% inclinação`);

  const kcal = calculateCardioCalories(params);
  if (kcal > 0) parts.push(`~${kcal} kcal`);

  return `🏃 ${params.name}: ${parts.join(" • ")}`;
}
