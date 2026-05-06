import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/app/nutricao-historico")({ component: NutHistoryPage });

type Day = { date: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };

function NutHistoryPage() {
  const { user } = useAuth();
  const [days, setDays] = useState<Day[]>([]);
  const [range, setRange] = useState<7 | 30>(7);
  const [goal, setGoal] = useState(2000);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const since = new Date(Date.now() - range * 86400000).toISOString().slice(0, 10);
      const [{ data: g }, { data: meals }] = await Promise.all([
        supabase.from("goals").select("calories").eq("user_id", user.id).maybeSingle(),
        supabase.from("meals").select("id,meal_date").eq("user_id", user.id).gte("meal_date", since),
      ]);
      if (g) setGoal(g.calories);
      const ids = (meals ?? []).map((m) => m.id);
      const dateByMeal = new Map((meals ?? []).map((m) => [m.id, m.meal_date]));
      const map = new Map<string, Day>();
      for (let i = range; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        map.set(d, { date: d, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
      }
      if (ids.length) {
        const { data: items } = await supabase.from("meal_items").select("meal_id,calories,protein_g,carbs_g,fat_g").in("meal_id", ids);
        for (const it of items ?? []) {
          const d = dateByMeal.get(it.meal_id);
          if (!d || !map.has(d)) continue;
          const day = map.get(d)!;
          day.calories += Number(it.calories || 0);
          day.protein_g += Number(it.protein_g || 0);
          day.carbs_g += Number(it.carbs_g || 0);
          day.fat_g += Number(it.fat_g || 0);
        }
      }
      setDays(Array.from(map.values()));
    })();
  }, [user, range]);

  const chart = days.map((d) => ({ ...d, label: d.date.slice(5) }));
  const avgCal = days.length ? days.reduce((a, d) => a + d.calories, 0) / days.length : 0;
  const avgP = days.length ? days.reduce((a, d) => a + d.protein_g, 0) / days.length : 0;

  return (
    <div className="space-y-5">
      <Link to="/app/nutricao" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Nutrição
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold">Visão geral</h1>
        <div className="flex gap-1">
          <Button size="sm" variant={range === 7 ? "default" : "outline"} onClick={() => setRange(7)}>7d</Button>
          <Button size="sm" variant={range === 30 ? "default" : "outline"} onClick={() => setRange(30)}>30d</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Média kcal/dia</p>
          <p className="text-2xl font-display font-bold">{Math.round(avgCal)}</p>
          <p className="text-xs text-muted-foreground">Meta {goal}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Média proteína/dia</p>
          <p className="text-2xl font-display font-bold">{Math.round(avgP)}g</p>
        </Card>
      </div>

      <Card className="p-4">
        <p className="text-xs text-muted-foreground mb-3">Calorias por dia</p>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="calories" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-xs text-muted-foreground mb-3">Macros (g) por dia</p>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar dataKey="protein_g" name="Proteína" fill="hsl(var(--primary))" stackId="m" />
              <Bar dataKey="carbs_g" name="Carbo" fill="hsl(var(--accent))" stackId="m" />
              <Bar dataKey="fat_g" name="Gordura" fill="hsl(var(--muted-foreground))" stackId="m" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
