import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, ChevronRight, Layers, Trash2, Play } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/templates/")({
  component: TemplatesPage,
});

type Template = { id: string; name: string };
type TplEx = { id: string; template_id: string; name: string; position: number };

function TemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [exs, setExs] = useState<TplEx[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data: t } = await supabase
      .from("workout_templates")
      .select("id,name")
      .eq("user_id", user.id)
      .order("created_at");
    setTemplates(t ?? []);
    const ids = (t ?? []).map((x) => x.id);
    if (ids.length) {
      const { data: e } = await supabase
        .from("workout_template_exercises")
        .select("id,template_id,name,position")
        .in("template_id", ids)
        .order("position");
      setExs((e ?? []) as TplEx[]);
    } else setExs([]);
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user]);

  const create = async () => {
    if (!user || !name.trim()) return;
    const { error } = await supabase
      .from("workout_templates")
      .insert({ user_id: user.id, name: name.trim() });
    if (error) return toast.error(error.message);
    setName("");
    setOpen(false);
    load();
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Excluir este template?")) return;
    await supabase.from("workout_template_exercises").delete().eq("template_id", id);
    await supabase.from("workout_templates").delete().eq("id", id);
    load();
  };

  const applyTemplate = async (tpl: Template, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data: w, error } = await supabase
      .from("workouts")
      .insert({ user_id: user.id, name: tpl.name, workout_date: today })
      .select("id")
      .single();
    if (error || !w) return toast.error(error?.message ?? "Erro");
    const tplExs = exs.filter((x) => x.template_id === tpl.id);
    if (tplExs.length) {
      await supabase.from("exercises").insert(
        tplExs.map((x) => ({
          user_id: user.id,
          workout_id: w.id,
          name: x.name,
          position: x.position,
        })),
      );
    }
    toast.success("Treino criado a partir do template");
  };

  return (
    <div className="space-y-5">
      <Link
        to="/app/treinos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Treinos
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Templates</h1>
          <p className="text-sm text-muted-foreground">Modelos reutilizáveis (A, B, C…)</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full">
              <Plus className="h-4 w-4 mr-1" />
              Novo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo template</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Treino A — Peito/Tríceps"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button onClick={create}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 ? (
        <Card className="p-10 text-center">
          <Layers className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Crie templates para iniciar treinos com 1 toque.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => {
            const count = exs.filter((x) => x.template_id === t.id).length;
            return (
              <Link key={t.id} to="/app/templates/$id" params={{ id: t.id }} className="block">
                <Card className="p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{count} exercício(s)</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => applyTemplate(t, e)}
                      title="Usar hoje"
                    >
                      <Play className="h-4 w-4 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={(e) => remove(t.id, e)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
