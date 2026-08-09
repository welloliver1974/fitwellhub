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
} from "lucide-react";
import { toast } from "sonner";
import { Heatmap } from "@/components/Heatmap";

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

const WATER_GOAL_ML = 2500;
const CUP_ML = 250;

function TodayPage() {
  const { user, session } = useAuth();
  const [goals, setGoals] = useState<Goals | null>(null);
  const [totals, setTotals] = useState<Totals>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [waterMl, setWaterMl] = useState(0);
  const [lastWeight, setLastWeight] = useState<number | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<{ id: string; name: string } | null>(null);
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
      .select("id, workout_id, name")
      .eq("user_id", userId)
      .gte("completed_at", dayStart)
      .lte("completed_at", dayEnd)
      .order("completed_at", { ascending: false })
      .limit(1);

    if (completedToday && completedToday[0]) {
      // workout_id é nullable — se existir, linka para o template original
      if (completedToday[0].workout_id) {
        return {
          id: completedToday[0].workout_id,
          name: completedToday[0].name,
        };
      }
      // se não tiver template vinculado, vai pro fallback
    }

    // 2. Fallback: sugere o último treino criado como template
    const { data: last } = await supabase
      .from("workouts")
      .select("id,name")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    return last?.[0] ?? null;
  };

  const load = async () => {
    if (!user) return;
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
        calculateTdee({
          headers: { Authorization: `Bearer ${session?.access_token}` },
        }),
      ]);

    const defaults: Goals = { calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 65 };
    let nextGoals = g ?? defaults;
    let source: "suggested" | "custom" | "dataMissing" = "custom";

    if (tdeeRes && tdeeRes.tdee != null && tdeeRes.weight != null) {
      const proteinFactor = g?.protein_factor ?? DEFAULT_PROTEIN_FACTOR;
      const suggested = suggestGoals(tdeeRes.tdee, tdeeRes.weight, proteinFactor);
      // Sincroniza automaticamente quando: não há meta salva, ela ainda é o
      // padrão do signup, ou veio de auto-seed (goal_auto=true). Meta editada
      // à mão (goal_auto=false) nunca é sobrescrita pela sugestão.
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
    setLoading(false);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user]);

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
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const cups = Math.round(waterMl / CUP_ML);

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

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GlassWater className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Água</p>
              <p className="text-xl font-display font-bold">
                {(waterMl / 1000).toFixed(2)} L{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  / {(WATER_GOAL_ML / 1000).toFixed(1)} L
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
        <Progress value={Math.min(100, (waterMl / WATER_GOAL_ML) * 100)} className="h-1.5" />
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

        {todayWorkout ? (
          <Link to="/app/treinos/$id" params={{ id: todayWorkout.id }}>
            <WorkoutCard name={todayWorkout.name} action="Abrir →" />
          </Link>
        ) : (
          <Link to="/app/treinos">
            <WorkoutCard name="Nenhum" action="Criar treino →" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/app/coach">
          <div className="rounded-2xl border bg-card p-4 h-full hover:bg-secondary/50 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Sparkles className="h-4 w-4" /> Coach IA
            </div>
            <p className="text-base font-display font-bold mt-2">Análise da semana</p>
            <p className="text-xs text-muted-foreground mt-1">Insights personalizados →</p>
          </div>
        </Link>
        <Link to="/app/relatorio">
          <div className="rounded-2xl border bg-card p-4 h-full hover:bg-secondary/50 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <FileDown className="h-4 w-4" /> Relatório
            </div>
            <p className="text-base font-display font-bold mt-2">Exportar PDF</p>
            <p className="text-xs text-muted-foreground mt-1">7 dias completos →</p>
          </div>
        </Link>
      </div>

      <Heatmap />
    </div>
  );
}

function WorkoutCard({ name, action }: { name: string; action: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 h-full hover:bg-secondary/50 transition-colors">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Dumbbell className="h-4 w-4" /> Treino de hoje
      </div>
      <p className="text-base font-display font-bold mt-2 truncate">{name}</p>
      <p className="text-xs text-muted-foreground mt-1">{action}</p>
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
