import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLocalDate } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const DAYS = 84; // 12 weeks

type Cell = { date: string; value: number; goal: number };

function calcStreak(sorted: Cell[]): { current: number; best: number } {
  let current = 0;
  let best = 0;
  let running = 0;
  const today = getLocalDate();
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].value > 0) {
      running++;
      if (sorted[i].date === today || current > 0) current++;
    } else {
      if (running > best) best = running;
      running = 0;
    }
  }
  if (running > best) best = running;
  if (current === 0 && sorted.length > 0 && sorted[sorted.length - 1].value > 0) current = running;
  return { current, best };
}

export function Heatmap() {
  const { user } = useAuth();
  const [cells, setCells] = useState<Cell[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const start = new Date();
      start.setDate(start.getDate() - DAYS + 1);
      const startStr = getLocalDate(start);

      const [{ data: g }, { data: meals }] = await Promise.all([
        supabase.from("goals").select("calories").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("meals")
          .select("id,meal_date")
          .eq("user_id", user.id)
          .gte("meal_date", startStr),
      ]);
      const goal = g?.calories ?? 2000;
      const ids = (meals ?? []).map((m) => m.id);
      const byMeal: Record<string, string> = {};
      (meals ?? []).forEach((m) => {
        byMeal[m.id] = m.meal_date;
      });
      const totals: Record<string, number> = {};
      if (ids.length) {
        const { data: items } = await supabase
          .from("meal_items")
          .select("meal_id,calories")
          .in("meal_id", ids);
        (items ?? []).forEach((it) => {
          const d = byMeal[it.meal_id as string];
          if (!d) return;
          totals[d] = (totals[d] ?? 0) + Number(it.calories || 0);
        });
      }

      const out: Cell[] = [];
      for (let i = 0; i < DAYS; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const ds = getLocalDate(d);
        out.push({ date: ds, value: totals[ds] ?? 0, goal });
      }
      setCells(out);
    })();
  }, [user]);

  if (cells.length === 0) return null;

  const daysWithMeals = cells.filter((c) => c.value > 0).length;
  const adhesionPct = Math.round((daysWithMeals / DAYS) * 100);
  const totalCalories = cells.reduce((s, c) => s + c.value, 0);
  const avgCalories = daysWithMeals > 0 ? Math.round(totalCalories / daysWithMeals) : 0;
  const daysOnGoal = cells.filter((c) => c.value > 0 && c.value >= c.goal * 0.9).length;
  const streak = calcStreak(cells);

  return (
    <div className="rounded-2xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Adesão · 12 semanas
        </p>
      </div>

      {/* Barra de adesão */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm font-medium">{adhesionPct}%</span>
          <span className="text-xs text-muted-foreground">
            {daysWithMeals} de {DAYS} dias
          </span>
        </div>
        <Progress value={adhesionPct} className="h-2" />
      </div>

      {/* Stats em grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-secondary/50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">🔥 Sequência</p>
          <p className="text-lg font-display font-bold mt-0.5">{streak.current} dias</p>
          <p className="text-[10px] text-muted-foreground">Melhor: {streak.best} dias</p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">📊 Média</p>
          <p className="text-lg font-display font-bold mt-0.5">{avgCalories.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">kcal/dia</p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">🎯 Dias na meta</p>
          <p className="text-lg font-display font-bold mt-0.5">{daysOnGoal}</p>
          <p className="text-[10px] text-muted-foreground">
            de {daysWithMeals} dias com registro
          </p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">⚡ Meta</p>
          <p className="text-lg font-display font-bold mt-0.5">{cells[0]?.goal.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">kcal/dia</p>
        </div>
      </div>
    </div>
  );
}
