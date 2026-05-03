import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Sparkles, Trash2, Apple } from "lucide-react";
import { lookupNutrition } from "@/server/nutrition.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/nutricao")({
  component: NutricaoPage,
});

type Meal = { id: string; meal_type: string };
type Item = {
  id: string;
  meal_id: string;
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

const MEAL_TYPES = ["Café da manhã", "Almoço", "Lanche", "Jantar", "Ceia"];

function NutricaoPage() {
  const { user } = useAuth();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [mealType, setMealType] = useState(MEAL_TYPES[0]);
  const [query, setQuery] = useState("");
  const [grams, setGrams] = useState(100);
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const load = async () => {
    if (!user) return;
    const { data: ms } = await supabase
      .from("meals")
      .select("id,meal_type")
      .eq("user_id", user.id)
      .eq("meal_date", today)
      .order("created_at");
    setMeals(ms ?? []);
    const ids = (ms ?? []).map((m) => m.id);
    if (ids.length) {
      const { data: its } = await supabase
        .from("meal_items")
        .select("*")
        .in("meal_id", ids)
        .order("created_at");
      setItems((its ?? []) as Item[]);
    } else {
      setItems([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const addFood = async () => {
    if (!user || !query.trim()) return;
    setLoading(true);
    try {
      const macros = await lookupNutrition({ data: { query: query.trim(), grams } });

      let meal = meals.find((m) => m.meal_type === mealType);
      if (!meal) {
        const { data: newMeal, error } = await supabase
          .from("meals")
          .insert({ user_id: user.id, meal_type: mealType, meal_date: today })
          .select("id,meal_type")
          .single();
        if (error) throw error;
        meal = newMeal as Meal;
      }

      const { error: e2 } = await supabase.from("meal_items").insert({
        user_id: user.id,
        meal_id: meal.id,
        name: macros.name,
        grams,
        calories: macros.calories,
        protein_g: macros.protein_g,
        carbs_g: macros.carbs_g,
        fat_g: macros.fat_g,
      });
      if (e2) throw e2;

      toast.success(`${macros.name} adicionado`);
      setQuery("");
      setGrams(100);
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar alimento");
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (id: string) => {
    await supabase.from("meal_items").delete().eq("id", id);
    await load();
  };

  const grouped = MEAL_TYPES.map((type) => {
    const meal = meals.find((m) => m.meal_type === type);
    const its = meal ? items.filter((i) => i.meal_id === meal.id) : [];
    return { type, items: its };
  }).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Nutrição</h1>
          <p className="text-sm text-muted-foreground">Diário alimentar de hoje</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full">
              <Plus className="h-4 w-4 mr-1" /> Alimento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Adicionar alimento
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Refeição</Label>
                <Select value={mealType} onValueChange={setMealType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEAL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alimento</Label>
                <Input
                  placeholder="Ex: arroz branco cozido, peito de frango grelhado…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div>
                <Label>Porção (g)</Label>
                <Input type="number" value={grams} onChange={(e) => setGrams(Number(e.target.value))} />
              </div>
              <Button onClick={addFood} disabled={loading || !query.trim()} className="w-full">
                {loading ? "Calculando macros…" : "Adicionar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {grouped.length === 0 ? (
        <Card className="p-10 text-center">
          <Apple className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhuma refeição registrada hoje.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ type, items: its }) => (
            <div key={type}>
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 px-1">{type}</h2>
              <Card className="divide-y">
                {its.map((i) => (
                  <div key={i.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{i.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.grams}g · {Math.round(Number(i.calories))} kcal · P {Math.round(Number(i.protein_g))} · C {Math.round(Number(i.carbs_g))} · G {Math.round(Number(i.fat_g))}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(i.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}