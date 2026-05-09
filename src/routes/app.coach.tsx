import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { coachAdvice } from "@/server-fns/nutrition.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/coach")({
  component: CoachPage,
});

function CoachPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string>("");

  const generate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

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

      // aggregate per day
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
        `Diário (últimos 7 dias):`,
        ...lines,
      ].join("\n");

      const res = await coachAdvice({ data: { summary } });
      setText(res.text);
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
        <p className="text-sm text-muted-foreground">Análise personalizada da sua semana</p>
      </div>
      <Button onClick={generate} disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" /> Gerar análise da semana
          </>
        )}
      </Button>
      {text && <Card className="p-5 whitespace-pre-wrap text-sm leading-relaxed">{text}</Card>}
      {!text && !loading && (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Toque em "Gerar análise" para receber dicas baseadas nos seus últimos 7 dias.
        </Card>
      )}
    </div>
  );
}
