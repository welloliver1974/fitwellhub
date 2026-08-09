import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2, Clock, ChefHat, Check, Plus } from "lucide-react";
import { suggestMealByRemainingMacros } from "@/server-fns/nutrition.functions";
import type { SuggestedMealOption } from "@/server-fns/nutrition.functions";
import { MEAL_TYPES } from "@/lib/meal-types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";

interface SuggestMealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session | null;
  user: any;
  remaining: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  ensureMeal: (type: string) => Promise<{ id: string; meal_type: string; meal_date: string }>;
  onMealAdded: () => void;
}

export function SuggestMealDialog({
  open,
  onOpenChange,
  session,
  user,
  remaining,
  ensureMeal,
  onMealAdded,
}: SuggestMealDialogProps) {
  const [loading, setLoading] = useState(false);
  const [addingIndex, setAddingIndex] = useState<number | null>(null);
  const [mealType, setMealType] = useState<string>(MEAL_TYPES[3]); // "Lanche" por padrão
  const [suggestions, setSuggestions] = useState<SuggestedMealOption[]>([]);

  const handleFetch = async () => {
    setLoading(true);
    setSuggestions([]);
    try {
      const res = await suggestMealByRemainingMacros({
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        data: {
          remainingCalories: remaining.calories,
          remainingProtein: remaining.protein_g,
          remainingCarbs: remaining.carbs_g,
          remainingFat: remaining.fat_g,
          preferredMealType: mealType,
        },
      });
      setSuggestions(res.suggestions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar sugestões.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddMeal = async (option: SuggestedMealOption, index: number) => {
    if (!user) return;
    setAddingIndex(index);
    try {
      const meal = await ensureMeal(mealType);
      const rows = option.items.map((it) => ({
        user_id: user.id,
        meal_id: meal.id,
        name: it.name,
        grams: it.grams,
        calories: it.calories,
        protein_g: it.protein_g,
        carbs_g: it.carbs_g,
        fat_g: it.fat_g,
      }));

      const { error } = await supabase.from("meal_items").insert(rows);
      if (error) throw error;

      toast.success(`"${option.title}" adicionado em ${mealType}!`);
      onMealAdded();
      onOpenChange(false);
      setSuggestions([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao inserir refeição.");
    } finally {
      setAddingIndex(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            O que comer agora? (IA)
          </DialogTitle>
          <DialogDescription>
            A IA calcula sugestões personalizadas com base nos seus macros restantes de hoje.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card dos macros restantes atuais */}
          <div className="rounded-2xl border bg-card p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Saldo Restante Hoje
              </span>
              <span
                className={`text-xs font-extrabold ${
                  remaining.calories < 0 ? "text-destructive" : "text-primary"
                }`}
              >
                {remaining.calories < 0
                  ? `${Math.round(remaining.calories)} kcal (Excedido)`
                  : `${Math.round(remaining.calories)} kcal`}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-secondary/60 p-2">
                <span className="block text-muted-foreground text-[10px]">Proteína</span>
                <span
                  className={`font-bold ${
                    remaining.protein_g < 0 ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {Math.round(remaining.protein_g)}g
                </span>
              </div>
              <div className="rounded-xl bg-secondary/60 p-2">
                <span className="block text-muted-foreground text-[10px]">Carbo</span>
                <span
                  className={`font-bold ${
                    remaining.carbs_g < 0 ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {Math.round(remaining.carbs_g)}g
                </span>
              </div>
              <div className="rounded-xl bg-secondary/60 p-2">
                <span className="block text-muted-foreground text-[10px]">Gordura</span>
                <span
                  className={`font-bold ${
                    remaining.fat_g < 0 ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {Math.round(remaining.fat_g)}g
                </span>
              </div>
            </div>
          </div>

          {/* Seletor do tipo de refeição */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Qual refeição deseja realizar?
            </label>
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

          {/* Botão para buscar */}
          {suggestions.length === 0 && (
            <Button onClick={handleFetch} disabled={loading} className="w-full gap-2 mt-2">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Gerando sugestões inteligentes…
                </>
              ) : (
                <>
                  <ChefHat className="h-4 w-4" /> Sugerir 3 Opções de Refeição
                </>
              )}
            </Button>
          )}

          {/* Lista de sugestões */}
          {suggestions.length > 0 && (
            <div className="space-y-3 pt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Opções Encontradas
              </p>
              {suggestions.map((opt, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border bg-card p-4 space-y-3 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-foreground">{opt.title}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground bg-secondary/80 px-2 py-1 rounded-lg shrink-0">
                      <Clock className="h-3 w-3" />
                      {opt.prepTime}
                    </div>
                  </div>

                  {/* Resumo de macros da sugestão */}
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium bg-primary/5 border border-primary/10 rounded-xl p-2.5">
                    <span className="font-bold text-primary">{opt.totals.calories} kcal</span>
                    <span className="text-muted-foreground">·</span>
                    <span>P: {opt.totals.protein_g}g</span>
                    <span className="text-muted-foreground">·</span>
                    <span>C: {opt.totals.carbs_g}g</span>
                    <span className="text-muted-foreground">·</span>
                    <span>G: {opt.totals.fat_g}g</span>
                  </div>

                  {/* Ingredientes */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-muted-foreground">Ingredientes:</p>
                    <ul className="text-xs space-y-1 text-foreground/80 pl-2">
                      {opt.items.map((it, i) => (
                        <li key={i} className="flex justify-between">
                          <span>• {it.name} ({it.grams}g)</span>
                          <span className="text-muted-foreground">{it.calories} kcal</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Botão de inserir */}
                  <Button
                    size="sm"
                    className="w-full gap-2"
                    disabled={addingIndex === idx}
                    onClick={() => handleAddMeal(opt, idx)}
                  >
                    {addingIndex === idx ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-4 w-4" /> Registrar em {mealType}
                      </>
                    )}
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={handleFetch}
                disabled={loading}
                className="w-full gap-2"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Gerar outras opções
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
