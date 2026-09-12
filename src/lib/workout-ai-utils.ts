/**
 * Utilitários para o Assistente de Treinos IA:
 * - Tipos para rotinas, treinos gerados e snapshots de backup.
 * - Gerenciamento de ponto de restauração (backup e restore de treinos).
 * - Parser e validador de resposta estruturada da IA.
 * - Gerador de fallback determinístico.
 */

export interface GeneratedExercise {
  name: string;
  muscle_group?: string;
  sets: number;
  reps_range: string;
  rest_seconds: number;
  notes?: string;
}

export interface GeneratedWorkout {
  letter?: string; // ex: "B", "C", "D", "A"
  name: string;
  focus: string;
  exercises: GeneratedExercise[];
}

export interface GeneratedRoutine {
  title: string;
  description: string;
  split_type: string; // ex: "ABCD", "ABC", "PPL"
  weekly_frequency: number;
  workouts: GeneratedWorkout[];
  coach_tips?: string[];
}

export interface WorkoutSetSnapshot {
  set_number: number;
  reps: number;
  weight_kg: number;
}

export interface ExerciseSnapshot {
  name: string;
  position: number;
  notes?: string | null;
  sets: WorkoutSetSnapshot[];
}

export interface WorkoutSnapshot {
  name: string;
  workout_date: string;
  exercises: ExerciseSnapshot[];
}

export interface BackupSnapshot {
  created_at: string;
  label: string;
  workouts: WorkoutSnapshot[];
}

export const WORKOUT_BACKUP_STORAGE_KEY = "fitwell_workout_backup_v1";

let memoryBackupStore: BackupSnapshot | null = null;

/**
 * Salva um snapshot de backup dos treinos atuais no localStorage ou memória
 */
export function saveWorkoutBackup(workouts: WorkoutSnapshot[], label = "Treino Original"): BackupSnapshot {
  const backup: BackupSnapshot = {
    created_at: new Date().toISOString(),
    label,
    workouts,
  };
  memoryBackupStore = backup;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(WORKOUT_BACKUP_STORAGE_KEY, JSON.stringify(backup));
    } catch {}
  }
  return backup;
}

/**
 * Recupera o último snapshot de backup salvo
 */
export function getWorkoutBackup(): BackupSnapshot | null {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(WORKOUT_BACKUP_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.workouts) && parsed.workouts.length > 0) {
          return parsed as BackupSnapshot;
        }
      }
    } catch {}
  }
  return memoryBackupStore;
}

/**
 * Verifica se existe um backup disponível para restauração
 */
export function hasWorkoutBackup(): boolean {
  return getWorkoutBackup() !== null;
}

/**
 * Remove o backup salvo
 */
export function clearWorkoutBackup(): void {
  memoryBackupStore = null;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(WORKOUT_BACKUP_STORAGE_KEY);
    } catch {}
  }
}

/**
 * Extrai a letra do treino a partir do nome (ex: "Treino B - Costas" -> "B")
 */
export function extractWorkoutLetter(name: string): string {
  const match = name.match(/^(?:treino\s+)?([a-zA-Z])(?:\s*[-–:]|\s+|$)/i);
  return match ? match[1].toUpperCase() : "";
}

/**
 * Sanitiza e valida a resposta da IA garantindo campos obrigatórios e faixas fisiológicas válidas
 */
export function sanitizeGeneratedRoutine(raw: any): GeneratedRoutine {
  if (!raw || typeof raw !== "object") {
    return getDeterministicRoutineFallback();
  }

  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Rotina Otimizada pelo Coach IA";
  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim()
      : "Rotina balanceada com base no seu padrão de treino e histórico recente.";
  const split_type = typeof raw.split_type === "string" ? raw.split_type : "ABCD";
  const weekly_frequency = typeof raw.weekly_frequency === "number" && raw.weekly_frequency > 0 ? raw.weekly_frequency : 4;

  const rawWorkouts = Array.isArray(raw.workouts) ? raw.workouts : [];
  const workouts: GeneratedWorkout[] = rawWorkouts.map((w: any, idx: number) => {
    const rawName = typeof w?.name === "string" && w.name.trim() ? w.name.trim() : `Treino ${String.fromCharCode(65 + idx)}`;
    const letter = typeof w?.letter === "string" && w.letter ? w.letter.toUpperCase() : extractWorkoutLetter(rawName) || String.fromCharCode(65 + idx);
    const focus = typeof w?.focus === "string" && w.focus.trim() ? w.focus.trim() : "Geral";

    const rawExercises = Array.isArray(w?.exercises) ? w.exercises : [];
    const exercises: GeneratedExercise[] = rawExercises.map((e: any, eIdx: number) => {
      const name = typeof e?.name === "string" && e.name.trim() ? e.name.trim() : `Exercício ${eIdx + 1}`;
      const sets = typeof e?.sets === "number" && e.sets >= 1 && e.sets <= 8 ? e.sets : 3;
      const reps_range = typeof e?.reps_range === "string" && e.reps_range.trim() ? e.reps_range.trim() : "8-12";
      const rest_seconds = typeof e?.rest_seconds === "number" && e.rest_seconds >= 30 && e.rest_seconds <= 240 ? e.rest_seconds : 60;
      const muscle_group = typeof e?.muscle_group === "string" ? e.muscle_group.trim() : undefined;
      const notes = typeof e?.notes === "string" ? e.notes.trim() : undefined;

      return {
        name,
        sets,
        reps_range,
        rest_seconds,
        muscle_group,
        notes,
      };
    });

    return {
      letter,
      name: rawName,
      focus,
      exercises: exercises.length > 0 ? exercises : getFallbackExercisesForWorkout(letter),
    };
  });

  const coach_tips = Array.isArray(raw.coach_tips)
    ? raw.coach_tips.filter((t: any) => typeof t === "string" && t.trim().length > 0)
    : [
        "Mantenha uma boa cadência na fase excêntrica (2 a 3 segundos descendo).",
        "Suba a carga sempre que conseguir atingir o teto de repetições com boa forma.",
      ];

  return {
    title,
    description,
    split_type,
    weekly_frequency,
    workouts: workouts.length > 0 ? workouts : getDeterministicRoutineFallback().workouts,
    coach_tips,
  };
}

