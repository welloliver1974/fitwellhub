import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalDate } from "@/lib/utils";
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
import { Plus, ChevronRight, Dumbbell, Trash2, Copy, Layers } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/treinos/")({
  component: WorkoutsPage,
});

type Workout = { id: string; name: string; workout_date: string };

function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("workouts")
      .select("id,name,workout_date")
      .order("workout_date", { ascending: false })
      .limit(50);
    setWorkouts(data ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("workouts")
      .insert({ name: name.trim(), user_id: user.id });
    if (error) return toast.error(error.message);
    setName("");
    setOpen(false);
    toast.success("Treino criado");
    load();
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Excluir este treino e todos os exercícios?")) return;
    const { data: exs } = await supabase.from("exercises").select("id").eq("workout_id", id);
    const exIds = (exs ?? []).map((x) => x.id);
    if (exIds.length) await supabase.from("sets").delete().in("exercise_id", exIds);
    await supabase.from("exercises").delete().eq("workout_id", id);
    const { error } = await supabase.from("workouts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Treino excluído");
    load();
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
                <div>
                  <p className="font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(w.workout_date + "T00:00").toLocaleDateString("pt-BR")}
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
    </div>
  );
}
