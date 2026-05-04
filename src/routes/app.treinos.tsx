import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, ChevronRight, Dumbbell } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/treinos")({
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
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}