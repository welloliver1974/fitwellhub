import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { ArrowLeft, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/app/exercicios/$name")({ component: ExerciseHistory });

type Row = { date: string; maxWeight: number; maxReps: number; volume: number };

function ExerciseHistory() {
  const { name } = Route.useParams();
  const decoded = decodeURIComponent(name);
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [pr, setPr] = useState<{ weight: number; reps: number; date: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: exs } = await supabase
        .from("exercises")
        .select("id,workout_id")
        .eq("user_id", user.id)
        .ilike("name", decoded);
      const exIds = (exs ?? []).map((e) => e.id);
      const wIds = Array.from(new Set((exs ?? []).map((e) => e.workout_id)));
      if (!exIds.length) {
        setRows([]);
        return;
      }
      const [{ data: sets }, { data: workouts }] = await Promise.all([
        supabase.from("sets").select("exercise_id,reps,weight_kg").in("exercise_id", exIds),
        supabase.from("workouts").select("id,workout_date").in("id", wIds),
      ]);
      const exToDate = new Map<string, string>();
      const dateById = new Map((workouts ?? []).map((w) => [w.id, w.workout_date]));
      for (const e of exs ?? []) exToDate.set(e.id, dateById.get(e.workout_id) ?? "");
      const grouped = new Map<string, { reps: number; weight: number }[]>();
      for (const s of sets ?? []) {
        const d = exToDate.get(s.exercise_id);
        if (!d) continue;
        const arr = grouped.get(d) ?? [];
        arr.push({ reps: s.reps, weight: Number(s.weight_kg) });
        grouped.set(d, arr);
      }
      const sorted = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
      const out: Row[] = sorted.map(([date, ss]) => ({
        date,
        maxWeight: Math.max(...ss.map((s) => s.weight)),
        maxReps: Math.max(...ss.map((s) => s.reps)),
        volume: ss.reduce((a, s) => a + s.weight * s.reps, 0),
      }));
      setRows(out);
      let best = { weight: 0, reps: 0, date: "" };
      for (const [date, ss] of sorted) {
        for (const s of ss)
          if (s.weight > best.weight) best = { weight: s.weight, reps: s.reps, date };
      }
      setPr(best.weight > 0 ? best : null);
    })();
  }, [user, decoded]);

  const chart = rows.map((r) => ({ ...r, label: r.date.slice(5) }));

  return (
    <div className="space-y-5">
      <Link
        to="/app/treinos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Treinos
      </Link>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Histórico</p>
        <h1 className="text-3xl font-display font-bold">{decoded}</h1>
      </div>

      {pr && (
        <Card className="p-4 flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Recorde pessoal</p>
            <p className="text-xl font-display font-bold">
              {pr.weight} kg × {pr.reps}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(pr.date + "T00:00").toLocaleDateString("pt-BR")}
            </p>
          </div>
        </Card>
      )}

      {rows.length < 2 ? (
        <Card className="p-10 text-center text-muted-foreground">
          Registre mais sessões para ver a evolução.
        </Card>
      ) : (
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-3">Carga máxima (kg) por sessão</p>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="maxWeight"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="divide-y">
          {[...rows].reverse().map((r) => (
            <div key={r.date} className="p-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {new Date(r.date + "T00:00").toLocaleDateString("pt-BR")}
              </span>
              <span className="font-medium">
                {r.maxWeight}kg × {r.maxReps} · vol {Math.round(r.volume)}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
