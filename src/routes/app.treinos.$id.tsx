import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { cn, playBeep } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Timer,
  TrendingUp,
  Pause,
  Play,
  Sparkles,
  Maximize2,
  Loader2,
  Check,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/treinos/$id")({
  component: WorkoutDetail,
});

type Workout = { id: string; name: string; workout_date: string };
type Exercise = { id: string; name: string; position: number };
type WorkoutSet = {
  id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  completed: boolean;
};

type PrevExerciseRow = {
  id: string;
  name: string;
  workouts: { workout_date: string };
};

type PrevSetRow = {
  exercise_id: string;
  reps: number;
  weight_kg: number;
};

function WorkoutDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [history, setHistory] = useState<
    Record<string, { reps: number; weight_kg: number; date: string }>
  >({});
  const [open, setOpen] = useState(false);
  const [exName, setExName] = useState("");
  const [catalog, setCatalog] = useState<{ id: string; name: string }[]>([]);
  const [restSec, setRestSec] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restPreset, setRestPreset] = useState(60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Estados da sessão de treino ativa
  const [completedSets, setCompletedSets] = useState<Set<string>>(new Set());
  const [setValues, setSetValues] = useState<Record<string, { reps: number; weight_kg: number }>>({});
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

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
        startRest(restPreset); // Auto inicia o timer de descanso ao marcar
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

  // Cronômetro do tempo de treino corrido
  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      setElapsedTime(diff > 0 ? diff : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const startRest = (sec: number) => {
    setRestPreset(sec);
    setRestSec(sec);
    setRestRunning(true);
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const resetWorkout = () => {
    if (confirm("Deseja realmente reiniciar o treino? O progresso desta sessão ativa será limpo.")) {
      localStorage.removeItem(`active-session-${id}`);
      const newStart = new Date().toISOString();
      setStartedAt(newStart);
      setCompletedSets(new Set());
      const initialValues: Record<string, { reps: number; weight_kg: number }> = {};
      sets.forEach((s) => {
        initialValues[s.id] = { reps: s.reps, weight_kg: Number(s.weight_kg) };
      });
      setSetValues(initialValues);
      setElapsedTime(0);
      toast.success("Treino reiniciado");
    }
  };

  const load = async () => {
    const { data: w } = await supabase
      .from("workouts")
      .select("id,name,workout_date")
      .eq("id", id)
      .maybeSingle();
    setWorkout(w as Workout | null);

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
        console.error("Erro ao carregar rascunho:", err);
      }
    } else {
      const newStart = new Date().toISOString();
      setStartedAt(newStart);
      const initialValues: Record<string, { reps: number; weight_kg: number }> = {};
      loadedSets.forEach((s) => {
        initialValues[s.id] = { reps: s.reps, weight_kg: Number(s.weight_kg) };
      });
      setSetValues(initialValues);
      setCompletedSets(new Set());
      saveDraft(new Set(), initialValues, newStart);
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
          exMap[p.id] = { name: p.name, date: p.workouts.workout_date };
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

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [id]);

  const addExercise = async () => {
    if (!user || !exName.trim()) return;
    const { error } = await supabase.from("exercises").insert({
      user_id: user.id,
      workout_id: id,
      name: exName.trim(),
      position: exercises.length,
    });
    if (error) return toast.error(error.message);
    setExName("");
    setOpen(false);
    load();
  };

  const addSet = async (exerciseId: string) => {
    if (!user) return;
    const exSets = sets.filter((s) => s.exercise_id === exerciseId);
    const last = exSets[exSets.length - 1];

    let lastReps = last?.reps ?? 10;
    let lastWeight = last?.weight_kg ?? 0;
    if (last && setValues[last.id]) {
      lastReps = setValues[last.id].reps;
      lastWeight = setValues[last.id].weight_kg;
    }

    const { error } = await supabase.from("sets").insert({
      user_id: user.id,
      exercise_id: exerciseId,
      set_number: exSets.length + 1,
      reps: lastReps,
      weight_kg: lastWeight,
    });
    if (error) return toast.error(error.message);
    startRest(restPreset);
    load();
  };

  const finishWorkout = async () => {
    if (!user || !workout) return;
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
          name: workout.name,
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
            completed: false, // resetar completed no template
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

  const removeSet = async (setId: string) => {
    await supabase.from("sets").delete().eq("id", setId);
    load();
  };

  const removeExercise = async (exId: string) => {
    await supabase.from("exercises").delete().eq("id", exId);
    load();
  };

  if (!workout) return <p className="text-muted-foreground">Carregando…</p>;

  const suggestion = (name: string) => {
    const h = history[name];
    if (!h) return null;
    const next = h.reps >= 10 ? h.weight_kg + 2.5 : h.weight_kg;
    return { last: h, next };
  };

  const pct = sets.length > 0 ? Math.round((completedSets.size / sets.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          to="/app/treinos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Treinos
        </Link>
        <Button 
          onClick={finishWorkout} 
          disabled={isFinishing} 
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-1.5 rounded-full shadow-md shrink-0 flex items-center gap-1.5"
        >
          {isFinishing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Finalizar Treino
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">{workout.name}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(workout.workout_date + "T00:00").toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link to="/app/treinos/$id/foco" params={{ id }}>
            <Button size="icon" variant="outline" title="Modo foco">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </Link>
          <Dialog
            open={open}
            onOpenChange={(open) => {
              setOpen(open);
              if (open) {
                supabase
                  .from("exercise_catalog")
                  .select("id,name")
                  .order("name")
                  .then(({ data }) => {
                    if (data) setCatalog(data);
                  });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full">
                <Plus className="h-4 w-4 mr-1" />
                Exercício
              </Button>
            </DialogTrigger>
            <DialogContent className="gap-0 p-0">
              <DialogHeader className="p-4 pb-0">
                <DialogTitle>Novo exercício</DialogTitle>
              </DialogHeader>
              <Command>
                <CommandInput
                  placeholder="Buscar exercício..."
                  value={exName}
                  onValueChange={setExName}
                />
                <CommandList>
                  <CommandEmpty>
                    {exName.trim() ? (
                      <span className="text-xs text-muted-foreground">
                        &quot;{exName}&quot; não está no catálogo.
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Digite para buscar...
                      </span>
                    )}
                  </CommandEmpty>
                  {catalog.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.name}
                      onSelect={(v) => {
                        setExName(v);
                      }}
                    >
                      {item.name}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
              <DialogFooter className="border-t p-3">
                {exName.trim() &&
                  !catalog.some(
                    (c) =>
                      c.name.toLowerCase() === exName.trim().toLowerCase(),
                  ) && (
                    <span className="text-xs text-muted-foreground mr-auto">
                      Nome personalizado
                    </span>
                  )}
                <Button
                  onClick={addExercise}
                  className="rounded-full"
                  disabled={!exName.trim()}
                >
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Progresso e Timer */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3.5 flex flex-col justify-center gap-1.5 bg-card/50 backdrop-blur-sm border">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Progresso</span>
          <div className="flex items-center gap-2">
            <Progress value={pct} className="h-2 flex-1" />
            <span className="text-xs font-semibold tabular-nums shrink-0">{pct}%</span>
          </div>
          <span className="text-[10px] text-muted-foreground">{completedSets.size} de {sets.length} séries</span>
        </Card>
        <Card className="p-3.5 flex items-center justify-between bg-card/50 backdrop-blur-sm border">
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block">Duração</span>
            <span className="text-lg font-display font-bold tabular-nums text-foreground">{formatTime(elapsedTime)}</span>
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={resetWorkout}
            title="Reiniciar treino"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </Card>
      </div>

      {/* Rest timer */}
      <Card className="p-3 flex items-center justify-between gap-3 sticky top-[57px] z-20 shadow-sm">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          <span className="font-display text-2xl font-bold tabular-nums">
            {Math.floor(restSec / 60)
              .toString()
              .padStart(2, "0")}
            :{(restSec % 60).toString().padStart(2, "0")}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {[60, 90, 120, 180].map((s) => (
            <Button
              key={s}
              variant={restPreset === s ? "default" : "outline"}
              size="sm"
              onClick={() => startRest(s)}
            >
              {s}s
            </Button>
          ))}
          {restRunning ? (
            <Button size="icon" variant="ghost" onClick={() => setRestRunning(false)}>
              <Pause className="h-4 w-4" />
            </Button>
          ) : restSec > 0 ? (
            <Button size="icon" variant="ghost" onClick={() => setRestRunning(true)}>
              <Play className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </Card>

      {exercises.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">Nenhum exercício ainda.</Card>
      ) : (
        <div className="space-y-4">
          {exercises.map((ex) => {
            const exSets = sets.filter((s) => s.exercise_id === ex.id);
            return (
              <Card key={ex.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold">{ex.name}</h3>
                  <div className="flex items-center gap-1">
                    <Link to="/app/exercicios/$name" params={{ name: encodeURIComponent(ex.name) }}>
                      <Button variant="ghost" size="icon" title="Histórico">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="icon" onClick={() => removeExercise(ex.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {(() => {
                  const sug = suggestion(ex.name);
                  if (!sug) return null;
                  return (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs">
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-muted-foreground">
                        Última:{" "}
                        <strong className="text-foreground">
                          {sug.last.reps}×{sug.last.weight_kg}kg
                        </strong>
                        {sug.next > sug.last.weight_kg && (
                          <>
                            {" "}
                            · tente <strong className="text-primary">{sug.next}kg</strong>
                          </>
                        )}
                      </span>
                    </div>
                  );
                })()}

                {exSets.length > 0 && (
                  <div className="space-y-2 mb-3">
                    <div className="grid grid-cols-[24px_32px_1fr_1fr_32px] gap-2 text-xs text-muted-foreground px-1">
                      <span>#</span>
                      <span></span>
                      <span>Reps</span>
                      <span>Carga (kg)</span>
                      <span></span>
                    </div>
                    {exSets.map((s) => {
                      const done = completedSets.has(s.id);
                      const curVal = setValues[s.id] ?? { reps: s.reps, weight_kg: Number(s.weight_kg) };
                      return (
                      <div
                        key={s.id}
                        className={cn(
                          "grid grid-cols-[24px_32px_1fr_1fr_32px] gap-2 items-center transition-opacity",
                          done && "opacity-50",
                        )}
                      >
                        <span className="text-sm font-medium text-muted-foreground">
                          {s.set_number}
                        </span>
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
                          disabled={done}
                        />
                        <Input
                          type="number"
                          step="0.5"
                          value={curVal.weight_kg || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateLocalSet(s.id, "weight_kg", Number(e.target.value))}
                          disabled={done}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSet(s.id)}
                          disabled={done}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                      );
                    })}
                  </div>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => addSet(ex.id)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Série
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
