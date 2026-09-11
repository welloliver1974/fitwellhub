import { describe, it, expect, beforeEach } from "vitest";
import {
  determineNextWorkout,
  extractWorkoutLetter,
  DEFAULT_SPLIT_ROTATION,
  type WorkoutItem,
} from "./workout-rotation";

describe("workout-rotation", () => {
  const userWorkouts: WorkoutItem[] = [
    { id: "w-a", name: "A - Treino Peito e Tríceps" },
    { id: "w-b", name: "B - Treino Costas e Bíceps" },
    { id: "w-c", name: "C - Treino Pernas Completo" },
    { id: "w-d", name: "D - Treino Braços e Ombros" },
  ];

  it("deve extrair a letra do treino corretamente de vários formatos", () => {
    expect(extractWorkoutLetter("A - Treino Peito")).toBe("A");
    expect(extractWorkoutLetter("B: Costas")).toBe("B");
    expect(extractWorkoutLetter("c. pernas")).toBe("C");
    expect(extractWorkoutLetter("D - Treino Braços")).toBe("D");
    expect(extractWorkoutLetter("Treino A - Dorsais")).toBe("A");
    expect(extractWorkoutLetter("Treino Funcional")).toBeNull();
  });

  it("caso exato do usuário: rotação BCDA, ontem fez D -> sugere A hoje!", () => {
    const lastSession = {
      workout_id: "w-d",
      name: "D - Treino Braços e Ombros",
      completed_at: "2026-09-10T18:00:00Z",
    };

    const next = determineNextWorkout({
      workouts: userWorkouts,
      lastCompletedSession: lastSession,
      preferredOrder: ["B", "C", "D", "A"],
    });

    expect(next?.id).toBe("w-a");
    expect(next?.name).toBe("A - Treino Peito e Tríceps");
  });

  it("rotação BCDA: após A -> sugere B", () => {
    const lastSession = {
      workout_id: "w-a",
      name: "A - Treino Peito e Tríceps",
      completed_at: "2026-09-11T18:00:00Z",
    };

    const next = determineNextWorkout({
      workouts: userWorkouts,
      lastCompletedSession: lastSession,
      preferredOrder: ["B", "C", "D", "A"],
    });

    expect(next?.id).toBe("w-b");
  });

  it("rotação BCDA: após B -> sugere C", () => {
    const lastSession = {
      workout_id: "w-b",
      name: "B - Treino Costas e Bíceps",
    };

    const next = determineNextWorkout({
      workouts: userWorkouts,
      lastCompletedSession: lastSession,
      preferredOrder: ["B", "C", "D", "A"],
    });

    expect(next?.id).toBe("w-c");
  });

  it("rotação BCDA: após C -> sugere D", () => {
    const lastSession = {
      workout_id: "w-c",
      name: "C - Treino Pernas Completo",
    };

    const next = determineNextWorkout({
      workouts: userWorkouts,
      lastCompletedSession: lastSession,
      preferredOrder: ["B", "C", "D", "A"],
    });

    expect(next?.id).toBe("w-d");
  });

  it("quando não há sessão concluída anterior, sugere o primeiro da rotação (B)", () => {
    const next = determineNextWorkout({
      workouts: userWorkouts,
      lastCompletedSession: null,
      preferredOrder: ["B", "C", "D", "A"],
    });

    expect(next?.id).toBe("w-b");
  });

  it("reconhece treino concluído apenas pelo nome quando workout_id for null", () => {
    const lastSession = {
      workout_id: null,
      name: "D - Treino Braços e Ombros",
    };

    const next = determineNextWorkout({
      workouts: userWorkouts,
      lastCompletedSession: lastSession,
      preferredOrder: ["B", "C", "D", "A"],
    });

    expect(next?.id).toBe("w-a");
  });
});
