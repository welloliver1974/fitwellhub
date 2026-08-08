import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { isDefaultGoals, matchesSuggestion, suggestGoals } from "@/lib/nutrition-goals";
import { calculateTdee } from "@/server-fns/corpo.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

// Valores da sugestão calculada (server fn `calculateTdee`), quando disponível.
type TdeeData = { tdee: number; bmr: number; activityFactor: number; weight: number };

export function GoalsPage() {
  const { user, session } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const [calories, setCalories] = useState(2000);
  const [protein, setProtein] = useState(140);
  const [carbs, setCarbs] = useState(220);
  const [fat, setFat] = useState(65);
  const [tdeeData, setTdeeData] = useState<TdeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ data }, res] = await Promise.all([
        supabase
          .from("goals")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        calculateTdee({ headers: { Authorization: `Bearer ${session?.access_token}` } }).catch(
          () => null,
        ),
      ]);

      let tdee: TdeeData | null = null;
      if (res && res.tdee != null && res.weight != null) {
        tdee = {
          tdee: res.tdee,
          bmr: res.bmr ?? 0,
          activityFactor: res.activityFactor ?? 1.2,
          weight: res.weight,
        };
        setTdeeData(tdee);
      }

      if (data && !isDefaultGoals(data)) {
        // Meta customizada (editada): carrega o valor salvo.
        setCalories(data.calories);
        setProtein(data.protein_g);
        setCarbs(data.carbs_g);
        setFat(data.fat_g);
      } else if (tdee) {
        // Sem meta ou ainda padrão do signup → já vem com a sugestão calculada.
        const s = suggestGoals(tdee.tdee, tdee.weight);
        setCalories(s.calories);
        setProtein(s.protein_g);
        setCarbs(s.carbs_g);
        setFat(s.fat_g);
      }
      setLoading(false);
    })();
  }, [userId, session?.access_token]);

  const applySuggestion = () => {
    if (!tdeeData) return;
    const s = suggestGoals(tdeeData.tdee, tdeeData.weight);
    setCalories(s.calories);
    setProtein(s.protein_g);
    setCarbs(s.carbs_g);
    setFat(s.fat_g);
  };

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    // goal_auto = true SOMENTE se os campos continuam batendo com a sugestão
    // (o usuário não mexeu ou reaplicou "Usar calculada") → o app segue
    // sincronizando sozinho. Editou manualmente → goal_auto = false → o home
    // nunca mais sobrescreve.
    const goalAuto =
      !!tdeeData &&
      matchesSuggestion(
        { calories, protein_g: protein, carbs_g: carbs, fat_g: fat },
        tdeeData.tdee,
        tdeeData.weight,
      );
    const { error } = await supabase.from("goals").upsert(
      {
        user_id: userId,
        calories,
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
        goal_auto: goalAuto,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Metas atualizadas");
    navigate({ to: "/app" });
  };

  if (loading) return <p className="text-muted-foreground">Carregando…</p>;

  const macroKcal = protein * 4 + carbs * 4 + fat * 9;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/app" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-display font-bold">Metas diárias</h1>
          <p className="text-xs text-muted-foreground">Ajuste seus alvos de calorias e macros</p>
        </div>
      </div>

      {tdeeData ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>
              Sugestão calculada: <strong className="text-foreground">{tdeeData.tdee} kcal</strong>{" "}
              · TMB {tdeeData.bmr} × fator {tdeeData.activityFactor.toLocaleString("pt-BR")} · peso{" "}
              {tdeeData.weight} kg
            </span>
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-7 text-xs"
            onClick={applySuggestion}
          >
            Usar calculada
          </Button>
        </div>
      ) : (
        <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
          Preencha sexo, altura, nascimento e peso em Corpo / Peso para calcularmos sua meta.
        </div>
      )}

      <Card className="p-5 space-y-4">
        <Field
          label="Calorias (kcal)"
          value={calories}
          onChange={setCalories}
          icon={<Target className="h-4 w-4" />}
        />
        <Field label="Proteína (g)" value={protein} onChange={setProtein} />
        <Field label="Carboidratos (g)" value={carbs} onChange={setCarbs} />
        <Field label="Gorduras (g)" value={fat} onChange={setFat} />

        <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
          Soma calórica dos macros: <strong className="text-foreground">{macroKcal} kcal</strong>
          {Math.abs(macroKcal - calories) > 50 && (
            <span className="block mt-1 text-amber-600">
              ⚠️ Difere {Math.abs(macroKcal - calories)} kcal da meta calórica.
            </span>
          )}
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Salvando…" : "Salvar metas"}
        </Button>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  icon,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <Label className="flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-1.5"
      />
    </div>
  );
}