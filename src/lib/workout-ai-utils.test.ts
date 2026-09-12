import { describe, it, expect, beforeEach } from "vitest";
import {
  extractWorkoutLetter,
  saveWorkoutBackup,
  getWorkoutBackup,
  hasWorkoutBackup,
  clearWorkoutBackup,
  sanitizeGeneratedRoutine,
  getDeterministicRoutineFallback,
  type WorkoutSnapshot,
} from "./workout-ai-utils";

describe("workout-ai-utils", () => {
  beforeEach(() => {
    clearWorkoutBackup();
  });

  describe("extractWorkoutLetter", () => {
    it("extrai letra de padrões comuns de nome de treino", () => {
      expect(extractWorkoutLetter("Treino B - Costas e Bíceps")).toBe("B");
      expect(extractWorkoutLetter("Treino C: Pernas")).toBe("C");
      expect(extractWorkoutLetter("Treino D")).toBe("D");
      expect(extractWorkoutLetter("A - Peito")).toBe("A");
      expect(extractWorkoutLetter("treino a")).toBe("A");
      expect(extractWorkoutLetter("Costas e Bíceps")).toBe("");
    });
  });

  describe("Snapshots de Backup e Restauração", () => {
    const mockSnapshots: WorkoutSnapshot[] = [
      {
        name: "Treino B - Costas",
        workout_date: "2026-09-11",
        exercises: [
          {
            name: "Puxada Frontal",
            position: 1,
            notes: null,
            sets: [
              { set_number: 1, reps: 10, weight_kg: 50 },
              { set_number: 2, reps: 10, weight_kg: 50 },
            ],
          },
        ],
      },
    ];

    it("salva, detecta e recupera snapshot de backup no storage", () => {
      expect(hasWorkoutBackup()).toBe(false);
      expect(getWorkoutBackup()).toBeNull();

      const saved = saveWorkoutBackup(mockSnapshots, "Meu Backup Teste");
      expect(saved.label).toBe("Meu Backup Teste");
      expect(saved.workouts.length).toBe(1);
      expect(saved.workouts[0].name).toBe("Treino B - Costas");

      expect(hasWorkoutBackup()).toBe(true);
      const retrieved = getWorkoutBackup();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.workouts[0].exercises[0].name).toBe("Puxada Frontal");
    });

    it("limpa o snapshot salvo", () => {
      saveWorkoutBackup(mockSnapshots);
      expect(hasWorkoutBackup()).toBe(true);

      clearWorkoutBackup();
      expect(hasWorkoutBackup()).toBe(false);
      expect(getWorkoutBackup()).toBeNull();
    });
  });

  describe("sanitizeGeneratedRoutine", () => {
    it("retorna fallback determinístico quando a IA envia dado nulo ou inválido", () => {
      const routineNull = sanitizeGeneratedRoutine(null);
      expect(routineNull.workouts.length).toBe(4);
      expect(routineNull.split_type).toBe("BCDA");

      const routineEmpty = sanitizeGeneratedRoutine({});
      expect(routineEmpty.workouts.length).toBe(4);
    });

    it("sanitiza faixas de séries, reps e descansos de respostas incompletas", () => {
      const partialRoutine = {
        title: "Treino Hipertrofia",
        split_type: "AB",
        weekly_frequency: 2,
        workouts: [
          {
            name: "Treino B - Costas",
            focus: "Costas",
            exercises: [
              {
                name: "Puxada Frontal",
                sets: 20, // valor fora do comum (>8)
                reps_range: "",
                rest_seconds: 10, // descanso muito curto (<30)
              },
            ],
          },
        ],
      };

      const result = sanitizeGeneratedRoutine(partialRoutine);
      expect(result.title).toBe("Treino Hipertrofia");
      expect(result.workouts[0].letter).toBe("B");
      expect(result.workouts[0].exercises[0].sets).toBe(3); // normalizado para padrão seguro
      expect(result.workouts[0].exercises[0].reps_range).toBe("8-12");
      expect(result.workouts[0].exercises[0].rest_seconds).toBe(60); // normalizado para mínimo seguro
    });
  });

  describe("getDeterministicRoutineFallback", () => {
    it("gera rotina consistente BCDA com todas as propriedades esperadas", () => {
      const fallback = getDeterministicRoutineFallback();
      expect(fallback.split_type).toBe("BCDA");
      expect(fallback.workouts.map((w) => w.letter)).toEqual(["B", "C", "D", "A"]);
      expect(fallback.workouts[0].exercises.length).toBeGreaterThan(0);
      expect(fallback.coach_tips?.length).toBeGreaterThan(0);
    });
  });
});
