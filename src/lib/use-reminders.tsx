import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

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
      const todayKey = now.toISOString().slice(0, 10);

      for (const r of reminders) {
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
    };

    tick();
    const iv = setInterval(tick, 30_000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [user]);
}
