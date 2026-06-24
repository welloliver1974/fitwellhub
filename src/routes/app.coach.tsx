import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLocalDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { coachAdvice } from "@/server-fns/nutrition.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/coach")({
  component: CoachPage,
});

type CoachSnapshot = {
  confidence: "baixa" | "media" | "alta";
  nextAction: string;
  sources: string[];
};

type CoachPlan = {
  title: string;
  objective: string;
  focus: string;
  todaySummary: string;
  trainingGoal: string;
  nutritionGoal: string;
  trackingGoal: string;
  nextAction: string;
  checklist: string[];
};

type CoachObjective = "auto" | "Emagrecimento" | "Hipertrofia" | "Recomposicao corporal" | "Manutencao";

function CoachPage() {
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string>("");
  const [snapshot, setSnapshot] = useState<CoachSnapshot | null>(null);
  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [objective, setObjective] = useState<CoachObjective>("auto");

  const confidenceLabel: Record<CoachSnapshot["confidence"], string> = {
    baixa: "Baixa",
    media: "Média",
    alta: "Alta",
  };

  const generate = async () => {
    if (!user) return;
    setLoading(true);
    setText("");
    setSnapshot(null);
    setPlan(null);
    try {
      const start = getLocalDate(new Date(Date.now() - 7 * 86400000));
      const today = getLocalDate();

      const [
        { data: goals },
        { data: meals },
        { data: workouts },
        { data: weights },
        { data: water },
      ] = await Promise.all([
        supabase
          .from("goals")
          .select("calories,protein_g,carbs_g,fat_g")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("meals")
          .select("id,meal_date,meal_type")
          .eq("user_id", user.id)
          .gte("meal_date", start)
          .lte("meal_date", today),
        supabase
          .from("workouts")
          .select("id,name,workout_date")
          .eq("user_id", user.id)
          .gte("workout_date", start)
          .lte("workout_date", today),
        supabase
          .from("body_weights")
          .select("weight_kg,log_date")
          .eq("user_id", user.id)
          .gte("log_date", start)
          .order("log_date"),
        supabase
          .from("water_logs")
          .select("ml,log_date")
          .eq("user_id", user.id)
          .gte("log_date", start),
      ]);

      const mealIds = (meals ?? []).map((m) => m.id);
      let items: Array<{
        meal_id: string;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
      }> = [];
      if (mealIds.length) {
        const { data: its } = await supabase
          .from("meal_items")
          .select("meal_id,calories,protein_g,carbs_g,fat_g")
          .in("meal_id", mealIds);
        items = (its ?? []).map((i) => ({
          meal_id: i.meal_id as string,
          calories: Number(i.calories),
          protein_g: Number(i.protein_g),
          carbs_g: Number(i.carbs_g),
          fat_g: Number(i.fat_g),
        }));
      }

      const perDay = new Map<
        string,
        { kcal: number; p: number; c: number; f: number; water: number }
      >();
      for (const m of meals ?? []) {
        const day = m.meal_date as string;
        const tot = items
          .filter((i) => i.meal_id === m.id)
          .reduce(
            (a, i) => ({
              kcal: a.kcal + i.calories,
              p: a.p + i.protein_g,
              c: a.c + i.carbs_g,
              f: a.f + i.fat_g,
              water: 0,
            }),
            { kcal: 0, p: 0, c: 0, f: 0, water: 0 },
          );
        const cur = perDay.get(day) ?? { kcal: 0, p: 0, c: 0, f: 0, water: 0 };
        perDay.set(day, {
          ...cur,
          kcal: cur.kcal + tot.kcal,
          p: cur.p + tot.p,
          c: cur.c + tot.c,
          f: cur.f + tot.f,
        });
      }
      for (const w of water ?? []) {
        const cur = perDay.get(w.log_date as string) ?? { kcal: 0, p: 0, c: 0, f: 0, water: 0 };
        cur.water += Number(w.ml);
        perDay.set(w.log_date as string, cur);
      }

      const days = Array.from(perDay.entries()).sort();
      const lines = days.map(
        ([d, t]) =>
          `- ${d}: ${Math.round(t.kcal)} kcal · P${Math.round(t.p)} C${Math.round(t.c)} G${Math.round(t.f)} · água ${Math.round(t.water)}ml`,
      );

      const summary = [
        `Metas: ${goals?.calories ?? 2000} kcal · P ${goals?.protein_g ?? 140}g · C ${goals?.carbs_g ?? 220}g · G ${goals?.fat_g ?? 65}g`,
        `Treinos na semana: ${(workouts ?? []).length} (${(workouts ?? []).map((w) => w.name).join(", ") || "nenhum"})`,
        `Pesos: ${(weights ?? []).map((w) => `${w.log_date}=${w.weight_kg}kg`).join(", ") || "sem registros"}`,
        `Água: ${(water ?? []).length} registros`,
        `Diário (últimos 7 dias):`,
        ...lines,
      ].join("\n");

      const res = await coachAdvice({
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        data: {
          summary,
          objective: objective === "auto" ? undefined : objective,
          goals: {
            calories: Number(goals?.calories ?? 0),
            protein_g: Number(goals?.protein_g ?? 0),
            carbs_g: Number(goals?.carbs_g ?? 0),
            fat_g: Number(goals?.fat_g ?? 0),
          },
          stats: {
            mealCount: meals?.length ?? 0,
            workoutCount: workouts?.length ?? 0,
            weightCount: weights?.length ?? 0,
            waterCount: water?.length ?? 0,
          },
        },
      });
      setText(res.text);
      setSnapshot(res.snapshot ?? null);
      setPlan(res.plan ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-display font-bold">Coach IA</h1>
        <p className="text-sm text-muted-foreground">
          Análise personalizada da sua semana com base em metas, refeições, treinos, peso e água.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { value: "auto", label: "Auto", short: "Automático" },
          { value: "Emagrecimento", label: "Secar", short: "Emagrecimento" },
          { value: "Hipertrofia", label: "Ganhar", short: "Hipertrofia" },
          { value: "Recomposicao corporal", label: "Recomp", short: "Recomposição" },
          { value: "Manutencao", label: "Manter", short: "Manutenção" },
        ].map((item) => {
          const active = objective === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setObjective(item.value as CoachObjective)}
              className={`rounded-2xl border px-3 py-3 text-left transition ${
                active
                  ? "border-primary bg-primary/10 text-foreground shadow-sm"
                  : "border-border bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wider font-extrabold">{item.label}</span>
              <span className="mt-1 block text-xs">{item.short}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Objetivo atual:{" "}
        <span className="font-semibold text-foreground">
          {objective === "auto" ? "Automático" : objective}
        </span>
      </p>
      <Button onClick={generate} disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando seus dados…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" /> Gerar análise da semana
          </>
        )}
      </Button>
      {snapshot && (
        <div className="grid gap-2.5 md:grid-cols-3">
          <Card className="p-4 rounded-2xl">
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">Confiança</p>
            <p className="mt-2 text-base font-black font-display text-foreground">{confidenceLabel[snapshot.confidence]}</p>
            <p className="mt-1 text-xs text-muted-foreground">Baseada na quantidade de registros recentes.</p>
          </Card>
          <Card className="p-4 rounded-2xl">
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">Próxima ação</p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-foreground">{snapshot.nextAction}</p>
          </Card>
          <Card className="p-4 rounded-2xl">
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">Base usada</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {snapshot.sources.map((source) => (
                <li key={source}>• {source}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      {plan && (
        <Card className="p-5 rounded-3xl border-0 bg-gradient-to-br from-background via-background to-primary/5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">{plan.title}</p>
              <p className="mt-2 inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                {plan.objective}
              </p>
              <h2 className="mt-2 text-xl font-black font-display text-foreground">{plan.focus}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                O Coach organiza a semana em passos simples, sem virar uma lista grande demais.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border bg-background/70 p-4">
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">O que fazer hoje</p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-foreground">{plan.todaySummary}</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-background/60 p-4">
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">Treino</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{plan.trainingGoal}</p>
            </div>
            <div className="rounded-2xl border bg-background/60 p-4">
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">Nutrição</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{plan.nutritionGoal}</p>
            </div>
            <div className="rounded-2xl border bg-background/60 p-4">
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">Acompanhamento</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{plan.trackingGoal}</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border bg-background/60 p-4">
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">Checklist da semana</p>
            <ul className="mt-3 space-y-2 text-sm text-foreground">
              {plan.checklist.map((item) => (
                <li key={item} className="flex gap-2 leading-relaxed">
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Próxima ação: <span className="font-medium text-foreground">{plan.nextAction}</span>
          </div>
        </Card>
      )}
      {text && <Card className="p-5 whitespace-pre-wrap text-sm leading-relaxed">{text}</Card>}
      {!text && !loading && (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Toque em "Gerar análise" para receber um resumo prático dos seus últimos 7 dias.
        </Card>
      )}
    </div>
  );
}
