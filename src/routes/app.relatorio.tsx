import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileDown, Loader2, History } from "lucide-react";
import jsPDF from "jspdf";
import { toast } from "sonner";

type CompletedLog = {
  date: string;
  workoutId: string;
  workoutName: string;
  setCount: number;
};

async function loadCompletedLogs(userId: string): Promise<CompletedLog[]> {
  // Query sessions and join their session sets to count them
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(`
      id,
      completed_at,
      workout_id,
      name,
      workout_session_sets (id)
    `)
    .eq("user_id", userId)
    .order("completed_at", { ascending: false });

  if (error || !data || !data.length) return [];

  return data.map((session) => {
    const date = (session.completed_at as string).slice(0, 10);
    const setCount = Array.isArray(session.workout_session_sets)
      ? session.workout_session_sets.length
      : 0;
    return {
      date,
      workoutId: session.workout_id || "",
      workoutName: session.name,
      setCount,
    };
  });
}

export const Route = createFileRoute("/app/relatorio")({
  component: RelatorioPage,
});

function RelatorioPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const exportPdf = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

      const [
        { data: profile },
        { data: goals },
        { data: meals },
        { data: weights },
        { data: water },
      ] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
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
          .lte("meal_date", today)
          .order("meal_date"),
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
            }),
            { kcal: 0, p: 0, c: 0, f: 0 },
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

      // Workouts from Supabase (completed sets)
      const logs = await loadCompletedLogs(user.id);
      const workoutsByDate = logs.reduce(
        (acc, l) => {
          if (!acc[l.date]) acc[l.date] = [];
          acc[l.date].push(l.workoutName);
          return acc;
        },
        {} as Record<string, string[]>,
      );

      const doc = new jsPDF();
      let y = 18;
      doc.setFontSize(18);
      doc.text("Fit Well Hub — Relatorio Semanal", 14, y);
      y += 8;
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`${profile?.display_name ?? user.email ?? ""} · ${start} a ${today}`, 14, y);
      doc.setTextColor(0);
      y += 10;

      doc.setFontSize(12);
      doc.text("Metas diarias", 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(
        `${goals?.calories ?? 2000} kcal · P ${goals?.protein_g ?? 140}g · C ${goals?.carbs_g ?? 220}g · G ${goals?.fat_g ?? 65}g`,
        14,
        y,
      );
      y += 10;

      doc.setFontSize(12);
      doc.text("Nutricao por dia", 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.text("Data        Kcal    P    C    G    Agua", 14, y);
      y += 5;
      for (const [d, t] of days) {
        doc.text(
          `${d}  ${String(Math.round(t.kcal)).padStart(5)}  ${String(Math.round(t.p)).padStart(4)} ${String(Math.round(t.c)).padStart(4)} ${String(Math.round(t.f)).padStart(4)}   ${(t.water / 1000).toFixed(2)}L`,
          14,
          y,
        );
        y += 5;
        if (y > 270) {
          doc.addPage();
          y = 18;
        }
      }
      y += 6;

      doc.setFontSize(12);
      doc.text("Treinos", 14, y);
      y += 6;
      doc.setFontSize(10);
      const workoutDates = Object.keys(workoutsByDate).sort();
      if (!workoutDates.length) {
        doc.text("Nenhum treino registrado.", 14, y);
        y += 6;
      } else
        for (const d of workoutDates) {
          for (const name of workoutsByDate[d]) {
            doc.text(`${d}  ·  ${name}`, 14, y);
            y += 5;
          }
          if (y > 270) {
            doc.addPage();
            y = 18;
          }
        }
      y += 4;

      doc.setFontSize(12);
      doc.text("Peso", 14, y);
      y += 6;
      doc.setFontSize(10);
      if (!weights?.length) doc.text("Sem registros de peso.", 14, y);
      else
        for (const w of weights) {
          doc.text(`${w.log_date}  ·  ${Number(w.weight_kg).toFixed(1)} kg`, 14, y);
          y += 5;
          if (y > 270) {
            doc.addPage();
            y = 18;
          }
        }

      doc.save(`fitwellhub-relatorio-${today}.pdf`);
      toast.success("PDF gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-display font-bold">Relatorio</h1>
        <p className="text-sm text-muted-foreground">Exporte seus dados da semana em PDF</p>
      </div>
      <Card className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">
          Inclui nutrição diária, treinos realizados, registros de peso e consumo de água dos
          últimos 7 dias.
        </p>
        <Button onClick={exportPdf} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando…
            </>
          ) : (
            <>
              <FileDown className="h-4 w-4 mr-2" /> Exportar PDF
            </>
          )}
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Treinos concluídos por dia
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="h-4 w-4 mr-1" />
            {showHistory ? "Ocultar" : "Ver"}
          </Button>
        </div>

        {showHistory && (
          <HistoryList userId={user?.id} />
        )}
      </Card>
    </div>
  );
}

function HistoryList({ userId }: { userId?: string }) {
  const [logs, setLogs] = useState<CompletedLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const data = await loadCompletedLogs(userId);
      setLogs(data);
      setLoading(false);
    })();
  }, [userId]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-4">Carregando…</p>;

  if (logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Nenhum treino concluído ainda. Marque as séries como concluídas na página de treinos.
      </p>
    );
  }

  const grouped = logs.reduce(
    (acc, log) => {
      if (!acc[log.date]) acc[log.date] = [];
      acc[log.date].push(log);
      return acc;
    },
    {} as Record<string, CompletedLog[]>,
  );

  return (
    <div className="space-y-2">
      {Object.entries(grouped).map(([date, dateLogs]) => (
        <div key={date} className="border rounded-lg p-3">
          <p className="font-medium text-sm">
            {new Date(date + "T00:00").toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {dateLogs.reduce((sum, l) => sum + l.setCount, 0)} séries
            concluídas
            {dateLogs.map((l) => ` · ${l.workoutName}`).join("")}
          </p>
        </div>
      ))}
    </div>
  );
}
