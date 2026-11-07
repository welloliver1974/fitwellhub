import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLocalDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ChevronRight, Heart, HeartPulse, Moon, Watch, Wind } from "lucide-react";

type Vitals = {
  sleep_duration_seconds: number | null;
  resting_heart_rate: number | null;
  avg_heart_rate: number | null;
  spo2_percentage: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  source: string | null;
};

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Resumo compacto dos sinais vitais do Galaxy Watch para a Home.
 *
 * A Home precisa caber o dia inteiro sem virar uma rolagem infinita: aqui
 * ficam apenas os quatro números essenciais. O detalhe completo (estágios do
 * sono, faixa de FC, treinos do relógio) vive na aba "Sinais Vitais" de Corpo.
 *
 * Sem dados, o card não ocupa espaço — o estado vazio completo aparece em Corpo.
 */
export function WatchVitalsSummary({ userId }: { userId?: string }) {
  const { user } = useAuth();
  const currentUserId = userId || user?.id;

  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("daily_health_metrics")
          .select(
            "sleep_duration_seconds, resting_heart_rate, avg_heart_rate, spo2_percentage, blood_pressure_systolic, blood_pressure_diastolic, source",
          )
          .eq("user_id", currentUserId)
          .eq("log_date", getLocalDate())
          .maybeSingle();

        if (!cancelled) setVitals(error ? null : ((data as Vitals) ?? null));
      } catch {
        if (!cancelled) setVitals(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const sleepSec = vitals?.sleep_duration_seconds ?? 0;
  const heart = vitals?.resting_heart_rate ?? vitals?.avg_heart_rate ?? null;
  const spo2 = vitals?.spo2_percentage ?? null;
  const sys = vitals?.blood_pressure_systolic ?? null;
  const dia = vitals?.blood_pressure_diastolic ?? null;

  const hasAny = sleepSec > 0 || heart != null || spo2 != null || (sys != null && dia != null);

  if (!loaded || !hasAny) return null;

  const items: {
    key: string;
    icon: ReactNode;
    label: string;
    value: string;
    unit?: string;
  }[] = [
    {
      key: "sleep",
      icon: <Moon className="h-3.5 w-3.5 text-indigo-400" />,
      label: "Sono",
      value: sleepSec > 0 ? formatDuration(sleepSec) : "—",
    },
    {
      key: "heart",
      icon: <Heart className="h-3.5 w-3.5 text-rose-500" />,
      label: "FC",
      value: heart != null ? `${heart}` : "—",
      unit: heart != null ? "bpm" : undefined,
    },
    {
      key: "spo2",
      icon: <Wind className="h-3.5 w-3.5 text-cyan-500" />,
      label: "SpO2",
      value: spo2 != null ? `${Math.round(spo2)}%` : "—",
    },
    {
      key: "bp",
      icon: <HeartPulse className="h-3.5 w-3.5 text-rose-500" />,
      label: "Pressão",
      value: sys != null && dia != null ? `${sys}/${dia}` : "—",
    },
  ];

  return (
    <Link to="/app/corpo" search={{ tab: "vitals" }} className="block">
      <Card className="rounded-2xl border bg-card/70 backdrop-blur-sm p-4 shadow-sm hover:border-primary/30 transition-colors">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 shrink-0 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Watch className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold text-sm">Relógio</span>
            {vitals?.source === "samsung_health" && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                Samsung Health
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 shrink-0">
            Detalhes
            <ChevronRight className="h-3 w-3" />
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {items.map((item) => (
            <div key={item.key} className="min-w-0">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </div>
              <p className="text-sm font-bold tracking-tight truncate">
                {item.value}
                {item.unit && (
                  <span className="text-[9px] font-normal text-muted-foreground ml-0.5">
                    {item.unit}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </Link>
  );
}
