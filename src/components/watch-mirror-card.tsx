import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLocalDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Moon, Heart, Bed, Activity, Watch, RotateCw, Sparkles, Flame, Timer, MapPin, Wind, HeartPulse, Plus } from "lucide-react";
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
  spo2_percentage: number | null;
  spo2_min_percentage: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  blood_pressure_time: string | null;
  blood_pressure_source: string | null;
  source: string | null;
  updated_at: string | null;
};

type WatchWorkout = {
  id: string;
  exercise_type: string;
  title: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number | null;
  calories_kcal: number | null;
  distance_meters: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
};

const WORKOUT_ICONS: Record<string, string> = {
  Esteira: "🏃",
  Corrida: "🏃",
  Caminhada: "🚶",
  Musculação: "🏋️",
  Calistenia: "🤸",
  Ciclismo: "🚴",
  "Bicicleta Ergométrica": "🚴",
  Natação: "🏊",
  HIIT: "⚡",
  Pilates: "🧘",
  Yoga: "🧘",
  Remo: "🚣",
  Elíptico: "🏃",
  Alongamento: "🧘",
  Trilha: "🥾",
};

function workoutIcon(type: string): string {
  return WORKOUT_ICONS[type] ?? "💪";
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  const [workouts, setWorkouts] = useState<WatchWorkout[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Registro manual de pressão — necessário porque a Samsung Health não
  // exporta pressão arterial para o Health Connect em várias versões.
  const [bpOpen, setBpOpen] = useState(false);
  const [bpSys, setBpSys] = useState("");
  const [bpDia, setBpDia] = useState("");
  const [bpSaving, setBpSaving] = useState(false);

  const loadData = async (showToast = false) => {
    if (!currentUserId) return;
    setLoading(true);

    try {
      const today = getLocalDate();
      const [{ data, error }, { data: workoutsData }] = await Promise.all([
        supabase
          .from("daily_health_metrics")
          .select("*")
          .eq("user_id", currentUserId)
          .eq("log_date", today)
          .maybeSingle(),
        // Tabela opcional: se não existir, o card continua funcionando sem treinos.
        supabase
          .from("watch_workouts")
          .select(
            "id, exercise_type, title, start_time, end_time, duration_minutes, calories_kcal, distance_meters, avg_heart_rate, max_heart_rate",
          )
          .eq("user_id", currentUserId)
          .eq("log_date", today)
          .order("start_time", { ascending: true }),
      ]);

      if (error) {
        // Tabela ainda não sincronizada no projeto: silencioso e seguro.
        setMetrics(null);
      } else {
        setMetrics((data as HealthMetrics) ?? null);
      }

      setWorkouts((workoutsData as WatchWorkout[] | null) ?? []);

      if (showToast) {
        if (data || (workoutsData && workoutsData.length > 0))
          toast.success("Espelho do relógio atualizado!");
        else toast.info("Ainda não há dados do relógio para hoje.");
      }
    } catch (e) {
      console.warn("Aviso ao buscar dados do relógio:", e);
      setMetrics(null);
      setWorkouts([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (currentUserId) loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const saveBloodPressure = async () => {
    if (!currentUserId) return;

    const sys = parseInt(bpSys, 10);
    const dia = parseInt(bpDia, 10);

    if (!Number.isFinite(sys) || !Number.isFinite(dia)) {
      toast.error("Informe os dois valores.");
      return;
    }
    if (sys < 60 || sys > 250) {
      toast.error("Sistólica deve estar entre 60 e 250 mmHg.");
      return;
    }
    if (dia < 30 || dia > 150) {
      toast.error("Diastólica deve estar entre 30 e 150 mmHg.");
      return;
    }
    if (dia >= sys) {
      toast.error("A diastólica precisa ser menor que a sistólica.");
      return;
    }

    setBpSaving(true);
    try {
      const basePayload = {
        user_id: currentUserId,
        log_date: getLocalDate(),
        blood_pressure_systolic: sys,
        blood_pressure_diastolic: dia,
        blood_pressure_time: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let { error } = await supabase
        .from("daily_health_metrics")
        .upsert(
          { ...basePayload, blood_pressure_source: "manual" },
          { onConflict: "user_id,log_date" },
        );

      // Se a coluna blood_pressure_source ainda não existir no Supabase
      // (migration pendente), salva mesmo assim — o valor é o que importa.
      if (error && /blood_pressure_source|column/i.test(error.message ?? "")) {
        ({ error } = await supabase
          .from("daily_health_metrics")
          .upsert(basePayload, { onConflict: "user_id,log_date" }));
      }

      if (error) throw error;

      toast.success("Pressão registrada!");
      setBpOpen(false);
      setBpSys("");
      setBpDia("");
      await loadData();
    } catch (e) {
      console.error("Erro ao registrar pressão:", e);
      toast.error(
        "Não foi possível registrar. Rode a migration 20261103_spo2_blood_pressure.sql no Supabase.",
      );
    } finally {
      setBpSaving(false);
    }
  };

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
  const hasSpo2 = metrics?.spo2_percentage != null;
  const hasBloodPressure =
    metrics?.blood_pressure_systolic != null && metrics?.blood_pressure_diastolic != null;
  const hasVitals = hasSpo2 || hasBloodPressure;
  const hasWorkouts = workouts.length > 0;
  const hasAnyData = hasSleep || hasHeart || hasWorkouts || hasVitals;

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
              <span className="font-semibold text-sm">Sinais Vitais & Sono</span>
              {metrics?.source && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  {metrics.source === "samsung_health" ? "Samsung Health" : "Galaxy Watch"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {metrics?.source === "samsung_health"
                ? "Lido direto do Samsung Health pelo FitWell Bridge"
                : "Lido direto do Health Connect pelo FitWell Bridge"}
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

      {/* Sinais Vitais: Oxigenação (SpO2) e Pressão Arterial */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        {/* Oxigenação no Sangue */}
        <div className="rounded-xl border bg-secondary/30 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span className="font-medium flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5 text-cyan-500" />
              Oxigenação (SpO2)
            </span>
            {hasSpo2 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                {metrics.spo2_percentage! >= 95 ? "Normal" : "Atenção"}
              </span>
            )}
          </div>

          {hasSpo2 ? (
            <>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-cyan-600 dark:text-cyan-400">
                {Math.round(metrics.spo2_percentage!)}
                <span className="text-xs font-normal text-muted-foreground ml-0.5">%</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {metrics.spo2_min_percentage != null &&
                metrics.spo2_min_percentage < metrics.spo2_percentage!
                  ? `Mínima registrada: ${Math.round(metrics.spo2_min_percentage)}%`
                  : "Saturação arterial de oxigênio"}
              </p>
            </>
          ) : (
            <div className="py-2">
              <p className="text-lg font-bold text-muted-foreground">—</p>
              <p className="text-[11px] text-muted-foreground">Aguardando medição do relógio</p>
            </div>
          )}
        </div>

        {/* Pressão Arterial — sempre visível, com registro manual */}
        <div className="rounded-xl border bg-secondary/30 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span className="font-medium flex items-center gap-1.5">
              <HeartPulse className="h-3.5 w-3.5 text-rose-500" />
              Pressão Arterial
            </span>
            {hasBloodPressure && metrics.blood_pressure_time && (
              <span className="text-[10px] text-muted-foreground">
                {formatClock(metrics.blood_pressure_time)}
                {metrics.blood_pressure_source === "manual" ? " · manual" : ""}
              </span>
            )}
          </div>

          {hasBloodPressure ? (
            <>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                {metrics.blood_pressure_systolic}
                <span className="text-base font-normal text-muted-foreground mx-1">/</span>
                {metrics.blood_pressure_diastolic}
                <span className="text-xs font-normal text-muted-foreground ml-1">mmHg</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {metrics.blood_pressure_systolic! <= 120 && metrics.blood_pressure_diastolic! <= 80
                  ? "Ótima (Padrão 12/8)"
                  : metrics.blood_pressure_systolic! <= 130 && metrics.blood_pressure_diastolic! <= 85
                    ? "Normal"
                    : "Aferição recente"}
              </p>
            </>
          ) : (
            <div className="py-2">
              <p className="text-lg font-bold text-muted-foreground">—</p>
              <p className="text-[11px] text-muted-foreground">Sem aferição registrada</p>
            </div>
          )}

          <Dialog open={bpOpen} onOpenChange={setBpOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 -ml-2 h-7 text-xs text-primary gap-1"
                onClick={(e) => {
                  e.preventDefault();
                  setBpOpen(true);
                }}
              >
                <Plus className="h-3 w-3" />
                Registrar
              </Button>
            </DialogTrigger>
            <DialogContent onClick={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>Registrar pressão arterial</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Sistólica (máxima)</p>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="120"
                    value={bpSys}
                    onChange={(e) => setBpSys(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Diastólica (mínima)</p>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="80"
                    value={bpDia}
                    onChange={(e) => setBpDia(e.target.value)}
                  />
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Meça sentado, braço apoiado na altura do coração e em repouso por 5 minutos.
              </p>

              <DialogFooter>
                <Button onClick={saveBloodPressure} disabled={bpSaving}>
                  {bpSaving ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Treinos detectados pelo relógio (Esteira, Corrida, Musculação…) */}
      {hasWorkouts && (
        <div className="mt-3 rounded-xl border bg-secondary/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              Treinos do relógio
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400">
              {workouts.length} {workouts.length === 1 ? "sessão" : "sessões"}
            </span>
          </div>

          <div className="space-y-1.5">
            {workouts.map((w) => {
              const name = w.title || w.exercise_type;
              return (
                <div
                  key={w.id}
                  className="flex items-center gap-2.5 rounded-lg bg-background/60 px-2.5 py-2"
                >
                  <span className="text-base leading-none shrink-0">{workoutIcon(w.exercise_type)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap mt-0.5">
                      <span>{formatClock(w.start_time)}</span>
                      {w.duration_minutes != null && (
                        <span className="flex items-center gap-0.5">
                          <Timer className="h-2.5 w-2.5" />
                          {w.duration_minutes} min
                        </span>
                      )}
                      {w.distance_meters != null && w.distance_meters > 0 && (
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-2.5 w-2.5" />
                          {(w.distance_meters / 1000).toFixed(2)} km
                        </span>
                      )}
                      {w.avg_heart_rate != null && (
                        <span className="flex items-center gap-0.5 text-rose-500">
                          <Heart className="h-2.5 w-2.5" />
                          {w.avg_heart_rate}
                          {w.max_heart_rate != null ? `–${w.max_heart_rate}` : ""} bpm
                        </span>
                      )}
                    </div>
                  </div>
                  {w.calories_kcal != null && (
                    <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 shrink-0">
                      {w.calories_kcal} kcal
                    </span>
                  )}
                </div>
              );
            })}
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
