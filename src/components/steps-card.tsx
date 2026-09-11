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
import {
  Footprints,
  Flame,
  Watch,
  RotateCw,
  Pencil,
  ExternalLink,
  Info,
  CheckCircle2,
} from "lucide-react";
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
  const [syncing, setSyncing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  // Credenciais do Google configuradas
  const hasClientConfigured = true;

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
            // Fallback de cache local
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

        // 2. Verificar se o Google Fit / Samsung Watch está vinculado no banco ou no dispositivo
        let isConnected = false;
        let localTokens: any = null;
        try {
          const { data: integration, error: intErr } = await supabase
            .from("user_integrations")
            .select("updated_at, access_token")
            .eq("user_id", currentUserId)
            .eq("provider", "google_fit")
            .maybeSingle();

          if (!intErr && integration && integration.access_token) {
            isConnected = true;
            setConnected(true);
          } else {
            const localTokensStr = typeof window !== "undefined" ? localStorage.getItem("fitwell_google_fit_tokens") : null;
            if (localTokensStr) {
              try {
                localTokens = JSON.parse(localTokensStr);
                if (localTokens?.accessToken) {
                  isConnected = true;
                  setConnected(true);
                }
              } catch {}
            }
          }
        } catch {}

        if (!localTokens && typeof window !== "undefined") {
          try {
            const str = localStorage.getItem("fitwell_google_fit_tokens");
            if (str) localTokens = JSON.parse(str);
          } catch {}
        }

        // 3. Se estiver conectado ou for sincronização manual, busca direto do Google Fit
        if (session?.access_token && (isConnected || isSync)) {
          try {
            const activeClientId =
              (typeof window !== "undefined" && localStorage.getItem("fitwell_google_client_id")) ||
              (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
              undefined;
            const activeClientSecret =
              (typeof window !== "undefined" && localStorage.getItem("fitwell_google_client_secret")) ||
              undefined;

            const metrics: any = await fetchGoogleFitDailyData({
              data: {
                clientId: activeClientId,
                clientSecret: activeClientSecret,
                accessToken: localTokens?.accessToken,
                refreshToken: localTokens?.refreshToken,
                expiresAt: localTokens?.expiresAt,
              },
              headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (metrics?.refreshedTokens && localTokens) {
              localStorage.setItem("fitwell_google_fit_tokens", JSON.stringify({
                ...localTokens,
                ...metrics.refreshedTokens,
              }));
            }

            if (metrics && typeof metrics.steps === "number" && !metrics.error) {
              if (metrics.steps > 0 || steps === 0) {
                setSteps(metrics.steps);
                setActiveCalories(metrics.activeCalories);
                setDistanceMeters(metrics.distanceMeters);
                if (onActiveCaloriesChange) onActiveCaloriesChange(metrics.activeCalories);
              }
              if (isSync) {
                if (metrics.steps > 0) {
                  toast.success(`${metrics.steps.toLocaleString("pt-BR")} passos sincronizados do Google Fit!`);
                } else {
                  toast.info("Google Fit consultado: 0 passos registrados na nuvem hoje até agora.");
                }
              }
            } else if (metrics?.error && isSync) {
              toast.error(metrics.error);
            }
          } catch (syncErr: any) {
            console.warn("Sincronização remota com Google Fit falhou:", syncErr);
            if (isSync) toast.info("Dados locais mantidos");
          }
        } else if (isSync) {
          toast.info("Passos de hoje atualizados!");
        }
      }
    } catch (err: any) {
      console.warn("Erro ao carregar dados de passos:", err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadLocalData(true);
  }, [currentUserId, session?.access_token]);

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

  const handleConnectClick = async () => {
    try {
      const redirectUri = `${window.location.origin}/app/ia`;
      const clientId =
        (typeof window !== "undefined" && localStorage.getItem("fitwell_google_client_id")) ||
        (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
        undefined;
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const authUrl = await getGoogleFitAuthUrl({
        data: { redirectUri, clientId },
        headers,
      });

      if (authUrl) {
        window.location.href = authUrl;
      }
    } catch (err: any) {
      console.warn("Erro ao gerar URL do Google Fit:", err);
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
                  {steps > 0 ? "Registrado" : "Sem registro"}
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
            title="Atualizar passos"
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
            <span className="text-[11px] text-muted-foreground">Samsung Watch:</span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setManualInput(steps > 0 ? String(steps) : "");
                  setManualOpen(true);
                }}
                className="h-7 text-xs gap-1"
              >
                <Pencil className="h-3 w-3" />
                Lançar passos
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleConnectClick}
                className="h-7 text-xs font-semibold gap-1 text-primary hover:text-primary"
              >
                <Watch className="h-3 w-3" />
                {hasClientConfigured ? "Conectar Google Fit" : "Como conectar"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog de Guia de Conexão com o Samsung Watch / Google Fit */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Watch className="h-5 w-5 text-primary" />
              Conectar Samsung Watch & Google Fit
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs text-muted-foreground leading-relaxed">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-foreground">
              <p className="font-semibold text-xs mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                Sua sincronização já está funcionando!
              </p>
              <p className="text-[11px] text-muted-foreground">
                Como você já compartilhou os dados do seu <strong>Samsung Health</strong> com o <strong>Google Fit</strong>, os passos do seu Galaxy Watch já são atualizados no celular.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-foreground text-xs uppercase tracking-wide">
                Opção 1: Lançamento Rápido (Recomendado agora)
              </h4>
              <p>
                Você pode registrar seus passos de hoje em <strong>5 segundos</strong> tocando no botão <strong>Lançar passos</strong> ou no ícone de lápis. O app calcula automaticamente calorias ativas e distância.
              </p>
              <Button
                variant="default"
                size="sm"
                className="w-full mt-1 gap-1"
                onClick={() => {
                  setGuideOpen(false);
                  setManualInput(steps > 0 ? String(steps) : "");
                  setManualOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Digitar passos do relógio agora
              </Button>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/60">
              <h4 className="font-semibold text-foreground text-xs uppercase tracking-wide flex items-center gap-1">
                <Info className="h-3.5 w-3.5 text-blue-500" />
                Opção 2: Conexão Automática via Google Cloud
              </h4>
              <p>
                Para conectar automaticamente via OAuth da Google Fitness API:
              </p>
              <ol className="list-decimal list-inside space-y-1 pl-1 text-[11px]">
                <li>Acesse o <strong>Google Cloud Console</strong> e ative a <strong>Fitness API</strong>.</li>
                <li>Crie um <strong>ID do cliente OAuth 2.0 (Web)</strong> com a URL do app.</li>
                <li>Adicione <code>VITE_GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> no seu arquivo <code>.env</code>.</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGuideOpen(false)} className="w-full">
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