/**
 * Fallback de exercícios determinísticos por letra de treino
 */
function getFallbackExercisesForWorkout(letter: string): GeneratedExercise[] {
  switch (letter.toUpperCase()) {
    case "A":
      return [
        { name: "Supino Reto com Barra", sets: 4, reps_range: "6-8", rest_seconds: 90, muscle_group: "Peito" },
        { name: "Supino Inclinado com Halteres", sets: 3, reps_range: "8-10", rest_seconds: 75, muscle_group: "Peito" },
        { name: "Crucifixo na Máquina", sets: 3, reps_range: "10-12", rest_seconds: 60, muscle_group: "Peito" },
        { name: "Tríceps Pulley Barra V", sets: 4, reps_range: "10-12", rest_seconds: 60, muscle_group: "Tríceps" },
        { name: "Tríceps Testa com Halteres", sets: 3, reps_range: "8-10", rest_seconds: 60, muscle_group: "Tríceps" },
      ];
    case "B":
      return [
        { name: "Puxada Frontal", sets: 4, reps_range: "8-10", rest_seconds: 75, muscle_group: "Costas" },
        { name: "Remada Curvada com Halteres", sets: 4, reps_range: "8-10", rest_seconds: 75, muscle_group: "Costas" },
        { name: "Remada Baixa Triângulo", sets: 3, reps_range: "10-12", rest_seconds: 60, muscle_group: "Costas" },
        { name: "Rosca Direta com Barra W", sets: 3, reps_range: "8-10", rest_seconds: 60, muscle_group: "Bíceps" },
        { name: "Rosca Martelo com Halteres", sets: 3, reps_range: "10-12", rest_seconds: 60, muscle_group: "Bíceps" },
      ];
    case "C":
      return [
        { name: "Leg Press 45°", sets: 4, reps_range: "10-12", rest_seconds: 90, muscle_group: "Quadríceps" },
        { name: "Cadeira Extensora", sets: 3, reps_range: "12-15", rest_seconds: 60, muscle_group: "Quadríceps" },
        { name: "Mesa Flexora", sets: 4, reps_range: "10-12", rest_seconds: 60, muscle_group: "Posterior" },
        { name: "Cadeira Flexora", sets: 3, reps_range: "12-15", rest_seconds: 60, muscle_group: "Posterior" },
        { name: "Panturrilha Sentado", sets: 4, reps_range: "15-20", rest_seconds: 45, muscle_group: "Panturrilha" },
      ];
    case "D":
    default:
      return [
        { name: "Desenvolvimento com Halteres", sets: 4, reps_range: "8-10", rest_seconds: 75, muscle_group: "Ombros" },
        { name: "Elevação Lateral com Halteres", sets: 4, reps_range: "12-15", rest_seconds: 45, muscle_group: "Ombros" },
        { name: "Crucifixo Inverso na Máquina", sets: 3, reps_range: "12-15", rest_seconds: 45, muscle_group: "Ombros" },
        { name: "Encolhimento com Halteres", sets: 3, reps_range: "12-15", rest_seconds: 60, muscle_group: "Trapézio" },
        { name: "Abdominal Supra na Polia", sets: 3, reps_range: "15-20", rest_seconds: 45, muscle_group: "Abdômen" },
      ];
  }
}

/**
 * Retorna uma rotina de fallback completa estilo BCDA
 */
export function getDeterministicRoutineFallback(): GeneratedRoutine {
  return {
    title: "Divisão Otimizada BCDA (Base Consistente)",
    description: "Estrutura equilibrada em 4 dias com foco em hipertrofia e distribuição ideal de volume semanal.",
    split_type: "BCDA",
    weekly_frequency: 4,
    workouts: [
      {
        letter: "B",
        name: "Treino B - Costas e Bíceps",
        focus: "Puxadas, densidade dorsal e flexores de cotovelo",
        exercises: getFallbackExercisesForWorkout("B"),
      },
      {
        letter: "C",
        name: "Treino C - Pernas Completo",
        focus: "Quadríceps, posteriores e panturrilha",
        exercises: getFallbackExercisesForWorkout("C"),
      },
      {
        letter: "D",
        name: "Treino D - Ombros e Trapézio",
        focus: "Deltóides completos com ênfase em lateral e posterior",
        exercises: getFallbackExercisesForWorkout("D"),
      },
      {
        letter: "A",
        name: "Treino A - Peito e Tríceps",
        focus: "Empurrar horizontal e extensores de cotovelo",
        exercises: getFallbackExercisesForWorkout("A"),
      },
    ],
    coach_tips: [
      "Priorize os primeiros 2 exercícios de cada treino com cargas progressivas.",
      "Descanse 75 a 90 segundos nos exercícios compostos e 45 a 60 segundos nos isoladores.",
      "Anote o peso em cada série para garantir sobrecarga progressiva ao longo das semanas.",
    ],
  };
}
