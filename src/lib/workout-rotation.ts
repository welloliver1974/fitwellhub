/**
 * Utilitários para detecção e rotação inteligente de divisão de treinos (Split Sequencer).
 * Suporta sequências customizáveis (ex: B ➔ C ➔ D ➔ A, A ➔ B ➔ C ➔ D, PPL, etc.)
 */

export interface WorkoutItem {
  id: string;
  name: string;
  created_at?: string;
  workout_date?: string;
}

export interface SessionItem {
  id?: string;
  workout_id?: string | null;
  name?: string;
  completed_at?: string;
}

export const STORAGE_KEY_WORKOUT_ROTATION = "fitwell_workout_split_rotation";

// Sequência padrão para o usuário: BCDA
export const DEFAULT_SPLIT_ROTATION = ["B", "C", "D", "A"];

/**
 * Extrai a letra do treino a partir do nome (ex: "D - Treino Braços" -> "D", "Treino B" -> "B")
 */
export function extractWorkoutLetter(name: string): string | null {
  if (!name) return null;
  const trimmed = name.trim();

  // Caso 1: Começa com a letra: "A - ...", "B: ...", "C. ...", "D Treino"
  const prefixMatch = trimmed.match(/^([A-Za-z])(?:\s*[-–—:.]|\s+|$)/i);
  if (prefixMatch) {
    return prefixMatch[1].toUpperCase();
  }

  // Caso 2: Contém "Treino X"
  const treinoMatch = trimmed.match(/treino\s+([A-Za-z])\b/i);
  if (treinoMatch) {
    return treinoMatch[1].toUpperCase();
  }

  return null;
}

/**
 * Obtém a sequência de rotação configurada no localStorage ou padrão BCDA
 */
export function getSavedSplitRotation(): string[] {
  if (typeof window === "undefined") return DEFAULT_SPLIT_ROTATION;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WORKOUT_ROTATION);
    if (!raw) return DEFAULT_SPLIT_ROTATION;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item) => String(item).trim().toUpperCase());
    }
  } catch {}
  return DEFAULT_SPLIT_ROTATION;
}

/**
 * Salva a nova sequência de rotação no localStorage
 */
export function saveSplitRotation(order: string[]): void {
  if (typeof window === "undefined") return;
  const cleanOrder = order.map((o) => o.trim().toUpperCase()).filter(Boolean);
  localStorage.setItem(STORAGE_KEY_WORKOUT_ROTATION, JSON.stringify(cleanOrder));
}

/**
 * Determina o próximo treino a ser realizado na rotação inteligente
 */
export function determineNextWorkout(params: {
  workouts: WorkoutItem[];
  lastCompletedSession: SessionItem | null;
  preferredOrder?: string[];
}): WorkoutItem | null {
  const { workouts, lastCompletedSession } = params;
  if (!workouts || workouts.length === 0) return null;
  if (workouts.length === 1) return workouts[0];

  const splitOrder =
    params.preferredOrder && params.preferredOrder.length > 0
      ? params.preferredOrder.map((l) => l.toUpperCase())
      : getSavedSplitRotation();

  // Mapear treinos disponíveis por letra (se houver)
  const workoutsByLetter = new Map<string, WorkoutItem>();
  for (const w of workouts) {
    const letter = extractWorkoutLetter(w.name);
    if (letter) {
      workoutsByLetter.set(letter, w);
    }
  }

  const hasLetterMatching = splitOrder.some((letter) => workoutsByLetter.has(letter));

  // 1. Se não houver histórico de sessão concluída, sugere o primeiro treino da sequência
  if (!lastCompletedSession) {
    if (hasLetterMatching) {
      for (const letter of splitOrder) {
        if (workoutsByLetter.has(letter)) {
          return workoutsByLetter.get(letter)!;
        }
      }
    }
    return workouts[0];
  }

  // 2. Descobrir qual treino foi o último concluído
  let lastWorkoutLetter: string | null = null;
  let lastWorkoutIndex = -1;

  // Tentar identificar por workout_id
  if (lastCompletedSession.workout_id) {
    const matched = workouts.find((w) => w.id === lastCompletedSession.workout_id);
    if (matched) {
      lastWorkoutLetter = extractWorkoutLetter(matched.name);
      lastWorkoutIndex = workouts.indexOf(matched);
    }
  }

  // Se não identificou por id, tenta pelo nome da sessão
  if (!lastWorkoutLetter && lastCompletedSession.name) {
    lastWorkoutLetter = extractWorkoutLetter(lastCompletedSession.name);
    if (lastWorkoutIndex === -1) {
      lastWorkoutIndex = workouts.findIndex(
        (w) => w.name.trim().toLowerCase() === lastCompletedSession.name?.trim().toLowerCase()
      );
    }
  }

  // 3. Rotação baseada em letras (ex: B ➔ C ➔ D ➔ A)
  if (hasLetterMatching && lastWorkoutLetter) {
    const currentIndex = splitOrder.indexOf(lastWorkoutLetter);
    if (currentIndex !== -1) {
      // Avança circularmente na rotação
      for (let step = 1; step <= splitOrder.length; step++) {
        const nextLetter = splitOrder[(currentIndex + step) % splitOrder.length];
        if (workoutsByLetter.has(nextLetter)) {
          return workoutsByLetter.get(nextLetter)!;
        }
      }
    }
  }

  // 4. Fallback se não usar letras ou letra não estiver na sequência:
  // Rotaciona pela lista de treinos existentes em ordem natural
  if (lastWorkoutIndex !== -1) {
    const nextIdx = (lastWorkoutIndex + 1) % workouts.length;
    return workouts[nextIdx];
  }

  // 5. Último fallback: primeiro da rotação ou primeiro treino
  if (hasLetterMatching) {
    for (const letter of splitOrder) {
      if (workoutsByLetter.has(letter)) {
        return workoutsByLetter.get(letter)!;
      }
    }
  }

  return workouts[0];
}
