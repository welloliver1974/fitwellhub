import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Sparkles, Trash2, Send } from "lucide-react";
import { lookupNutrition } from "@/server-fns/nutrition.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/receitas/$id")({ component: RecipeDetail });

type Recipe = { id: string; name: string; servings: number };
type Item = {
  id: string;
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

const MEAL_TYPES = ["Café da manhã", "Almoço", "Lanche", "Jantar", "Ceia"];

function RecipeDetail() {
  const { id } = Route.useParams();
  const { user, session } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [grams, setGrams] = useState<number | "">(100);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [mealType, setMealType] = useState(MEAL_TYPES[1]);
  const [portions, setPortions] = useState<number | "">(1);

  const load = async () => {
    const { data: r } = await supabase
      .from("recipes")
      .select("id,name,servings")
      .eq("id", id)
      .maybeSingle();
    setRecipe(r as Recipe | null);
    const { data: its } = await supabase
      .from("recipe_items")
      .select("*")
      .eq("recipe_id", id)
      .order("created_at");
    setItems((its ?? []) as Item[]);
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [id]);

  const totals = useMemo(
    () =>
      items.reduce(
        (a, i) => ({
          calories: a.calories + Number(i.calories),
          protein_g: a.protein_g + Number(i.protein_g),
          carbs_g: a.carbs_g + Number(i.carbs_g),
          fat_g: a.fat_g + Number(i.fat_g),
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      ),
    [items],
  );

  const perServing =
    recipe && recipe.servings > 0
      ? {
          calories: totals.calories / recipe.servings,
          protein_g: totals.protein_g / recipe.servings,
          carbs_g: totals.carbs_g / recipe.servings,
          fat_g: totals.fat_g / recipe.servings,
        }
      : totals;

  const addIngredient = async () => {
    if (!user || !query.trim()) return;
    setBusy(true);
    try {
      const m = await lookupNutrition({
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        data: { query: query.trim(), grams: Number(grams) || 100 },
      });
      await supabase.from("recipe_items").insert({
        user_id: user.id,
        recipe_id: id,
        name: m.name,
        grams: Number(grams) || 0,
        calories: m.calories,
        protein_g: m.protein_g,
        carbs_g: m.carbs_g,
        fat_g: m.fat_g,
      });
      toast.success("Ingrediente adicionado");
      setQuery("");
      setGrams(100);
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const removeIt = async (itId: string) => {
    await supabase.from("recipe_items").delete().eq("id", itId);
    load();
  };

  const sendToMeal = async () => {
    if (!user || !recipe) return;
    const today = new Date().toISOString().slice(0, 10);
    let { data: meal } = await supabase
      .from("meals")
      .select("id")
      .eq("user_id", user.id)
      .eq("meal_date", today)
      .eq("meal_type", mealType)
      .maybeSingle();
    if (!meal) {
      const { data: nm } = await supabase
        .from("meals")
        .insert({ user_id: user.id, meal_date: today, meal_type: mealType })
        .select("id")
        .single();
      meal = nm;
    }
    if (!meal) return;
    const p = Number(portions) || 1;
    await supabase.from("meal_items").insert({
      user_id: user.id,
      meal_id: meal.id,
      name: `${recipe.name}${p !== 1 ? ` (${p}x)` : ""}`,
      grams: p * 100,
      calories: perServing.calories * p,
      protein_g: perServing.protein_g * p,
      carbs_g: perServing.carbs_g * p,
      fat_g: perServing.fat_g * p,
    });
    toast.success(`Adicionado em ${mealType}`);
    setAddOpen(false);
  };

  if (!recipe) return <p className="text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-5">
      <Link
        to="/app/receitas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Receitas
      </Link>
      <div>
        <h1 className="text-3xl font-display font-bold">{recipe.name}</h1>
        <p className="text-sm text-muted-foreground">{recipe.servings} porção(ões)</p>
      </div>

      <Card className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Por porção</p>
        <p className="text-2xl font-display font-bold">{Math.round(perServing.calories)} kcal</p>
        <p className="text-xs text-muted-foreground">
          P {Math.round(perServing.protein_g)}g · C {Math.round(perServing.carbs_g)}g · G{" "}
          {Math.round(perServing.fat_g)}g
        </p>
      </Card>

      <div className="flex gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="rounded-full">
              <Plus className="h-4 w-4 mr-1" />
              Ingrediente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Adicionar ingrediente
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Alimento</Label>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex: peito de frango grelhado"
                />
              </div>
              <div>
                <Label>Gramas</Label>
                <Input
                  type="number"
                  value={grams}
                  onChange={(e) => setGrams(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <Button onClick={addIngredient} disabled={busy || !query.trim()} className="w-full">
                {busy ? "Calculando…" : "Calcular com IA e adicionar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {items.length > 0 && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full">
                <Send className="h-4 w-4 mr-1" />
                Adicionar à refeição
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar à refeição de hoje</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Refeição</Label>
                  <Select value={mealType} onValueChange={setMealType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEAL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Porções</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={portions}
                    onChange={(e) => setPortions(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={sendToMeal}>Adicionar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Adicione ingredientes para calcular os macros.
        </Card>
      ) : (
        <Card className="divide-y">
          {items.map((i) => (
            <div key={i.id} className="p-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium truncate">{i.name}</p>
                <p className="text-xs text-muted-foreground">
                  {i.grams}g · {Math.round(Number(i.calories))} kcal
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeIt(i.id)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
