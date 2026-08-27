import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatLocalDate, getLocalDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, ChevronRight, Dumbbell, Trash2, Copy, Layers, PencilLine, History } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/treinos/")({
  component: WorkoutsPage,
});

type Workout = { id: string; name: string; workout_date: string };
type Session = { id: string; name: string; completed_at: string };

// Instant UTC (completed_at) em data+hora local SP — fuso fixo do app.
function formatSessionWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("workouts")
      .select("id,name,workout_date")
      .order("workout_date", { ascending: false })
      .limit(50);
    setWorkouts(data ?? []);
  };
  const loadSessions = async () => {
    const { data } = await supabase
      .from("workout_sessions")
      .select("id,name,completed_at")
      .order("completed_at", { ascending: false })
      .limit(30);
    setSessions(data ?? []);
  };
  useEffect(() => {
    load();
    loadSessions();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("workouts")
      .insert({ name: name.trim(), user_id: user.id, workout_date: getLocalDate() });
    if (error) return toast.error(error.message);
    setName("");
    setOpen(false);
    toast.success("Treino criado");
    load();
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Sessões concluídas ligadas: o FK workout_id é ON DELETE SET NULL, então o
    // app NÃO as remove ao apagar o treino — sessões órfãs continuariam a inflar
    // a média de treinos/semana e a meta. Excluir junto aqui.
    const { data: sess } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("workout_id", id);
    const sessIds = (sess ?? []).map((s) => s.id);
    if (!confirm(
      sessIds.length > 0
        ? `Excluir este treino, os exercícios e ${sessIds.length} sessão(ões) concluída(s) do histórico?`
        : "Excluir este treino e todos os exercícios?"
    )) return;
    // workout_session_sets são removidas em cascata pela FK (session_id).
    if (sessIds.length) {
      const { error: sessErr } = await supabase
        .from("workout_sessions")
        .delete()
        .in("id", sessIds);
      if (sessErr) return toast.error(sessErr.message);
    }
    const { data: exs } = await supabase.from("exercises").select("id").eq("workout_id", id);
    const exIds = (exs ?? []).map((x) => x.id);
    if (exIds.length) await supabase.from("sets").delete().in("exercise_id", exIds);
    await supabase.from("exercises").delete().eq("workout_id", id);
    const { error } = await supabase.from("workouts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(sessIds.length ? "Treino e sessões excluídos" : "Treino excluído");
    load();
    loadSessions();
  };

  const duplicate = async (w: Workout, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const today = getLocalDate();
    const { data: newW, error } = await supabase
      .from("workouts")
      .insert({ name: w.name, user_id: user.id, workout_date: today })
      .select("id")
      .single();
    if (error || !newW) return toast.error(error?.message ?? "Erro");

    const { data: exs } = await supabase
      .from("exercises")
      .select("id,name,position,notes")
      .eq("workout_id", w.id)
      .order("position");

    if (exs && exs.length) {
      const exIds = exs.map((ex) => ex.id);
      const { data: setsData } = await supabase
        .from("sets")
        .select("exercise_id,set_number,reps,weight_kg")
        .in("exercise_id", exIds);

      const { data: newExs, error: exErr } = await supabase
        .from("exercises")
        .insert(exs.map((ex) => ({
          name: ex.name,
          position: ex.position,
          notes: ex.notes,
          user_id: user.id,
          workout_id: newW.id
        })))
        .select("id,name");

      if (exErr) return toast.error("Erro ao duplicar exercícios");

      if (newExs && newExs.length && setsData && setsData.length) {
        const setsToInsert: any[] = [];
        exs.forEach((originalEx) => {
          const matchingNewEx = newExs.find((n) => n.name === originalEx.name);
          if (matchingNewEx) {
            const originalExSets = setsData.filter((s) => s.exercise_id === originalEx.id);
            originalExSets.forEach((s) => {
              setsToInsert.push({
                exercise_id: matchingNewEx.id,
                user_id: user.id,
                set_number: s.set_number,
                reps: s.reps,
                weight_kg: s.weight_kg,
                completed: false
              });
            });
          }
        });

        if (setsToInsert.length > 0) {
          const { error: setsErr } = await supabase.from("sets").insert(setsToInsert);
          if (setsErr) return toast.error("Erro ao duplicar séries");
        }
      }
    }
    toast.success("Treino duplicado para hoje");
    load();
  };

  const startEditing = (w: Workout, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(w.id);
    setEditName(w.name);
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from("workouts")
      .update({ name: editName.trim() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    toast.success("Nome atualizado");
    load();
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const removeSession = async (sid: string) => {
    if (!confirm("Excluir esta sessão concluída do histórico? A média de treinos/semana e a meta recalcularão.")) return;
    const { error } = await supabase
      .from("workout_sessions")
      .delete()
      .eq("id", sid);
    if (error) return toast.error(error.message);
    toast.success("Sessão excluída do histórico");
    loadSessions();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Treinos</h1>
        <div className="flex gap-2">
          <Link to="/app/templates">
            <Button size="sm" variant="outline" className="rounded-full">
              <Layers className="h-4 w-4 mr-1" />
              Templates
            </Button>
          </Link>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full">
                <Plus className="h-4 w-4 mr-1" />
                Novo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo treino</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Label>Nome</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Peito e tríceps"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button onClick={create} className="rounded-full">
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {workouts.length === 0 ? (
        <Card className="p-10 text-center">
          <Dumbbell className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum treino ainda. Crie o primeiro!</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {workouts.map((w) => (
            <Link key={w.id} to="/app/treinos/$id" params={{ id: w.id }} className="block">
              <Card className="p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors">
                <div className="flex-1 min-w-0">
                  {editingId === w.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveEdit(w.id); }
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onBlur={() => saveEdit(w.id)}
                        className="h-8 text-sm font-medium"
                        autoFocus
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium truncate">{w.name}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => startEditing(w, e)}
                      >
                        <PencilLine className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatLocalDate(w.workout_date)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => duplicate(w, e)}
                    title="Duplicar para hoje"
                  >
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={(e) => remove(w.id, e)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {sessions.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Treinos concluídos</h2>
          </div>
          <p className="text-xs text-muted-foreground text-pretty">
            Sessões do histórico alimentam a média de treinos/semana e a meta. Para limpar um
            registro de teste, use o botão de excluir ao lado — a base de treinos não é afetada.
          </p>
          <div className="space-y-2">
            {sessions.map((s) => (
              <Card key={s.id} className="p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSessionWhen(s.completed_at)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSession(s.id)}
                  title="Excluir sessão do histórico"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
