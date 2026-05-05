import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, ChevronRight, Dumbbell, Trash2, Copy } from "lucide-react";
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
    const { data } = await supabase.from("workouts").select("id,name,workout_date").order("workout_date", { ascending: false }).limit(50);
    setWorkouts(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("workouts").insert({ name: name.trim(), user_id: user.id });
    if (error) return toast.error(error.message);
    setName(""); setOpen(false);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data: newW, error } = await supabase.from("workouts")
      .insert({ name: w.name, user_id: user.id, workout_date: today })
      .select("id").single();
    if (error || !newW) return toast.error(error?.message ?? "Erro");
    const { data: exs } = await supabase.from("exercises")
      .select("name,position,notes").eq("workout_id", w.id).order("position");
    if (exs && exs.length) {
      await supabase.from("exercises").insert(
        exs.map((ex) => ({ ...ex, user_id: user.id, workout_id: newW.id }))
      );
    }
    toast.success("Treino duplicado para hoje");
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Treinos</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-1" />Novo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo treino</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Peito e tríceps" autoFocus />
            </div>
            <DialogFooter><Button onClick={create} className="rounded-full">Criar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
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
                  <p className="text-xs text-muted-foreground">{new Date(w.workout_date + "T00:00").toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={(e) => duplicate(w, e)} title="Duplicar para hoje">
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