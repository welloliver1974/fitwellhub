import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Target } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/metas")({
  component: GoalsPage,
});

function GoalsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [calories, setCalories] = useState(2000);
  const [protein, setProtein] = useState(140);
  const [carbs, setCarbs] = useState(220);
  const [fat, setFat] = useState(65);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setCalories(data.calories);
        setProtein(data.protein_g);
        setCarbs(data.carbs_g);
        setFat(data.fat_g);
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("goals").upsert(
      {
        user_id: user.id,
        calories,
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
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
