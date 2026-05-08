import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const DAYS = 84; // 12 weeks

type Cell = { date: string; value: number; goal: number };

export function Heatmap() {
  const { user } = useAuth();
  const [cells, setCells] = useState<Cell[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const end = new Date();
      const start = new Date(); start.setDate(end.getDate() - DAYS + 1);
      const startStr = start.toISOString().slice(0, 10);

      const [{ data: g }, { data: meals }] = await Promise.all([
        supabase.from("goals").select("calories").eq("user_id", user.id).maybeSingle(),
        supabase.from("meals").select("id,meal_date").eq("user_id", user.id).gte("meal_date", startStr),
      ]);
      const goal = g?.calories ?? 2000;
      const ids = (meals ?? []).map((m) => m.id);
      const byMeal: Record<string, string> = {};
      (meals ?? []).forEach((m) => { byMeal[m.id] = m.meal_date; });
      let totals: Record<string, number> = {};
      if (ids.length) {
        const { data: items } = await supabase.from("meal_items").select("meal_id,calories").in("meal_id", ids);
        (items ?? []).forEach((it) => {
          const d = byMeal[it.meal_id as string]; if (!d) return;
          totals[d] = (totals[d] ?? 0) + Number(it.calories || 0);
        });
      }

      const out: Cell[] = [];
      for (let i = 0; i < DAYS; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const ds = d.toISOString().slice(0, 10);
        out.push({ date: ds, value: totals[ds] ?? 0, goal });
      }
      setCells(out);
    })();
  }, [user]);

  const intensity = (c: Cell) => {
    if (!c.value) return 0;
    const r = c.value / c.goal;
    if (r < 0.4) return 1;
    if (r < 0.7) return 2;
    if (r < 0.95) return 3;
    if (r <= 1.1) return 4;
    return 3; // over
  };

  const colors = [
    "bg-muted/40",
    "bg-primary/20",
    "bg-primary/40",
    "bg-primary/70",
    "bg-primary",
  ];

  // Group into 12 columns x 7 rows
  const cols: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Adesão · 12 semanas</p>
        <div className="flex items-center gap-1">
          {colors.map((c, i) => <div key={i} className={`h-2.5 w-2.5 rounded-sm ${c}`} />)}
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-1">
            {col.map((c) => (
              <div
                key={c.date}
                title={`${c.date}: ${Math.round(c.value)} kcal`}
                className={`h-3 w-3 rounded-sm ${colors[intensity(c)]}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}