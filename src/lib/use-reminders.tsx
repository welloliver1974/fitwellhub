import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLocalDate } from "@/lib/utils";
import { evaluateSmartAlerts, type SmartAlertKey } from "@/lib/smart-alerts";

// Polls every 30s and fires a Notification when time matches.
// Stores last-fired timestamp per reminder in localStorage to avoid duplicates.
export function useReminders() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    let active = true;

    const tick = async () => {
      if (!active) return;
      if (Notification.permission !== "granted") return;

      const { data: reminders } = await supabase
        .from("reminders")
        .select("id,kind,time_of_day,days_of_week,enabled")
        .eq("user_id", user.id)
        .eq("enabled", true);
      if (!reminders) return;

      const now = new Date();
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const cur = `${hh}:${mm}`;
      const day = now.getDay();
      const todayKey = getLocalDate(now);

      // Lembretes "inteligentes" (kind "smart") não têm horário fixo: disparam
      // conforme os dados do dia (ver bloco abaixo). Os fixos continuam no loop.
      const smartReminders = reminders.filter(
        (r) => r.kind === "smart" && (r.days_of_week as number[]).includes(day),
      );
      const fixedReminders = reminders.filter((r) => r.kind !== "smart");

      for (const r of fixedReminders) {
        if (!(r.days_of_week as number[]).includes(day)) continue;
        if ((r.time_of_day as string).slice(0, 5) !== cur) continue;
        const key = `rem-${r.id}-${todayKey}`;
        if (localStorage.getItem(key)) continue;
        const titles: Record<string, string> = {
          water: "💧 Hora da água",
          meal: "🍽️ Hora da refeição",
          workout: "💪 Hora do treino",
          weight: "⚖️ Registre seu peso",
        };
        try {
          new Notification(titles[r.kind] ?? "Lembrete", {
            body: "Toque para abrir o app",
            icon: "/icon-192.png",
          });
          localStorage.setItem(key, "1");
        } catch (error) {
          console.error("Failed to show reminder notification:", error);
        }
      }

      // ===== Alertas inteligentes (7.4): condicionais aos dados do dia =====
      if (smartReminders.length === 0) return;
      const hour = now.getHours();
      // Janela de disparo: só faz sentido a partir do fim da tarde; antes disso
      // nada é avaliado e nenhuma query de dados do dia sai.
      if (hour < 16) return;
      const smartKeys: Record<SmartAlertKey, string> = {
        protein: `smart-protein-${todayKey}`,
        calories: `smart-calories-${todayKey}`,
        water: `smart-water-${todayKey}`,
      };
      // Early-skip: se os 3 gatilhos já dispararam hoje, não faz query nenhuma.
      if (
        (Object.keys(smartKeys) as SmartAlertKey[]).every((k) =>
          localStorage.getItem(smartKeys[k]),
        )
      ) {
        return;
      }
      try {
        const [{ data: g }, { data: meals }, { data: waterRows }] = await Promise.all([
          supabase.from("goals").select("calories,protein_g").eq("user_id", user.id).maybeSingle(),
          supabase.from("meals").select("id").eq("user_id", user.id).eq("meal_date", todayKey),
          supabase
            .from("water_logs")
            .select("ml")
            .eq("user_id", user.id)
            .eq("log_date", todayKey),
        ]);
        if (!active) return;

        const ids = (meals ?? []).map((m) => (m as { id: string }).id);
        const items = ids.length
          ? ((await supabase
              .from("meal_items")
              .select("calories,protein_g")
              .in("meal_id", ids)).data ?? [])
          : [];
        if (!active) return;

        const consumed = items.reduce(
          (acc, item) => ({
            calories: acc.calories + Number(item.calories || 0),
            protein_g: acc.protein_g + Number(item.protein_g || 0),
          }),
          { calories: 0, protein_g: 0 },
        );
        const proteinGoal = Number((g as { protein_g?: number } | null)?.protein_g ?? 0);
        const caloriesGoal = Number((g as { calories?: number } | null)?.calories ?? 0);
        const waterMl = (waterRows ?? []).reduce(
          (acc, w) => acc + Number((w as { ml?: number }).ml ?? 0),
          0,
        );

        const alerts = evaluateSmartAlerts({
          hour,
          consumed,
          proteinGoal,
          remainingCalories: caloriesGoal - consumed.calories,
          waterMl,
        });
        for (const alert of alerts) {
          if (localStorage.getItem(smartKeys[alert.key])) continue;
          try {
            new Notification(alert.title, { body: alert.body, icon: "/icon-192.png" });
            localStorage.setItem(smartKeys[alert.key], "1");
          } catch (error) {
            console.error("Failed to show smart reminder notification:", error);
          }
        }
      } catch (error) {
        // Erro transiente/offline: tenta de novo no próximo tick.
        console.error("Failed to evaluate smart reminders:", error);
      }
    };

    tick();
    const iv = setInterval(tick, 30_000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [user]);
}
