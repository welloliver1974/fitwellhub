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

import {
  calculateRemainingSeconds,
  requestRestNotificationPermission,
  triggerRestCompletedAlert,
} from "@/lib/rest-timer-service";
import { Bell, BellRing } from "lucide-react";

import {
  isCardioExercise,
  parseCardioMeta,
  calculateCardioCalories,
  formatCardioSummary,
} from "@/lib/cardio-utils";

export const Route = createFileRoute("/app/treinos/$id/foco")({
  component: FocusMode,
});

type Exercise = { id: string; name: string; position: number; notes?: string | null };
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
  const [restTargetTime, setRestTargetTime] = useState<number | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");
  const [userWeightKg, setUserWeightKg] = useState<number>(75);
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

  const startRestTimer = (seconds: number) => {
    const target = Date.now() + seconds * 1000;
    setRestTargetTime(target);
    setRestSec(seconds);
    setRestRunning(true);
  };

  const pauseRestTimer = () => {
    setRestRunning(false);
    setRestTargetTime(null);
  };

  const resumeRestTimer = () => {
    if (restSec <= 0) return;
    const target = Date.now() + restSec * 1000;
    setRestTargetTime(target);
    setRestRunning(true);
  };

  const enableNotifications = async () => {
    const res = await requestRestNotificationPermission();
    setNotifPermission(res);
    if (res === "granted") {
      toast.success("Avisos com tela bloqueada ativados!");
    } else {
      toast.error("Permissão de notificação negada no navegador.");
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

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
        startRestTimer(restPreset); // Auto inicia o timer com tempo absoluto
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

  // Timer com cálculo por target timestamp absoluto
  useEffect(() => {
    if (restRunning && restTargetTime) {
      const tick = () => {
        const remaining = calculateRemainingSeconds(restTargetTime);
        setRestSec(remaining);
        if (remaining <= 0) {
          setRestRunning(false);
          setRestTargetTime(null);
          const currentExName = nameOverrides[exercises[idx]?.id] || exercises[idx]?.name;
          triggerRestCompletedAlert({ exerciseName: currentExName, workoutId: id });
          toast.success("Descanso terminado!");
        }
      };

      tick();
      intervalRef.current = setInterval(tick, 500);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [restRunning, restTargetTime, exercises, idx, id, nameOverrides]);

  // Ao voltar para a aba ou desbloquear o aparelho, recalcula imediatamente
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && restRunning && restTargetTime) {
        const remaining = calculateRemainingSeconds(restTargetTime);
        setRestSec(remaining);
        if (remaining <= 0) {
          setRestRunning(false);
          setRestTargetTime(null);
          const currentExName = nameOverrides[exercises[idx]?.id] || exercises[idx]?.name;
          triggerRestCompletedAlert({ exerciseName: currentExName, workoutId: id });
          toast.success("Descanso terminado!");
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [restRunning, restTargetTime, exercises, idx, id, nameOverrides]);

  const load = async () => {
    const { data: w } = await supabase
      .from("workouts")
      .select("name")
      .eq("id", id)
      .maybeSingle();
    if (w) setWorkoutName(w.name);

    const { data: ex } = await supabase
      .from("exercises")
      .select("id,name,position,notes")
      .eq("workout_id", id)
      .order("position");
    setExercises((ex ?? []) as Exercise[]);

    // Carregar peso corporal mais recente para cálculo calórico
    if (user?.id) {
      supabase
        .from("body_weights")
        .select("weight_kg")
        .eq("user_id", user.id)
        .order("log_date", { ascending: false })
        .limit(1)
        .then(({ data: wData }) => {
          if (wData?.[0]?.weight_kg) {
            setUserWeightKg(Number(wData[0].weight_kg));
          }
        });
    }
    
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
    const currentMeta = parseCardioMeta(ex.notes, exDisplayName);
    const isCardio = currentMeta.isCardio;
    const exSets = sets.filter((s) => s.exercise_id === ex.id);
    const last = exSets[exSets.length - 1];

    let lastReps = last?.reps ?? (isCardio ? 20 : 10);
    let lastWeight = last?.weight_kg ?? (isCardio ? 4 : 0);
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
    if (!isCardio) {
      setRestSec(restPreset);
      setRestRunning(true);
    }
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
      // 0. Montar resumo de cardio para as observações da sessão e Coach IA
      const cardioSummaries: string[] = [];
      exercises.forEach((item) => {
        const itemDisplayName = nameOverrides[item.id] ?? item.name;
        const meta = parseCardioMeta(item.notes, itemDisplayName);
        if (meta.isCardio) {
          const itemSets = sets.filter((s) => s.exercise_id === item.id && completedSets.has(s.id));
          if (itemSets.length > 0) {
            const totalMins = itemSets.reduce((acc, s) => {
              const val = setValues[s.id] ?? { reps: s.reps };
              return acc + (Number(val.reps) || 0);
            }, 0);
            const avgSpeed =
              itemSets.reduce((acc, s) => {
                const val = setValues[s.id] ?? { weight_kg: s.weight_kg };
                return acc + (Number(val.weight_kg) || 0);
              }, 0) / itemSets.length;
            cardioSummaries.push(
              formatCardioSummary({
                name: itemDisplayName,
                durationMin: totalMins,
                speedKmh: avgSpeed,
                inclinePct: meta.inclinePct,
                weightKg: userWeightKg,
              })
            );
          }
        }
      });

      const sessionNotes = cardioSummaries.length > 0 ? cardioSummaries.join("\n") : null;

      // 1. Criar sessão de treino finalizada
      const { data: session, error: sessError } = await supabase
        .from("workout_sessions")
        .insert({
          user_id: user.id,
          workout_id: id,
          name: workoutName || "Treino",
          completed_at: new Date().toISOString(),
          notes: sessionNotes,
        })
        .select()
        .single();

      if (sessError) throw sessError;

      // 2. Inserir séries realizadas (sets) na nova tabela workout_session_sets
      const sessionSetsToInsert = sets.map((s) => {
        const val = setValues[s.id] ?? { reps: s.reps, weight_kg: Number(s.weight_kg) };
        const isDone = completedSets.has(s.id);
        const originalEx = exercises.find((e) => e.id === s.exercise_id);
        const resolvedName = originalEx
          ? (nameOverrides[originalEx.id] ?? originalEx.name)
          : "Exercício";
        return {
          session_id: session.id,
          user_id: user.id,
          exercise_name: resolvedName,
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

        {(() => {
          const currentCardioMeta = ex ? parseCardioMeta(ex.notes, exDisplayName) : { isCardio: false };
          const isCurrentCardio = currentCardioMeta.isCardio;
          const currentTotalMins = exSets.reduce((sum, s) => {
            const val = setValues[s.id] ?? { reps: s.reps };
            return sum + (Number(val.reps) || 0);
          }, 0);
          const currentAvgSpeed =
            exSets.length > 0
              ? exSets.reduce((sum, s) => {
                  const val = setValues[s.id] ?? { weight_kg: s.weight_kg };
                  return sum + (Number(val.weight_kg) || 0);
                }, 0) / exSets.length
              : 0;
          const currentEstKcal = calculateCardioCalories({
            durationMin: currentTotalMins,
            speedKmh: currentAvgSpeed,
            inclinePct: currentCardioMeta.inclinePct,
            weightKg: userWeightKg,
          });

          return (
            <>
              {isCurrentCardio ? (
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/25 text-xs font-medium mt-2 shadow-xs">
                  <span>🏃 Cardio Aeróbico</span>
                  {currentCardioMeta.inclinePct != null && currentCardioMeta.inclinePct > 0 && (
                    <span>• {currentCardioMeta.inclinePct}% inclinação</span>
                  )}
                  {currentEstKcal > 0 && <span>• 🔥 ~{currentEstKcal} kcal</span>}
                </div>
              ) : history[exDisplayName] ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/80 text-secondary-foreground text-xs font-medium mt-2 shadow-xs">
                  <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>
                    Melhor carga: <strong>{history[exDisplayName].weight_kg} kg</strong> × {history[exDisplayName].reps} reps
                  </span>
                </div>
              ) : null}

              <div className="my-8 text-center">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  {isCurrentCardio ? "Tempo de Cardio" : "Descanso"}
                </p>
                <p className="text-7xl font-display font-bold tabular-nums text-primary">
                  {Math.floor(restSec / 60)
                    .toString()
                    .padStart(2, "0")}
                  :{(restSec % 60).toString().padStart(2, "0")}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                  {(isCurrentCardio ? [900, 1200, 1800, 2400] : [60, 90, 120, 180]).map((s) => (
                    <Button
                      key={s}
                      variant={restPreset === s ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setRestPreset(s);
                        startRestTimer(s);
                      }}
                    >
                      {isCurrentCardio ? `${Math.floor(s / 60)}m` : `${s}s`}
                    </Button>
                  ))}
                  {restSec > 0 &&
                    (restRunning ? (
                      <Button size="icon" variant="ghost" onClick={pauseRestTimer} title="Pausar">
                        <Pause className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button size="icon" variant="ghost" onClick={resumeRestTimer} title="Retomar">
                        <Play className="h-4 w-4" />
                      </Button>
                    ))}
                </div>

                <div className="flex items-center justify-center mt-3">
                  {notifPermission === "granted" ? (
                    <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-500 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-full">
                      <BellRing className="h-3 w-3" />
                      <span>Aviso com tela bloqueada ativo</span>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={enableNotifications}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5 rounded-full border border-dashed border-border px-2.5"
                    >
                      <Bell className="h-3 w-3" />
                      <span>Ativar avisos com tela apagada</span>
                    </Button>
                  )}
                </div>
              </div>

              <div className="w-full max-w-md space-y-2">
                {exSets.length > 0 && (
                  <div className="grid grid-cols-[40px_28px_1fr_1fr_36px] gap-2 px-2 text-xs font-semibold text-muted-foreground text-center">
                    <span>#</span>
                    <span></span>
                    <span>{isCurrentCardio ? "Tempo (min)" : "Reps"}</span>
                    <span>{isCurrentCardio ? "Velocidade (km/h)" : "Carga (kg)"}</span>
                    <span></span>
                  </div>
                )}
                {exSets.map((s) => {
                  const done = completedSets.has(s.id);
                  const curVal = setValues[s.id] ?? { reps: s.reps, weight_kg: Number(s.weight_kg) };
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "grid grid-cols-[40px_28px_1fr_1fr_36px] items-center gap-2 rounded-xl bg-card border p-2 transition-opacity",
                        done && "opacity-50"
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
                        min="1"
                        value={curVal.reps || ""}
                        placeholder={isCurrentCardio ? "min" : "reps"}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateLocalSet(s.id, "reps", Number(e.target.value))}
                        className="text-center text-lg font-medium"
                        disabled={done}
                      />
                      <Input
                        type="number"
                        step={isCurrentCardio ? "0.1" : "0.5"}
                        min="0"
                        value={curVal.weight_kg || ""}
                        placeholder={isCurrentCardio ? "km/h" : "kg"}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateLocalSet(s.id, "weight_kg", Number(e.target.value))}
                        className="text-center text-lg font-medium"
                        disabled={done}
                      />
                      <Check className={cn("h-5 w-5 mx-auto", done ? "text-primary" : "text-muted-foreground/30")} />
                      {isCurrentCardio && (
                        <div className="col-span-5 flex items-center justify-center gap-1.5 pt-2 pb-1 flex-wrap border-t border-border/40 mt-1">
                          <span className="text-[10px] text-muted-foreground font-medium mr-0.5">Duração:</span>
                          {[15, 20, 30, 40, 45, 60].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              disabled={done}
                              onClick={() => updateLocalSet(s.id, "reps", mins)}
                              className={cn(
                                "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer",
                                curVal.reps === mins
                                  ? "bg-amber-500 text-white border-amber-500 font-semibold shadow-xs"
                                  : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground border-border"
                              )}
                            >
                              {mins} min
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button onClick={addSet} variant="secondary" className="w-full h-12 text-base">
                  <Plus className="h-4 w-4 mr-1" />
                  {isCurrentCardio ? "Adicionar etapa / bloco" : "Adicionar série"}
                </Button>
              </div>
            </>
          );
        })()}
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
