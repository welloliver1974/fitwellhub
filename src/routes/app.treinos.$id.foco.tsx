import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, X, Plus, Check, Timer, Pause, Play, Loader2, Shuffle, TrendingUp } from "lucide-react";
import { cn, playBeep } from "@/lib/utils";
import { toast } from "sonner";
import { ExerciseSubstituteDialog } from "@/components/exercise-substitute-dialog";

export const Route = createFileRoute("/app/treinos/$id/foco")({
  component: FocusMode,
});

type Exercise = { id: string; name: string; position: number };
type WorkoutSet = {
  id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  completed: boolean;
};

function FocusMode() {
  const { id } = Route.useParams();
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [history, setHistory] = useState<Record<string, { reps: number; weight_kg: number; date: string }>>({});
  const [idx, setIdx] = useState(0);
  const [restSec, setRestSec] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restPreset, setRestPreset] = useState(60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Estados da sessão de treino ativa (mesmo rascunho da tela normal)
  const [completedSets, setCompletedSets] = useState<Set<string>>(new Set());
  const [setValues, setSetValues] = useState<Record<string, { reps: number; weight_kg: number }>>({});
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [workoutName, setWorkoutName] = useState("");

  // Substituição de exercício por IA (apenas local — não altera o template)
  const [substituteOpen, setSubstituteOpen] = useState(false);
  /** Mapa de exerciseId → nome substituído temporariamente nesta sessão */
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});

  // Auxiliar para salvar rascunho no localStorage
  const saveDraft = (
    newCompleted: Set<string>,
    newValues: Record<string, { reps: number; weight_kg: number }>,
    start: string
  ) => {
    localStorage.setItem(
      `active-session-${id}`,
      JSON.stringify({
        startedAt: start,
        completedSets: Array.from(newCompleted),
        setValues: newValues,
      })
    );
  };

  const toggleCompleted = (setId: string) => {
    setCompletedSets((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) {
        next.delete(setId);
      } else {
        next.add(setId);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try { navigator.vibrate(40); } catch {}
        }
        setRestSec(restPreset); // Auto inicia o timer de descanso
        setRestRunning(true);
      }
      if (startedAt) saveDraft(next, setValues, startedAt);
      return next;
    });
  };

  const updateLocalSet = (setId: string, field: "reps" | "weight_kg", value: number) => {
    setSetValues((prev) => {
      const updated = {
        ...prev,
        [setId]: {
          ...prev[setId],
          [field]: value,
        },
      };
      if (startedAt) saveDraft(completedSets, updated, startedAt);
      return updated;
    });
  };

  useEffect(() => {
    if (restRunning && restSec > 0) {
      intervalRef.current = setInterval(() => {
        setRestSec((s) => {
          if (s <= 1) {
            setRestRunning(false);
            playBeep();
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              try { navigator.vibrate([100, 50, 100]); } catch {}
            }
            toast.success("Descanso terminado");
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [restRunning]);

  const load = async () => {
    const { data: w } = await supabase
      .from("workouts")
      .select("name")
      .eq("id", id)
      .maybeSingle();
    if (w) setWorkoutName(w.name);

    const { data: ex } = await supabase
      .from("exercises")
      .select("id,name,position")
      .eq("workout_id", id)
      .order("position");
    setExercises((ex ?? []) as Exercise[]);
    
    const exIds = (ex ?? []).map((e) => e.id);
    let loadedSets: WorkoutSet[] = [];
    if (exIds.length) {
      const { data: ss } = await supabase
        .from("sets")
        .select("*")
        .in("exercise_id", exIds)
        .order("set_number");
      loadedSets = (ss ?? []) as WorkoutSet[];
      setSets(loadedSets);
    } else {
      setSets([]);
    }

    // Carregar rascunho do localStorage se existir
    const draftStr = localStorage.getItem(`active-session-${id}`);
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        setStartedAt(draft.startedAt);
        setCompletedSets(new Set(draft.completedSets));

        const mergedValues: Record<string, { reps: number; weight_kg: number }> = {};
        loadedSets.forEach((s) => {
          if (draft.setValues[s.id]) {
            mergedValues[s.id] = draft.setValues[s.id];
          } else {
            mergedValues[s.id] = { reps: s.reps, weight_kg: Number(s.weight_kg) };
          }
        });
        setSetValues(mergedValues);
      } catch (err) {
        console.error("Erro ao carregar rascunho em modo foco:", err);
      }
    } else {
      setStartedAt(null);
      const initialValues: Record<string, { reps: number; weight_kg: number }> = {};
      loadedSets.forEach((s) => {
        initialValues[s.id] = { reps: s.reps, weight_kg: Number(s.weight_kg) };
      });
      setSetValues(initialValues);
      setCompletedSets(new Set());
    }

    // Carregar melhor/última série por nome de exercício do histórico
    if (user && (ex ?? []).length) {
      const names = Array.from(new Set((ex ?? []).map((e) => e.name)));
      const { data: prev } = await supabase
        .from("exercises")
        .select("id,name,workout_id,workouts!inner(workout_date)")
        .eq("user_id", user.id)
        .in("name", names)
        .neq("workout_id", id);
      const prevIds = (prev ?? []).map((p) => p.id);
      if (prevIds.length) {
        const { data: prevSets } = await supabase
          .from("sets")
          .select("exercise_id,reps,weight_kg")
          .in("exercise_id", prevIds);
        const exMap: Record<string, { name: string; date: string }> = {};
        (prev ?? []).forEach((p) => {
          exMap[p.id] = { name: p.name, date: (p.workouts as any)?.workout_date };
        });
        const best: Record<string, { reps: number; weight_kg: number; date: string }> = {};
        (prevSets ?? []).forEach((s) => {
          const meta = exMap[s.exercise_id];
          if (!meta) return;
          const cur = best[meta.name];
          const w = Number(s.weight_kg);
          if (!cur || w > cur.weight_kg || (w === cur.weight_kg && Number(s.reps) > cur.reps)) {
            best[meta.name] = { reps: Number(s.reps), weight_kg: w, date: meta.date };
          }
        });
        setHistory(best);
      } else setHistory({});
    }
  };

  const startWorkout = () => {
    const now = new Date().toISOString();
    setStartedAt(now);
    saveDraft(completedSets, setValues, now);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [id]);

  const ex = exercises[idx];
  /** Nome exibido do exercício atual — pode ter sido substituído localmente */
  const exDisplayName = ex ? (nameOverrides[ex.id] ?? ex.name) : "";
  const exSets = ex ? sets.filter((s) => s.exercise_id === ex.id) : [];

  const addSet = async () => {
    if (!user || !ex) return;
    const exSets = sets.filter((s) => s.exercise_id === ex.id);
    const last = exSets[exSets.length - 1];

    let lastReps = last?.reps ?? 10;
    let lastWeight = last?.weight_kg ?? 0;
    if (last && setValues[last.id]) {
      lastReps = setValues[last.id].reps;
      lastWeight = setValues[last.id].weight_kg;
    }

    const { error } = await supabase.from("sets").insert({
      user_id: user.id,
      exercise_id: ex.id,
      set_number: exSets.length + 1,
      reps: lastReps,
      weight_kg: lastWeight,
    });
    if (error) return toast.error(error.message);
    setRestSec(restPreset);
    setRestRunning(true);
    load();
  };

  const finishWorkout = async () => {
    if (!user) return;
    if (completedSets.size === 0) {
      if (!confirm("Você não concluiu nenhuma série neste treino. Deseja finalizar assim mesmo?")) {
        return;
      }
    }

    setIsFinishing(true);
    try {
      // 1. Criar sessão de treino finalizada
      const { data: session, error: sessError } = await supabase
        .from("workout_sessions")
        .insert({
          user_id: user.id,
          workout_id: id,
          name: workoutName || "Treino",
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (sessError) throw sessError;

      // 2. Inserir séries realizadas (sets) na nova tabela workout_session_sets
      const sessionSetsToInsert = sets.map((s) => {
        const val = setValues[s.id] ?? { reps: s.reps, weight_kg: Number(s.weight_kg) };
        const isDone = completedSets.has(s.id);
        const exName = exercises.find((e) => e.id === s.exercise_id)?.name ?? "Exercício";
        return {
          session_id: session.id,
          user_id: user.id,
          exercise_name: exName,
          set_number: s.set_number,
          reps: val.reps,
          weight_kg: val.weight_kg,
          completed: isDone,
        };
      });

      if (sessionSetsToInsert.length > 0) {
        const { error: setsError } = await supabase
          .from("workout_session_sets")
          .insert(sessionSetsToInsert);
        if (setsError) throw setsError;
      }

      // 3. Atualizar template original (sets) com as cargas novas como padrão e desmarcados
      const templateUpdates = sets.map((s) => {
        const val = setValues[s.id] ?? { reps: s.reps, weight_kg: Number(s.weight_kg) };
        return supabase
          .from("sets")
          .update({
            reps: val.reps,
            weight_kg: val.weight_kg,
            completed: false, // reset template
          })
          .eq("id", s.id);
      });

      await Promise.all(templateUpdates);

      // 4. Remover rascunho
      localStorage.removeItem(`active-session-${id}`);

      toast.success("Treino finalizado com sucesso!");
      navigate({ to: "/app/treinos" });
    } catch (err: any) {
      toast.error("Erro ao salvar treino: " + err.message);
    } finally {
      setIsFinishing(false);
    }
  };

  if (!exercises.length)
    return (
      <div className="text-center py-20 text-muted-foreground">
        Nenhum exercício.{" "}
        <Link to="/app/treinos/$id" params={{ id }} className="text-primary underline">
          Voltar
        </Link>
      </div>
    );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={() => navigate({ to: "/app/treinos/$id", params: { id } })}
        >
          <X className="h-5 w-5" />
        </Button>
        <p className="text-xs text-muted-foreground font-semibold truncate text-center flex-1 px-1">
          {idx + 1} / {exercises.length} — {workoutName}
        </p>
        {startedAt == null ? (
          <Button size="sm" onClick={startWorkout} className="gap-1.5 shrink-0 rounded-full font-medium px-3">
            <Play className="h-3.5 w-3.5" />
            Iniciar
          </Button>
        ) : (
          <div className="w-9 shrink-0" />
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col items-center">
        <h1 className="text-3xl font-display font-bold text-center">{exDisplayName}</h1>
        <Button
          variant="ghost"
          size="sm"
          className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary mt-1"
          onClick={() => setSubstituteOpen(true)}
          title="Substituir exercício por IA"
        >
          <Shuffle className="h-3.5 w-3.5" />
          Substituir exercício
        </Button>

        {history[exDisplayName] && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/80 text-secondary-foreground text-xs font-medium mt-2 shadow-xs">
            <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Melhor carga: <strong>{history[exDisplayName].weight_kg} kg</strong> × {history[exDisplayName].reps} reps</span>
          </div>
        )}

        <div className="my-8 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Descanso</p>
          <p className="text-7xl font-display font-bold tabular-nums text-primary">
            {Math.floor(restSec / 60)
              .toString()
              .padStart(2, "0")}
            :{(restSec % 60).toString().padStart(2, "0")}
          </p>
          <div className="flex justify-center gap-2 mt-4">
            {[60, 90, 120, 180].map((s) => (
              <Button
                key={s}
                variant={restPreset === s ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setRestPreset(s);
                  setRestSec(s);
                  setRestRunning(true);
                }}
              >
                {s}s
              </Button>
            ))}
            {restSec > 0 &&
              (restRunning ? (
                <Button size="icon" variant="ghost" onClick={() => setRestRunning(false)}>
                  <Pause className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="icon" variant="ghost" onClick={() => setRestRunning(true)}>
                  <Play className="h-4 w-4" />
                </Button>
              ))}
          </div>
        </div>

        <div className="w-full max-w-md space-y-2">
          {exSets.map((s) => {
            const done = completedSets.has(s.id);
            const curVal = setValues[s.id] ?? { reps: s.reps, weight_kg: Number(s.weight_kg) };
            return (
            <div
              key={s.id}
              className={cn(
                "grid grid-cols-[40px_28px_1fr_1fr_36px] items-center gap-2 rounded-xl bg-card border p-2 transition-opacity",
                done && "opacity-50",
              )}
            >
              <span className="text-center font-bold">{s.set_number}</span>
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => toggleCompleted(s.id)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
              </div>
              <Input
                type="number"
                value={curVal.reps || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => updateLocalSet(s.id, "reps", Number(e.target.value))}
                className="text-center text-lg"
                disabled={done}
              />
              <Input
                type="number"
                step="0.5"
                value={curVal.weight_kg || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => updateLocalSet(s.id, "weight_kg", Number(e.target.value))}
                className="text-center text-lg"
                disabled={done}
              />
              <Check className={cn("h-5 w-5 mx-auto", done ? "text-primary" : "text-muted-foreground/30")} />
            </div>
            );
          })}
          <Button onClick={addSet} variant="secondary" className="w-full h-12 text-base">
            <Plus className="h-4 w-4 mr-1" /> Adicionar série
          </Button>
        </div>
      </div>

      <footer className="flex items-center justify-between px-5 py-4 border-t bg-card/50">
        <Button
          variant="outline"
          size="lg"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
        >
          <ChevronLeft className="h-5 w-5" /> Anterior
        </Button>
        {idx === exercises.length - 1 ? (
          <Button size="lg" disabled={isFinishing} onClick={finishWorkout} className="flex items-center gap-1">
            {isFinishing && <Loader2 className="h-4 w-4 animate-spin" />}
            Finalizar
          </Button>
        ) : (
          <Button size="lg" onClick={() => setIdx((i) => Math.min(exercises.length - 1, i + 1))}>
            Próximo <ChevronRight className="h-5 w-5" />
          </Button>
        )}
      </footer>
      {ex && (
        <ExerciseSubstituteDialog
          open={substituteOpen}
          onOpenChange={setSubstituteOpen}
          exerciseName={exDisplayName}
          session={session}
          onSelect={(newName) =>
            setNameOverrides((prev) => ({ ...prev, [ex.id]: newName }))
          }
        />
      )}
    </div>
  );
}
