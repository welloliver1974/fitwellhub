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
import { ArrowLeft, ChevronRight, ChefHat, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/receitas/")({ component: RecipesPage });

type Recipe = { id: string; name: string; servings: number };

function RecipesPage() {
  const { user } = useAuth();
  const [list, setList] = useState<Recipe[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [servings, setServings] = useState(1);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("recipes")
      .select("id,name,servings")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setList(data ?? []);
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user]);

  const create = async () => {
    if (!user || !name.trim()) return;
    const { error } = await supabase
      .from("recipes")
      .insert({ user_id: user.id, name: name.trim(), servings });
    if (error) return toast.error(error.message);
    setName("");
    setServings(1);
    setOpen(false);
    load();
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Excluir receita?")) return;
    await supabase.from("recipe_items").delete().eq("recipe_id", id);
    await supabase.from("recipes").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-5">
      <Link
        to="/app/nutricao"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Nutrição
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold">Receitas</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full">
              <Plus className="h-4 w-4 mr-1" />
              Nova
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova receita</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Frango com batata"
                  autoFocus
                />
              </div>
              <div>
                <Label>Porções</Label>
                <Input
                  type="number"
                  value={servings}
                  onChange={(e) => setServings(Number(e.target.value))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={create}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {list.length === 0 ? (
        <Card className="p-10 text-center">
          <ChefHat className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            Salve receitas e adicione com 1 toque às refeições.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <Link key={r.id} to="/app/receitas/$id" params={{ id: r.id }} className="block">
              <Card className="p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.servings} porção(ões)</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={(e) => remove(r.id, e)}>
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
