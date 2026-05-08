import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Timer, TrendingUp, Pause, Play, Sparkles, Maximize2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/treinos/$id")({
  component: WorkoutDetail,
});

type Workout = { id: string; name: string; workout_date: string };
type Exercise = { id: string; name: string; position: number };
type Set = { id: string; exercise_id: string; set_number: number; reps: number; weight_kg: number };

function WorkoutDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sets, setSets] = useState<Set[]>([]);
  const [history, setHistory] = useState<Record<string, { reps: number; weight_kg: number; date: string }>>({});
  const [open, setOpen] = useState(false);
  const [exName, setExName] = useState("");
  const [restSec, setRestSec] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restPreset, setRestPreset] = useState(90);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (restRunning && restSec > 0) {
      intervalRef.current = setInterval(() => {
        setRestSec((s) => {
          if (s <= 1) {
            setRestRunning(false);
            try { new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play().catch(()=>{}); } catch {}
            toast.success("Descanso terminado");
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [restRunning]);

  const startRest = (sec: number) => { setRestPreset(sec); setRestSec(sec); setRestRunning(true); };

  const load = async () => {
    const { data: w } = await supabase.from("workouts").select("id,name,workout_date").eq("id", id).maybeSingle();
    setWorkout(w as Workout | null);
    const { data: ex } = await supabase.from("exercises").select("id,name,position").eq("workout_id", id).order("position");
    setExercises((ex ?? []) as Exercise[]);
    const exIds = (ex ?? []).map((e) => e.id);
    if (exIds.length) {
      const { data: ss } = await supabase.from("sets").select("*").in("exercise_id", exIds).order("set_number");
      setSets((ss ?? []) as Set[]);
    } else setSets([]);

    // Load best/last set per exercise name from previous workouts
    if (user && (ex ?? []).length) {
      const names = Array.from(new Set((ex ?? []).map((e) => e.name)));
      const { data: prev } = await supabase
        .from("exercises")
        .select("id,name,workout_id,workouts!inner(workout_date)")
        .eq("user_id", user.id)
        .in("name", names)
        .neq("workout_id", id);
      const prevIds = (prev ?? []).map((p: any) => p.id);
      if (prevIds.length) {
        const { data: prevSets } = await supabase.from("sets").select("exercise_id,reps,weight_kg").in("exercise_id", prevIds);
        const exMap: Record<string, { name: string; date: string }> = {};
        (prev ?? []).forEach((p: any) => { exMap[p.id] = { name: p.name, date: p.workouts.workout_date }; });
        const best: Record<string, { reps: number; weight_kg: number; date: string }> = {};
        (prevSets ?? []).forEach((s: any) => {
          const meta = exMap[s.exercise_id]; if (!meta) return;
          const cur = best[meta.name];
          const w = Number(s.weight_kg);
          if (!cur || w > cur.weight_kg || (w === cur.weight_kg && Number(s.reps) > cur.reps)) {
            best[meta.name] = { reps: Number(s.reps), weight_kg: w, date: meta.date };
          }
        });
        setHistory(best);
      } else setHistory({});
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const addExercise = async () => {
    if (!user || !exName.trim()) return;
    const { error } = await supabase.from("exercises").insert({
      user_id: user.id, workout_id: id, name: exName.trim(), position: exercises.length,
    });
    if (error) return toast.error(error.message);
    setExName(""); setOpen(false);
    load();
  };

  const addSet = async (exerciseId: string) => {
    if (!user) return;
    const exSets = sets.filter((s) => s.exercise_id === exerciseId);
    const last = exSets[exSets.length - 1];
    const { error } = await supabase.from("sets").insert({
      user_id: user.id,
      exercise_id: exerciseId,
      set_number: exSets.length + 1,
      reps: last?.reps ?? 10,
      weight_kg: last?.weight_kg ?? 0,
    });
    if (error) return toast.error(error.message);
    startRest(restPreset);
    load();
  };

  const updateSet = async (setId: string, field: "reps" | "weight_kg", value: number) => {
    setSets((prev) => prev.map((s) => s.id === setId ? { ...s, [field]: value } : s));
    const update = field === "reps" ? { reps: value } : { weight_kg: value };
    await supabase.from("sets").update(update).eq("id", setId);
  };

  const removeSet = async (setId: string) => {
    await supabase.from("sets").delete().eq("id", setId);
    load();
  };

  const removeExercise = async (exId: string) => {
    await supabase.from("exercises").delete().eq("id", exId);
    load();
  };

  if (!workout) return <p className="text-muted-foreground">Carregando…</p>;

  const suggestion = (name: string) => {
    const h = history[name];
    if (!h) return null;
    const next = h.reps >= 10 ? h.weight_kg + 2.5 : h.weight_kg;
    return { last: h, next };
  };

  return (
    <div className="space-y-5">
      <Link to="/app/treinos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Treinos
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">{workout.name}</h1>
          <p className="text-sm text-muted-foreground">{new Date(workout.workout_date + "T00:00").toLocaleDateString("pt-BR")}</p>
        </div>
        <div className="flex items-center gap-1">
        <Link to="/app/treinos/$id/foco" params={{ id }}>
          <Button size="icon" variant="outline" title="Modo foco"><Maximize2 className="h-4 w-4" /></Button>
        </Link>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-1" />Exercício</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo exercício</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Label>Nome</Label>
              <Input value={exName} onChange={(e) => setExName(e.target.value)} placeholder="Supino reto" autoFocus />
            </div>
            <DialogFooter><Button onClick={addExercise} className="rounded-full">Adicionar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Rest timer */}
      <Card className="p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          <span className="font-display text-2xl font-bold tabular-nums">
            {Math.floor(restSec / 60).toString().padStart(2, "0")}:{(restSec % 60).toString().padStart(2, "0")}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {[60, 90, 120, 180].map((s) => (
            <Button key={s} variant={restPreset === s ? "default" : "outline"} size="sm" onClick={() => startRest(s)}>{s}s</Button>
          ))}
          {restRunning ? (
            <Button size="icon" variant="ghost" onClick={() => setRestRunning(false)}><Pause className="h-4 w-4" /></Button>
          ) : restSec > 0 ? (
            <Button size="icon" variant="ghost" onClick={() => setRestRunning(true)}><Play className="h-4 w-4" /></Button>
          ) : null}
        </div>
      </Card>

      {exercises.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">Nenhum exercício ainda.</Card>
      ) : (
        <div className="space-y-4">
          {exercises.map((ex) => {
            const exSets = sets.filter((s) => s.exercise_id === ex.id);
            return (
              <Card key={ex.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold">{ex.name}</h3>
                  <div className="flex items-center gap-1">
                    <Link to="/app/exercicios/$name" params={{ name: encodeURIComponent(ex.name) }}>
                      <Button variant="ghost" size="icon" title="Histórico"><TrendingUp className="h-4 w-4 text-muted-foreground" /></Button>
                    </Link>
                    <Button variant="ghost" size="icon" onClick={() => removeExercise(ex.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {(() => {
                  const sug = suggestion(ex.name);
                  if (!sug) return null;
                  return (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs">
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-muted-foreground">
                        Última: <strong className="text-foreground">{sug.last.reps}×{sug.last.weight_kg}kg</strong>
                        {sug.next > sug.last.weight_kg && <> · tente <strong className="text-primary">{sug.next}kg</strong></>}
                      </span>
                    </div>
                  );
                })()}

                {exSets.length > 0 && (
                  <div className="space-y-2 mb-3">
                    <div className="grid grid-cols-[32px_1fr_1fr_32px] gap-2 text-xs text-muted-foreground px-1">
                      <span>#</span><span>Reps</span><span>Carga (kg)</span><span></span>
                    </div>
                    {exSets.map((s) => (
                      <div key={s.id} className="grid grid-cols-[32px_1fr_1fr_32px] gap-2 items-center">
                        <span className="text-sm font-medium text-muted-foreground">{s.set_number}</span>
                        <Input type="number" value={s.reps} onChange={(e) => updateSet(s.id, "reps", Number(e.target.value))} />
                        <Input type="number" step="0.5" value={s.weight_kg} onChange={(e) => updateSet(s.id, "weight_kg", Number(e.target.value))} />
                        <Button variant="ghost" size="icon" onClick={() => removeSet(s.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Button variant="secondary" size="sm" className="w-full" onClick={() => addSet(ex.id)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Série
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}