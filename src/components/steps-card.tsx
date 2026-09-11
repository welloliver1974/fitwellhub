import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLocalDate } from "@/lib/utils";
import { estimateActiveCaloriesFromSteps } from "@/lib/google-fit-utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  fetchGoogleFitDailyData,
  getGoogleFitAuthUrl,
} from "@/server-fns/google-fit.functions";
import { Footprints, Flame, Watch, RotateCw, Pencil } from "lucide-react";
import { toast } from "sonner";

interface StepsCardProps {
  userId?: string;
  dailyStepGoal?: number;
  onActiveCaloriesChange?: (cal: number) => void;
}

export function StepsCard({
  userId,
  dailyStepGoal = 10000,
  onActiveCaloriesChange,
}: StepsCardProps) {
  const { user, session } = useAuth();
  const currentUserId = userId || user?.id;

  const [steps, setSteps] = useState(0);
  const [activeCalories, setActiveCalories] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [connected, setConnected] = useState(false);
  const [hasClientConfigured, setHasClientConfigured] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualInput, setManualInput] = useState("");

  const loadLocalData = async (isSync = false) => {
    if (isSync) setSyncing(true);

    try {
      const today = getLocalDate();

      // 1. Ler passos diretamente de daily_steps_logs do Supabase
      if (currentUserId) {
        try {
          const { data: stepLog, error: stepErr } = await supabase
            .from("daily_steps_logs")
            .select("steps, active_calories")
            .eq("user_id", currentUserId)
            .eq("log_date", today)
            .maybeSingle();

          if (!stepErr && stepLog && stepLog.steps != null) {
            const st = stepLog.steps;
            const cal = stepLog.active_calories ?? estimateActiveCaloriesFromSteps(st);
            setSteps(st);
            setActiveCalories(cal);
            setDistanceMeters(Math.round(st * 0.75));
            if (onActiveCaloriesChange) onActiveCaloriesChange(cal);
          } else {
            // Fallback de cache local caso o usuário tenha lançado offline
            try {
              const cached = localStorage.getItem(`fitwell-steps-${currentUserId}-${today}`);
              if (cached) {
                const parsed = JSON.parse(cached);
                setSteps(parsed.steps || 0);
                setActiveCalories(parsed.activeCalories || 0);
                setDistanceMeters(Math.round((parsed.steps || 0) * 0.75));
              }
            } catch {}
          }
        } catch (dbErr) {
          console.warn("Aviso ao buscar daily_steps_logs:", dbErr);
        }

        // 2. Verificar se o Google Fit / Samsung Watch está vinculado
        try {
          const { data: integration } = await supabase
            .from("user_integrations")
            .select("updated_at, access_token")
            .eq("user_id", currentUserId)
            .eq("provider", "google_fit")
            .maybeSingle();

          if (integration && integration.access_token) {
            setConnected(true);
          }
        } catch {}
      }

      // 3. Se for uma sincronização explícita e houver sessão, chamar o Google Fit
      if (isSync && session?.access_token) {
        try {
          const metrics = await fetchGoogleFitDailyData({
            headers: { Authorization: `Bearer ${session.access_token}` },
          });

          if (metrics && typeof metrics.steps === "number") {
            setSteps(metrics.steps);
            setActiveCalories(metrics.activeCalories);
            setDistanceMeters(metrics.distanceMeters);
            if (onActiveCaloriesChange) onActiveCaloriesChange(metrics.activeCalories);
            toast.success("Passos sincronizados com o Google Fit!");
          }
        } catch (syncErr: any) {
          console.warn("Sincronização remota com Google Fit falhou:", syncErr);
          toast.info("Dados locais mantidos");
        }
      }
    } catch (err: any) {
      console.warn("Erro ao carregar dados de passos:", err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadLocalData(false);
  }, [currentUserId]);

  const handleManualSave = async () => {
    const val = parseInt(manualInput.replace(/\D/g, ""), 10);
    if (isNaN(val) || val < 0) return;

    const today = getLocalDate();
    const active = estimateActiveCaloriesFromSteps(val);
    const dist = Math.round(val * 0.75);

    setSteps(val);
    setActiveCalories(active);
    setDistanceMeters(dist);
    if (onActiveCaloriesChange) onActiveCaloriesChange(active);

    if (currentUserId) {
      try {
        await supabase.from("daily_steps_logs").upsert(
          {
            user_id: currentUserId,
            log_date: today,
            steps: val,
            active_calories: active,
            source: "manual",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,log_date" }
        );
      } catch (err) {
        console.warn("Erro ao salvar manual steps no Supabase:", err);
      }

      try {
        localStorage.setItem(
          `fitwell-steps-${currentUserId}-${today}`,
          JSON.stringify({ steps: val, activeCalories: active })
        );
      } catch {}
    }

    setManualOpen(false);
    setManualInput("");
    toast.success("Passos registrados com sucesso!");
  };

  const handleConnectGoogle = async () => {
    try {
      const redirectUri = `${window.location.origin}/app/ia`;
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const authUrl = await getGoogleFitAuthUrl({
        data: redirectUri,
        headers,
      });

      if (authUrl) {
        window.location.href = authUrl;
      }
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível iniciar a conexão com o Google");
    }
  };

  const pct = Math.min(100, Math.round((steps / dailyStepGoal) * 100));
  const km = (distanceMeters / 1000).toFixed(1);

  return (
    <Card className="rounded-2xl border bg-card p-5 sm:p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Footprints className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">Passos & Gasto Ativo</h3>
              {connected ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <Watch className="h-3 w-3" />
                  Samsung Watch
                </span>
              ) : (
                <span className="inline-flex items-center text-[10px] font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  Manual
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Meta diária: {dailyStepGoal.toLocaleString("pt-BR")} passos</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => loadLocalData(true)}
            disabled={syncing}
            title="Sincronizar passos"
          >
            <RotateCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </Button>

          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Ajustar passos manualmente"
                onClick={() => setManualInput(steps > 0 ? String(steps) : "")}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                <DialogTitle>Registrar passos de hoje</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Insira a quantidade de passos registrados pelo seu relógio ou celular hoje:
                </p>
                <Input
                  type="number"
                  placeholder="Ex: 8500"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="font-display font-bold text-lg"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button onClick={handleManualSave} className="w-full">
                  Salvar passos
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-3xl sm:text-4xl font-display font-bold text-foreground">
            {steps.toLocaleString("pt-BR")}
            <span className="text-sm font-normal text-muted-foreground"> / {dailyStepGoal.toLocaleString("pt-BR")}</span>
          </p>
          <span className="text-xs font-semibold text-primary">{pct}%</span>
        </div>

        <Progress value={pct} className="h-2.5" />

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="flex items-center gap-2 p-2 rounded-xl bg-secondary/50">
            <Flame className="h-4 w-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Gasto Ativo</p>
              <p className="text-sm font-bold text-foreground font-display">+{activeCalories} kcal</p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-secondary/50">
            <Footprints className="h-4 w-4 text-blue-500 shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground font-medium">Distância</p>
              <p className="text-sm font-bold text-foreground font-display">{km} km</p>
            </div>
          </div>
        </div>

        {!connected && (
          <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Sincronizar Samsung Watch:</span>
            {hasClientConfigured ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnectGoogle}
                className="h-7 text-xs font-semibold gap-1 text-primary hover:text-primary"
              >
                <Watch className="h-3 w-3" />
                Conectar Google Fit
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setManualOpen(true)}
                className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
              >
                <Pencil className="h-3 w-3" />
                Lançamento manual
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
