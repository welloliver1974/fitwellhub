import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Progress } from "@/components/ui/progress";
import { Flame, Beef, Wheat, Droplet } from "lucide-react";

export const Route = createFileRoute("/app/")({
  component: TodayPage,
});

type Goals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type Totals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

function TodayPage() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goals | null>(null);
  const [totals, setTotals] = useState<Totals>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: g }, { data: meals }] = await Promise.all([
        supabase.from("goals").select("calories,protein_g,carbs_g,fat_g").eq("user_id", user.id).maybeSingle(),
        supabase.from("meals").select("id").eq("user_id", user.id).eq("meal_date", today),
      ]);
      setGoals(g ?? { calories: 2000, protein_g: 140, carbs_g: 220, fat_g: 65 });

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
      }
      setLoading(false);
    })();
  }, [user]);

  if (loading || !goals) return <p className="text-muted-foreground">Carregando…</p>;

  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground capitalize">{today}</p>
        <h1 className="text-3xl font-display font-bold mt-1">Hoje</h1>
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
        <Progress value={Math.min(100, (totals.calories / goals.calories) * 100)} className="mt-4" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MacroCard icon={<Beef className="h-4 w-4" />} label="Proteína" value={totals.protein_g} goal={goals.protein_g} />
        <MacroCard icon={<Wheat className="h-4 w-4" />} label="Carbo" value={totals.carbs_g} goal={goals.carbs_g} />
        <MacroCard icon={<Droplet className="h-4 w-4" />} label="Gordura" value={totals.fat_g} goal={goals.fat_g} />
      </div>
    </div>
  );
}

function MacroCard({ icon, label, value, goal }: { icon: React.ReactNode; label: string; value: number; goal: number }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {icon} {label}
      </div>
      <p className="text-xl font-display font-bold mt-2">
        {Math.round(value)}<span className="text-xs text-muted-foreground font-normal">/{goal}g</span>
      </p>
      <Progress value={Math.min(100, (value / goal) * 100)} className="mt-2 h-1.5" />
    </div>
  );
}