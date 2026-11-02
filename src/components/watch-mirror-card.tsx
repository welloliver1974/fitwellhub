import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLocalDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Moon, Heart, Bed, Activity, Watch, RotateCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface WatchMirrorCardProps {
  userId?: string;
}

type HealthMetrics = {
  sleep_duration_seconds: number | null;
  sleep_deep_seconds: number | null;
  sleep_rem_seconds: number | null;
  sleep_light_seconds: number | null;
  sleep_awake_seconds: number | null;
  resting_heart_rate: number | null;
  avg_heart_rate: number | null;
  min_heart_rate: number | null;
  max_heart_rate: number | null;
  source: string | null;
  updated_at: string | null;
};

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatMinutes(seconds: number | null): string {
  if (!seconds) return "0m";
  return `${Math.round(seconds / 60)}m`;
}

/**
 * Espelho do Galaxy Watch — painel de Sono e Frequência Cardíaca.
 *
 * Lê a tabela `daily_health_metrics`, alimentada pelo FitWell Bridge via
 * Health Connect. Nunca quebra a página: qualquer campo ausente é tratado
 * com um estado amigável (a tabela pode nem existir ainda em ambientes novos).
 */
export function WatchMirrorCard({ userId }: WatchMirrorCardProps) {
  const { user } = useAuth();
  const currentUserId = userId || user?.id;

  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadData = async (showToast = false) => {
    if (!currentUserId) return;
    setLoading(true);

    try {
      const today = getLocalDate();
      const { data, error } = await supabase
        .from("daily_health_metrics")
        .select("*")
        .eq("user_id", currentUserId)
        .eq("log_date", today)
        .maybeSingle();

      if (error) {
        // Tabela ainda não sincronizada no projeto: silencioso e seguro.
        setMetrics(null);
      } else {
        setMetrics((data as HealthMetrics) ?? null);
      }

      if (showToast) {
        if (data) toast.success("Espelho do relógio atualizado!");
        else toast.info("Ainda não há dados do relógio para hoje.");
      }
    } catch (e) {
      console.warn("Aviso ao buscar daily_health_metrics:", e);
      setMetrics(null);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (currentUserId) loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const totalSleepSec = metrics?.sleep_duration_seconds ?? 0;
  const deepSec = metrics?.sleep_deep_seconds ?? 0;
  const remSec = metrics?.sleep_rem_seconds ?? 0;
  const lightSec = metrics?.sleep_light_seconds ?? 0;
  const stageTotal = deepSec + remSec + lightSec;

  const deepPct = stageTotal > 0 ? (deepSec / stageTotal) * 100 : 0;
  const remPct = stageTotal > 0 ? (remSec / stageTotal) * 100 : 0;
  const lightPct = stageTotal > 0 ? (lightSec / stageTotal) * 100 : 0;

  const hasSleep = totalSleepSec > 0;
  const hasHeart = metrics?.resting_heart_rate != null || metrics?.avg_heart_rate != null;
  const hasAnyData = hasSleep || hasHeart;

  // Estimativa leve de recuperação, combinando sono e FC de repouso
  const recoveryLabel = (() => {
    if (!hasSleep && !hasHeart) return null;
    if (!hasSleep) return "Sem dados de sono";
    if (totalSleepSec >= 25200) return "Recuperação excelente";
    if (totalSleepSec >= 21600) return "Recuperação boa";
    return "Sono curto";
  })();

  return (
    <Card className="rounded-2xl border bg-card/70 backdrop-blur-sm p-4 sm:p-5 shadow-sm">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <Watch className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">Sono & Coração</span>
              {metrics?.source === "health_connect" && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Galaxy Watch
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              Lido direto do Health Connect pelo FitWell Bridge
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => loadData(true)}
          disabled={loading}
          title="Recarregar dados do relógio"
        >
          <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Estado vazio: nenhum dado sincronizado ainda */}
      {loaded && !hasAnyData ? (
        <div className="rounded-xl border border-dashed bg-secondary/20 px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            Nenhum dado do relógio para hoje ainda.
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            Durma com o Galaxy Watch no pulso e abra o FitWell Bridge para sincronizar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Sono da Noite */}
          <div className="rounded-xl border bg-secondary/30 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span className="font-medium flex items-center gap-1.5">
                <Moon className="h-3.5 w-3.5 text-indigo-400" />
                Sono da noite
              </span>
              {hasSleep && (
                <span className="text-[11px] font-semibold text-indigo-500">
                  {formatDuration(totalSleepSec)}
                </span>
              )}
            </div>

            {hasSleep ? (
              <>
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
                  {formatDuration(totalSleepSec)}
                </div>

                {stageTotal > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${deepPct}%` }}
                        className="bg-indigo-700 dark:bg-indigo-400 h-full"
                        title={`Profundo: ${formatMinutes(deepSec)}`}
                      />
                      <div
                        style={{ width: `${remPct}%` }}
                        className="bg-purple-500 h-full"
                        title={`REM: ${formatMinutes(remSec)}`}
                      />
                      <div
                        style={{ width: `${lightPct}%` }}
                        className="bg-indigo-300 dark:bg-indigo-600 h-full"
                        title={`Leve: ${formatMinutes(lightSec)}`}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>Prof. {formatMinutes(deepSec)}</span>
                      <span>REM {formatMinutes(remSec)}</span>
                      <span>Leve {formatMinutes(lightSec)}</span>
                    </div>
                  </div>
                )}

                <div className="pt-2 mt-2 border-t border-border/40 text-[11px] text-muted-foreground flex items-center gap-1">
                  <Bed className="h-3 w-3 text-indigo-400" />
                  {recoveryLabel}
                </div>
              </>
            ) : (
              <div className="py-2">
                <p className="text-lg font-bold text-muted-foreground">—</p>
                <p className="text-[11px] text-muted-foreground">Sem registro desta noite</p>
              </div>
            )}
          </div>

          {/* Frequência Cardíaca */}
          <div className="rounded-xl border bg-secondary/30 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span className="font-medium flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5 text-rose-500" />
                Coração
              </span>
              {metrics?.resting_heart_rate != null && (
                <span className="text-[11px] font-semibold text-rose-500">repouso</span>
              )}
            </div>

            {hasHeart ? (
              <>
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                  {metrics?.resting_heart_rate ?? metrics?.avg_heart_rate}
                  <span className="text-xs font-normal text-muted-foreground ml-1">bpm</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {metrics?.resting_heart_rate != null
                    ? "Frequência cardíaca de repouso"
                    : "Média do dia"}
                </p>
                <div className="pt-2 mt-2 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-rose-500" />
                    Variação
                  </span>
                  <span>
                    {metrics?.min_heart_rate != null && metrics?.max_heart_rate != null
                      ? `${metrics.min_heart_rate}–${metrics.max_heart_rate} bpm`
                      : "—"}
                  </span>
                </div>
              </>
            ) : (
              <div className="py-2">
                <p className="text-lg font-bold text-muted-foreground">—</p>
                <p className="text-[11px] text-muted-foreground">Aguardando medição</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rodapé com dica de leitura para treino */}
      {hasAnyData && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-secondary/30 px-3 py-2">
          <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {hasSleep && totalSleepSec < 21600
              ? "Noite curta: considere reduzir volume ou intensidade do treino hoje."
              : "Dados disponíveis para o Hermes avaliar sua recuperação no Telegram."}
          </p>
        </div>
      )}
    </Card>
  );
}
