import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLocalDate, todayBoundsSaoPaulo } from "@/lib/utils";
import {
  DEFAULT_PROTEIN_FACTOR,
  isDefaultGoals,
  matchesSuggestion,
  shouldAutoUpdateGoal,
  suggestGoals,
} from "@/lib/nutrition-goals";
import { calculateTdee } from "@/server-fns/corpo.functions";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Flame,
  Beef,
  Wheat,
  Droplet,
  GlassWater,
  Scale,
  Target,
  Plus,
  Minus,
  Dumbbell,
  Sparkles,
  FileDown,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Heatmap } from "@/components/Heatmap";
import { DailyBriefingCard } from "@/components/daily-briefing-card";
import { StepsCard } from "@/components/steps-card";
import { SafeBoundary } from "@/components/safe-boundary";
import { determineNextWorkout } from "@/lib/workout-rotation";

export const Route = createFileRoute("/app/")({
  component: TodayPage,
});

type Goals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  goal_auto?: boolean;
  protein_factor?: number | null;
};
type Totals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

type CompletedExercise = {
  name: string;
  setsCount: number;
  maxWeight: number;
  sets: { set_number: number; reps: number; weight_kg: number; completed: boolean }[];
};

type TodayCompletedWorkout = {
  id: string;
  name: string;
  workout_id: string | null;
  completed_at: string;
  exercises: CompletedExercise[];
  totalVolume: number;
  totalSets: number;
};

const BASE_WATER_GOAL_ML = 2500;
const CUP_ML = 250;

function formatSessionTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TodayPage() {
  const { user, session } = useAuth();
  const [goals, setGoals] = useState<Goals | null>(null);
  const [totals, setTotals] = useState<Totals>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [waterMl, setWaterMl] = useState(0);
  const [lastWeight, setLastWeight] = useState<number | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<{ id: string; name: string } | null>(null);
  const [hasCompletedWorkoutToday, setHasCompletedWorkoutToday] = useState(false);
  const [completedWorkoutToday, setCompletedWorkoutToday] = useState<TodayCompletedWorkout | null>(null);
  const [plannedExercises, setPlannedExercises] = useState<string[]>([]);
  const [weightOpen, setWeightOpen] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [loading, setLoading] = useState(true);
  // Meta de calorias calculada (TDEE): fonte da meta exibida no card.
  const [goalSource, setGoalSource] = useState<"suggested" | "custom" | "dataMissing">("custom");
  const [tdeeGoal, setTdeeGoal] = useState<{ bmr: number; activityFactor: number } | null>(null);

  const today = getLocalDate();

  const findTodayWorkout = async (userId: string) => {
    const { start: dayStart, end: dayEnd } = todayBoundsSaoPaulo();
    const { data: completedToday } = await supabase
      .from("workout_sessions")
      .select("id, workout_id, name, completed_at")
      .eq("user_id", userId)
      .gte("completed_at", dayStart)
      .lte("completed_at", dayEnd)
      .order("completed_at", { ascending: false })
      .limit(1);

    if (completedToday && completedToday[0]) {
      const sess = completedToday[0];
      setHasCompletedWorkoutToday(true);

      // Buscar séries e exercícios da sessão concluída
      const { data: setsData } = await supabase
        .from("workout_session_sets")
        .select("exercise_name, set_number, reps, weight_kg, completed")
        .eq("session_id", sess.id)
        .order("set_number", { ascending: true });

      const exercises: CompletedExercise[] = [];
      let totalVol = 0;
      let totalSets = 0;

      if (setsData && setsData.length > 0) {
        const map = new Map<string, typeof setsData>();
        for (const s of setsData) {
          if (!map.has(s.exercise_name)) map.set(s.exercise_name, []);
          map.get(s.exercise_name)!.push(s);
        }

        map.forEach((sList, exName) => {
          let maxW = 0;
          let compCount = 0;
          for (const item of sList) {
            const w = Number(item.weight_kg) || 0;
            const r = Number(item.reps) || 0;
            if (w > maxW) maxW = w;
            if (item.completed) {
              compCount++;
              totalVol += w * r;
            }
          }
          totalSets += compCount || sList.length;
          exercises.push({
            name: exName,
            setsCount: compCount || sList.length,
            maxWeight: maxW,
            sets: sList.map((it) => ({
              set_number: it.set_number,
              reps: it.reps,
              weight_kg: Number(it.weight_kg) || 0,
              completed: it.completed,
            })),
          });
        });
      }

      setCompletedWorkoutToday({
        id: sess.id,
        name: sess.name,
        workout_id: sess.workout_id,
        completed_at: sess.completed_at,
        exercises,
        totalVolume: totalVol,
        totalSets,
      });

      if (sess.workout_id) {
        return {
          id: sess.workout_id,
          name: sess.name,
        };
      }
      return {
        id: sess.id,
        name: sess.name,
      };
    } else {
      setHasCompletedWorkoutToday(false);
      setCompletedWorkoutToday(null);
    }

    // 2. Rotação Inteligente de Divisão (Split Sequencer):
    // Busca todos os treinos do usuário e a última sessão finalizada no histórico
    const [{ data: allWorkouts }, { data: lastSessions }] = await Promise.all([
      supabase
        .from("workouts")
        .select("id, name, created_at, workout_date")
        .eq("user_id", userId),
      supabase
        .from("workout_sessions")
        .select("id, workout_id, name, completed_at")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(1),
    ]);

    const next = determineNextWorkout({
      workouts: allWorkouts ?? [],
      lastCompletedSession: lastSessions?.[0] ?? null,
    });

    if (next) {
      // Buscar exercícios cadastrados na ficha
      const { data: exData } = await supabase
        .from("exercises")
        .select("name")
        .eq("workout_id", next.id)
        .order("position", { ascending: true })
        .limit(6);
      setPlannedExercises((exData ?? []).map((e) => e.name));
      return { id: next.id, name: next.name };
    }

    setPlannedExercises([]);
    return null;
  };

  const load = async () => {
    if (!user) return;
    try {
      const [{ data: g }, { data: meals }, { data: water }, { data: weight }, tdeeRes] =
        await Promise.all([
          supabase
            .from("goals")
            .select("calories,protein_g,carbs_g,fat_g,goal_auto,protein_factor")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase.from("meals").select("id").eq("user_id", user.id).eq("meal_date", today),
          supabase.from("water_logs").select("ml").eq("user_id", user.id).eq("log_date", today),
          supabase
            .from("body_weights")
            .select("weight_kg")
            .eq("user_id", user.id)
            .order("log_date", { ascending: false })
            .limit(1),
          session?.access_token
            ? calculateTdee({
                headers: { Authorization: `Bearer ${session.access_token}` },
              }).catch((err) => {
                console.warn("Aviso ao calcular TDEE:", err);
                return null;
              })
            : Promise.resolve(null),
        ]);

      const defaults: Goals = { calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 65 };
      let nextGoals = g ?? defaults;
      let source: "suggested" | "custom" | "dataMissing" = "custom";

      if (tdeeRes && tdeeRes.tdee != null && tdeeRes.weight != null) {
        const proteinFactor = g?.protein_factor ?? DEFAULT_PROTEIN_FACTOR;
        const suggested = suggestGoals(tdeeRes.tdee, tdeeRes.weight, proteinFactor);
        const auto = shouldAutoUpdateGoal(g, g?.goal_auto);
        if (auto && !matchesSuggestion(g, tdeeRes.tdee, tdeeRes.weight, proteinFactor)) {
          await supabase
            .from("goals")
            .upsert(
              { user_id: user.id, ...suggested, goal_auto: true, protein_factor: proteinFactor },
              { onConflict: "user_id" },
            );
        }
        if (auto) nextGoals = suggested;
        source = matchesSuggestion(nextGoals, tdeeRes.tdee, tdeeRes.weight, proteinFactor)
          ? "suggested"
          : "custom";
        setTdeeGoal({ bmr: tdeeRes.bmr ?? 0, activityFactor: tdeeRes.activityFactor ?? 1.2 });
      } else {
        source = "dataMissing";
        setTdeeGoal(null);
      }

      setGoals(nextGoals);
      setGoalSource(source);
      setWaterMl((water ?? []).reduce((a, w) => a + (w.ml || 0), 0));
      setLastWeight(weight && weight[0] ? Number(weight[0].weight_kg) : null);
      setTodayWorkout(await findTodayWorkout(user.id));

      const ids = (meals ?? []).map((m) => m.id);
      if (ids.length) {
        const { data: items } = await supabase
          .from("meal_items")
          .select("calories,protein_g,carbs_g,fat_g")
          .in("meal_id", ids);
        const t = (items ?? []).reduce(
          (a, i) => ({
            calories: a.calories + Number(i.calories || 0),
            protein_g: a.protein_g + Number(i.protein_g || 0),
            carbs_g: a.carbs_g + Number(i.carbs_g || 0),
            fat_g: a.fat_g + Number(i.fat_g || 0),
          }),
          { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
        );
        setTotals(t);
      } else {
        setTotals({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
      }
    } catch (err) {
      console.error("Erro ao carregar dados da página Hoje:", err);
      // Garante metas de fallback mesmo em caso de erro no Supabase
      if (!goals) {
        setGoals({ calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 65 });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user, session]);

  const addWater = async (delta: number) => {
    if (!user) return;
    const nextTotal = Math.max(0, waterMl + delta);
    setWaterMl(nextTotal);
    if (delta > 0) {
      await supabase.from("water_logs").insert({ user_id: user.id, log_date: today, ml: delta });
    } else {
      // remove most recent log of -delta ml or just delete latest
      const { data: last } = await supabase
        .from("water_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("log_date", today)
        .order("created_at", { ascending: false })
        .limit(1);
      if (last && last[0]) await supabase.from("water_logs").delete().eq("id", last[0].id);
    }
  };

  const saveWeight = async () => {
    const v = Number(weightInput.replace(",", "."));
    if (!user || !v || v <= 0) return;
    const { error } = await supabase
      .from("body_weights")
      .insert({ user_id: user.id, log_date: today, weight_kg: v });
    if (error) return toast.error(error.message);
    toast.success("Peso registrado");
    setWeightInput("");
    setWeightOpen(false);
    load();
  };

  if (loading || !goals) return <p className="text-muted-foreground">Carregando…</p>;

  const todayLabel = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const cups = Math.round(waterMl / CUP_ML);
  const waterGoalMl = hasCompletedWorkoutToday ? BASE_WATER_GOAL_ML + 500 : BASE_WATER_GOAL_ML;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground capitalize">{todayLabel}</p>
          <h1 className="text-3xl font-display font-bold mt-1">Hoje</h1>
        </div>
        <Link to="/app/metas">
          <Button variant="ghost" size="icon">
            <Target className="h-5 w-5" />
          </Button>
        </Link>
      </div>

      {/* Daily Briefing do Coach IA com isolamento de erro defensivo */}
      <SafeBoundary name="DailyBriefingCard">
        <DailyBriefingCard
          userId={user?.id}
          userName={user?.user_metadata?.full_name || user?.user_metadata?.display_name || user?.user_metadata?.name}
          workoutName={todayWorkout?.name}
          hasWorkoutToday={hasCompletedWorkoutToday}
          caloriesConsumed={totals.calories}
          caloriesGoal={goals.calories}
          proteinConsumed={totals.protein_g}
          proteinGoal={goals.protein_g}
          waterMl={waterMl}
          waterGoal={waterGoalMl}
        />
      </SafeBoundary>

      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Calorias</p>
            <p className="text-4xl font-display font-bold mt-1">
              {Math.round(totals.calories)}
              <span className="text-lg text-muted-foreground font-normal"> / {goals.calories}</span>
            </p>
          </div>
          <Flame className="h-8 w-8 text-primary" />
        </div>
        <Progress
          value={Math.min(100, (totals.calories / goals.calories) * 100)}
          className="mt-4"
        />
        {goalSource === "suggested" && tdeeGoal ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Meta calculada · TMB {tdeeGoal.bmr} × atividade{" "}
            {tdeeGoal.activityFactor.toLocaleString("pt-BR")}
          </p>
        ) : goalSource === "dataMissing" ? (
          <Link
            to="/app/corpo"
            className="mt-3 block text-xs text-primary underline-offset-4 hover:underline"
          >
            Preencha peso/altura p/ calcular sua meta
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MacroCard
          icon={<Beef className="h-4 w-4" />}
          label="Proteína"
          value={totals.protein_g}
          goal={goals.protein_g}
        />
        <MacroCard
          icon={<Wheat className="h-4 w-4" />}
          label="Carbo"
          value={totals.carbs_g}
          goal={goals.carbs_g}
        />
        <MacroCard
          icon={<Droplet className="h-4 w-4" />}
          label="Gordura"
          value={totals.fat_g}
          goal={goals.fat_g}
        />
      </div>

      {/* Card de Passos & Gasto Ativo com isolamento de erro defensivo */}
      <SafeBoundary name="StepsCard">
        <StepsCard userId={user?.id} dailyStepGoal={10000} />
      </SafeBoundary>

      {/* Card de Destaque: Treino de Hoje & Exercícios Realizados */}
      {hasCompletedWorkoutToday && completedWorkoutToday ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-card p-5 relative overflow-hidden shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 tracking-wide uppercase">
                    Treino Concluído Hoje
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    às {formatSessionTime(completedWorkoutToday.completed_at)}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-display font-bold text-foreground truncate">
                  {completedWorkoutToday.name}
                </h2>
              </div>
            </div>

            <Link to="/app/treinos">
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground shrink-0">
                Histórico →
              </Button>
            </Link>
          </div>

          {/* Métricas do treino */}
          <div className="flex items-center gap-1.5 sm:gap-2 mt-3 flex-wrap">
            <span className="text-[11px] sm:text-xs px-2.5 py-1 rounded-full bg-secondary font-medium text-foreground">
              {completedWorkoutToday.exercises.length} {completedWorkoutToday.exercises.length === 1 ? "exercício" : "exercícios"}
            </span>
            {completedWorkoutToday.totalSets > 0 && (
              <span className="text-[11px] sm:text-xs px-2.5 py-1 rounded-full bg-secondary font-medium text-foreground">
                {completedWorkoutToday.totalSets} séries
              </span>
            )}
            {completedWorkoutToday.totalVolume > 0 && (
              <span className="text-[11px] sm:text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                {Math.round(completedWorkoutToday.totalVolume).toLocaleString("pt-BR")} kg de volume
              </span>
            )}
          </div>

          {/* Lista de exercícios realizados em Carrossel Horizontal */}
          {completedWorkoutToday.exercises.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>Exercícios realizados ({completedWorkoutToday.exercises.length}):</span>
                <span className="text-[11px] text-muted-foreground/80 flex items-center gap-1">
                  deslize para o lado <ChevronRight className="h-3 w-3" />
                </span>
              </div>
              <div className="-mx-5 px-5 flex items-stretch gap-2.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-none snap-x snap-mandatory touch-pan-x">
                {completedWorkoutToday.exercises.map((ex, i) => (
                  <Link
                    key={i}
                    to="/app/exercicios/$name"
                    params={{ name: encodeURIComponent(ex.name) }}
                    className="w-[165px] sm:w-[185px] shrink-0 p-3 rounded-2xl bg-secondary/40 border border-border/40 hover:bg-secondary/70 hover:border-primary/30 transition-all flex flex-col justify-between gap-2.5 group snap-start select-none"
                    title="Ver gráfico e evolução deste exercício"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                          <Dumbbell className="h-3 w-3" />
                        </div>
                        {ex.maxWeight > 0 && (
                          <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 rounded-md bg-primary/10">
                            {ex.maxWeight} kg
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm font-semibold line-clamp-2 text-foreground group-hover:text-primary transition-colors leading-snug">
                        {ex.name}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1.5 border-t border-border/30">
                      <span>
                        {ex.setsCount} {ex.setsCount === 1 ? "série" : "séries"}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground italic">
              Treino finalizado com sucesso.
            </p>
          )}
        </div>
      ) : todayWorkout ? (
        <div className="rounded-2xl border bg-card p-5 relative overflow-hidden shadow-sm hover:border-primary/30 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Dumbbell className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-primary tracking-wide uppercase">
                  Treino Sugerido para Hoje
                </span>
                <h2 className="text-base sm:text-lg font-display font-bold text-foreground truncate">
                  {todayWorkout.name}
                </h2>
              </div>
            </div>

            <Link to="/app/treinos/$id" params={{ id: todayWorkout.id }}>
              <Button size="sm" className="rounded-full h-8 px-3.5 text-xs font-medium gap-1 shadow-sm shrink-0">
                Iniciar Treino
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          {plannedExercises.length > 0 && (
            <div className="mt-3.5 pt-3 border-t border-border/40">
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">
                Exercícios programados ({plannedExercises.length}):
              </p>
              <div className="-mx-5 px-5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none touch-pan-x">
                {plannedExercises.map((name, i) => (
                  <span
                    key={i}
                    className="text-[11px] sm:text-xs px-2.5 py-1 rounded-lg bg-secondary/60 text-secondary-foreground font-medium shrink-0 whitespace-nowrap"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-4 sm:p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Treino de hoje</p>
              <p className="text-sm font-semibold truncate">Nenhum treino agendado</p>
            </div>
          </div>
          <Link to="/app/treinos">
            <Button variant="outline" size="sm" className="rounded-full text-xs h-8 shrink-0">
              Escolher treino →
            </Button>
          </Link>
        </div>
      )}

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GlassWater className="h-5 w-5 text-primary" />
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Água</p>
                {hasCompletedWorkoutToday && (
                  <span className="text-[10px] bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded-full">
                    +500ml treino
                  </span>
                )}
              </div>
              <p className="text-xl font-display font-bold">
                {(waterMl / 1000).toFixed(2)} L{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  / {(waterGoalMl / 1000).toFixed(1)} L
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full h-9 w-9"
              onClick={() => addWater(-CUP_ML)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-10 text-center font-medium text-sm">{cups}</span>
            <Button size="icon" className="rounded-full h-9 w-9" onClick={() => addWater(CUP_ML)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Progress value={Math.min(100, (waterMl / waterGoalMl) * 100)} className="h-1.5" />
        <p className="text-[10px] text-muted-foreground mt-2">Cada copo = {CUP_ML} ml</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/app/peso">
          <div className="rounded-2xl border bg-card p-4 h-full hover:bg-secondary/50 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Scale className="h-4 w-4" /> Peso atual
            </div>
            <p className="text-2xl font-display font-bold mt-2">
              {lastWeight ? `${lastWeight.toFixed(1)} kg` : "—"}
            </p>
            <Dialog open={weightOpen} onOpenChange={setWeightOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 -ml-2 h-7 text-xs text-primary"
                  onClick={(e) => {
                    e.preventDefault();
                    setWeightOpen(true);
                  }}
                >
                  + Registrar
                </Button>
              </DialogTrigger>
              <DialogContent onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                  <DialogTitle>Registrar peso</DialogTitle>
                </DialogHeader>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Ex: 78.5"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  autoFocus
                />
                <DialogFooter>
                  <Button onClick={saveWeight}>Salvar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </Link>

        <Link to="/app/coach">
          <div className="rounded-2xl border bg-card p-4 h-full hover:bg-secondary/50 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Sparkles className="h-4 w-4" /> Coach IA
            </div>
            <p className="text-base font-display font-bold mt-2">Análise da semana</p>
            <p className="text-xs text-muted-foreground mt-1">Insights personalizados →</p>
          </div>
        </Link>
      </div>

      <Link to="/app/relatorio" className="block">
        <div className="rounded-2xl border bg-card p-4 hover:bg-secondary/50 transition-colors flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FileDown className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Relatório Semanal</p>
              <p className="text-xs text-muted-foreground">Exportar PDF com resumo dos últimos 7 dias</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>

      <Heatmap />
    </div>
  );
}

function MacroCard({
  icon,
  label,
  value,
  goal,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  goal: number;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {icon} {label}
      </div>
      <p className="text-xl font-display font-bold mt-2">
        {Math.round(value)}
        <span className="text-xs text-muted-foreground font-normal">/{goal}g</span>
      </p>
      <Progress value={Math.min(100, (value / goal) * 100)} className="mt-2 h-1.5" />
    </div>
  );
}
