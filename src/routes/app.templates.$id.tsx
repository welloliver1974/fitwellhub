import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/templates/$id")({ component: TemplateDetail });

type Tpl = { id: string; name: string };
type Ex = { id: string; name: string; position: number };

function TemplateDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [tpl, setTpl] = useState<Tpl | null>(null);
  const [exs, setExs] = useState<Ex[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const load = async () => {
    const { data: t } = await supabase.from("workout_templates").select("id,name").eq("id", id).maybeSingle();
    setTpl(t as Tpl | null);
    const { data: e } = await supabase.from("workout_template_exercises").select("id,name,position").eq("template_id", id).order("position");
    setExs((e ?? []) as Ex[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const add = async () => {
    if (!user || !name.trim()) return;
    const { error } = await supabase.from("workout_template_exercises").insert({
      user_id: user.id, template_id: id, name: name.trim(), position: exs.length,
    });
    if (error) return toast.error(error.message);
    setName(""); setOpen(false); load();
  };

  const remove = async (exId: string) => {
    await supabase.from("workout_template_exercises").delete().eq("id", exId);
    load();
  };

  if (!tpl) return <p className="text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-5">
      <Link to="/app/templates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Templates
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold">{tpl.name}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-1" />Exercício</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo exercício</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Supino reto" autoFocus />
            </div>
            <DialogFooter><Button onClick={add}>Adicionar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {exs.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">Adicione exercícios ao template.</Card>
      ) : (
        <Card className="divide-y">
          {exs.map((e) => (
            <div key={e.id} className="p-3 flex items-center justify-between">
              <span className="font-medium">{e.name}</span>
              <Button variant="ghost" size="icon" onClick={() => remove(e.id)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
