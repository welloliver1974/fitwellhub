import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Zap, Loader2 } from "lucide-react";
import { MEAL_TYPES } from "@/lib/meal-types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QuickAddMealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  ensureMeal: (type: string) => Promise<{ id: string; meal_type: string; meal_date: string }>;
  onMealAdded: () => void;
}

export function QuickAddMealDialog({
  open,
  onOpenChange,
  user,
  ensureMeal,
  onMealAdded,
}: QuickAddMealDialogProps) {
  const [mealType, setMealType] = useState<string>(MEAL_TYPES[1]); // Almoço por padrão
  const [name, setName] = useState("");
  const [calories, setCalories] = useState<number | "">("");
  const [protein, setProtein] = useState<number | "">("");
  const [carbs, setCarbs] = useState<number | "">("");
  const [fat, setFat] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    const title = name.trim() || "Refeição rápida";
    const calVal = Number(calories);

    if (!calVal || calVal <= 0) {
      toast.error("Informe a quantidade de calorias.");
      return;
    }

    setLoading(true);
    try {
      const meal = await ensureMeal(mealType);
      const { error } = await supabase.from("meal_items").insert({
        user_id: user.id,
        meal_id: meal.id,
        name: title,
        grams: 100,
        calories: calVal,
        protein_g: Number(protein) || 0,
        carbs_g: Number(carbs) || 0,
        fat_g: Number(fat) || 0,
      });

      if (error) throw error;

      toast.success(`"${title}" registrado em ${mealType}!`);
      setName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      onMealAdded();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao salvar refeição.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500 fill-amber-500/20" />
            Registro Rápido de Refeição
          </DialogTitle>
          <DialogDescription>
            Ideal para quando você comer fora de casa. Informe apenas as calorias e macros estimados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-1">
          <div>
            <Label className="text-xs">Refeição</Label>
            <Select value={mealType} onValueChange={setMealType}>
              <SelectTrigger className="mt-1">
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
            <Label className="text-xs">Nome / Descrição da refeição</Label>
            <Input
              className="mt-1"
              placeholder="Ex: Almoço por quilo, Pizza em família…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Calorias (kcal) *</Label>
            <Input
              type="number"
              className="mt-1"
              placeholder="Ex: 650"
              value={calories}
              onChange={(e) => setCalories(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <Label className="text-xs text-muted-foreground">Proteína (g)</Label>
              <Input
                type="number"
                className="mt-1"
                placeholder="Ex: 35"
                value={protein}
                onChange={(e) => setProtein(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Carbo (g)</Label>
              <Input
                type="number"
                className="mt-1"
                placeholder="Ex: 50"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Gordura (g)</Label>
              <Input
                type="number"
                className="mt-1"
                placeholder="Ex: 20"
                value={fat}
                onChange={(e) => setFat(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || calories === ""}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registrando…
              </>
            ) : (
              "Registrar Refeição"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
