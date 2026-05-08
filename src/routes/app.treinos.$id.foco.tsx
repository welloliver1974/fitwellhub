import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, X, Plus, Check, Timer, Pause, Play } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/treinos/$id/foco")({
  component: FocusMode,
});

type Exercise = { id: string; name: string; position: number };
type Set = { id: string; exercise_id: string; set_number: number; reps: number; weight_kg: number };

function FocusMode() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sets, setSets] = useState<Set[]>([]);
  const [idx, setIdx] = useState(0);
  const [restSec, setRestSec] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restPreset, setRestPreset] = useState(90);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (restRunning && restSec > 0) {
      intervalRef.current = setInterval(() => {
        setRestSec((s) => {
          if (s <= 1) { setRestRunning(false); return 0; }
          return s - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [restRunning]);

  const load = async () => {
    const { data: ex } = await supabase.from("exercises").select("id,name,position").eq("workout_id", id).order("position");
    setExercises((ex ?? []) as Exercise[]);
    const exIds = (ex ?? []).map((e) => e.id);
    if (exIds.length) {
      const { data: ss } = await supabase.from("sets").select("*").in("exercise_id", exIds).order("set_number");
      setSets((ss ?? []) as Set[]);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const ex = exercises[idx];
  const exSets = ex ? sets.filter((s) => s.exercise_id === ex.id) : [];

  const addSet = async () => {
    if (!user || !ex) return;
    const last = exSets[exSets.length - 1];
    const { error } = await supabase.from("sets").insert({
      user_id: user.id, exercise_id: ex.id,
      set_number: exSets.length + 1,
      reps: last?.reps ?? 10,
      weight_kg: last?.weight_kg ?? 0,
    });
    if (error) return toast.error(error.message);
    setRestSec(restPreset); setRestRunning(true);
    load();
  };

  const updateSet = async (setId: string, field: "reps" | "weight_kg", value: number) => {
    setSets((p) => p.map((s) => s.id === setId ? { ...s, [field]: value } : s));
    await supabase.from("sets").update(field === "reps" ? { reps: value } : { weight_kg: value }).eq("id", setId);
  };

  if (!exercises.length) return (
    <div className="text-center py-20 text-muted-foreground">
      Nenhum exercício. <Link to="/app/treinos/$id" params={{ id }} className="text-primary underline">Voltar</Link>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/app/treinos/$id", params: { id } })}>
          <X className="h-5 w-5" />
        </Button>
        <p className="text-xs text-muted-foreground">{idx + 1} / {exercises.length}</p>
        <div className="w-9" />
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col items-center">
        <h1 className="text-3xl font-display font-bold text-center">{ex.name}</h1>

        <div className="my-8 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Descanso</p>
          <p className="text-7xl font-display font-bold tabular-nums text-primary">
            {Math.floor(restSec / 60).toString().padStart(2, "0")}:{(restSec % 60).toString().padStart(2, "0")}
          </p>
          <div className="flex justify-center gap-2 mt-4">
            {[60, 90, 120, 180].map((s) => (
              <Button key={s} variant={restPreset === s ? "default" : "outline"} size="sm" onClick={() => { setRestPreset(s); setRestSec(s); setRestRunning(true); }}>{s}s</Button>
            ))}
            {restSec > 0 && (
              restRunning ? (
                <Button size="icon" variant="ghost" onClick={() => setRestRunning(false)}><Pause className="h-4 w-4" /></Button>
              ) : (
                <Button size="icon" variant="ghost" onClick={() => setRestRunning(true)}><Play className="h-4 w-4" /></Button>
              )
            )}
          </div>
        </div>

        <div className="w-full max-w-md space-y-2">
          {exSets.map((s) => (
            <div key={s.id} className="grid grid-cols-[40px_1fr_1fr_36px] items-center gap-2 rounded-xl bg-card border p-2">
              <span className="text-center font-bold">{s.set_number}</span>
              <Input type="number" value={s.reps} onChange={(e) => updateSet(s.id, "reps", Number(e.target.value))} className="text-center text-lg" />
              <Input type="number" step="0.5" value={s.weight_kg} onChange={(e) => updateSet(s.id, "weight_kg", Number(e.target.value))} className="text-center text-lg" />
              <Check className="h-5 w-5 text-primary mx-auto" />
            </div>
          ))}
          <Button onClick={addSet} variant="secondary" className="w-full h-12 text-base">
            <Plus className="h-4 w-4 mr-1" /> Adicionar série
          </Button>
        </div>
      </div>

      <footer className="flex items-center justify-between px-5 py-4 border-t bg-card/50">
        <Button variant="outline" size="lg" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
          <ChevronLeft className="h-5 w-5" /> Anterior
        </Button>
        {idx === exercises.length - 1 ? (
          <Button size="lg" onClick={() => navigate({ to: "/app/treinos/$id", params: { id } })}>
            Finalizar
          </Button>
        ) : (
          <Button size="lg" onClick={() => setIdx((i) => Math.min(exercises.length - 1, i + 1))}>
            Próximo <ChevronRight className="h-5 w-5" />
          </Button>
        )}
      </footer>
    </div>
  );
}