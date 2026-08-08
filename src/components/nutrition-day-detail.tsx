import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatLocalDate, getLocalDate, getLocalDateMinusDays } from "@/lib/utils";
import { MEAL_TYPES } from "@/lib/meal-types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UtensilsCrossed } from "lucide-react";

type DayItem = {
  id: string;
  meal_id: string;
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

// Detalhe de alimentação de um dia passado: lista as refeições/itens do dia
// selecionado (por padrão "hoje", mas date input permite qualquer dia) com o
// total do dia. Espelha a lista da tela de Nutrição, só que em modo leitura.
export function NutDayDetail() {
  const { user } = useAuth();
  // Padrão: ONTEM (a tela principal de Nutrição já é o diário de hoje).
  const [date, setDate] = useState(() => getLocalDateMinusDays(1));
  const [groups, setGroups] = useState<{ type: string; items: DayItem[] }[]>([]);
  const [loading, setLoading] = useState(true);

  // Depends on user?.id (string estável), não no objeto user — o contexto pode
  // recriar o objeto a cada render e causaria re-busca em loop no useEffect.
  const userId = user?.id;
  useEffect(() => {
    if (!userId || !date) {
      setGroups([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: meals } = await supabase
        .from("meals")
        .select("id,meal_type")
        .eq("user_id", userId)
        .eq("meal_date", date);
      const ids = ((meals ?? []) as { id: string }[]).map((m) => m.id);
      let its: DayItem[] = [];
      if (ids.length) {
        const { data: items } = await supabase
          .from("meal_items")
          .select("id,meal_id,name,grams,calories,protein_g,carbs_g,fat_g")
          .in("meal_id", ids);
        its = (items ?? []) as DayItem[];
      }
      if (cancelled) return;
      const dayMeals = (meals ?? []) as { id: string; meal_type: string }[];
      // Grupos na ordem canônica da tela de Nutrição.
      const canonical = MEAL_TYPES.map((type) => {
        const meal = dayMeals.find((m) => m.meal_type === type);
        return { type, items: meal ? its.filter((i) => i.meal_id === meal.id) : [] };
      });
      // Fallback: tipos fora da lista (ex.: o legado "Lanche", anterior ao
      // desdobramento manhã/tarde) continuam aparecendo no final — o histórico
      // do usuário não fica invisível por não ser mais opção de novo registro.
      const extra = [...new Set(dayMeals.map((m) => m.meal_type))]
        .filter((t) => !MEAL_TYPES.includes(t))
        .map((type) => {
          const meal = dayMeals.find((m) => m.meal_type === type);
          return { type, items: meal ? its.filter((i) => i.meal_id === meal.id) : [] };
        });
      setGroups([...canonical, ...extra]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, date]);

  const totals = useMemo(
    () =>
      groups.reduce(
        (acc, g) =>
          g.items.reduce(
            (a, i) => ({
              calories: a.calories + Number(i.calories || 0),
              protein_g: a.protein_g + Number(i.protein_g || 0),
              carbs_g: a.carbs_g + Number(i.carbs_g || 0),
              fat_g: a.fat_g + Number(i.fat_g || 0),
            }),
            acc,
          ),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      ),
    [groups],
  );

  const shown = groups.filter((g) => g.items.length > 0);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Alimentação do dia
            </p>
            <p className="text-lg font-display font-bold">{formatLocalDate(date)}</p>
          </div>
        </div>
        <div className="w-44">
          <Label htmlFor="day-detail-date" className="text-xs">
            Dia
          </Label>
          <Input
            id="day-detail-date"
            type="date"
            value={date}
            max={getLocalDate()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Nenhuma refeição registrada nesse dia.
        </p>
      ) : (
        <div className="space-y-4 mt-4">
          {shown.map((g) => (
            <div key={g.type}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                {g.type}
              </p>
              <div className="rounded-lg border divide-y">
                {g.items.map((i) => (
                  <div key={i.id} className="p-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{i.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.grams}g · {Math.round(Number(i.calories))} kcal · P{" "}
                        {Math.round(Number(i.protein_g))} · C {Math.round(Number(i.carbs_g))} · G{" "}
                        {Math.round(Number(i.fat_g))}
                      </p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">
                      {Math.round(Number(i.calories))} kcal
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded-xl bg-secondary/50 p-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total do dia</span>
            <span className="font-semibold">
              {Math.round(totals.calories)} kcal · P {Math.round(totals.protein_g)} · C{" "}
              {Math.round(totals.carbs_g)} · G {Math.round(totals.fat_g)}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}