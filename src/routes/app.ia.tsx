import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, KeyRound, ShieldCheck, RefreshCw, Copy, Check, ChevronDown, ChevronUp, FileCode } from "lucide-react";
import { fetchNvidiaModels } from "@/server-fns/ai-settings.functions";
import {
  getGoogleFitStatus,
  getGoogleFitAuthUrl,
  exchangeGoogleFitCode,
  disconnectGoogleFit,
  fetchGoogleFitDailyData,
} from "@/server-fns/google-fit.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ia")({
  component: AiSettingsPage,
});

type AiProvider = "groq" | "openrouter" | "omniroute" | "nvidia";

function AiSettingsPage() {
  const { user, session } = useAuth();
  const [provider, setProvider] = useState<AiProvider>("groq");
  const [groqKey, setGroqKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [omniKey, setOmniKey] = useState("");
  const [omniBaseUrl, setOmniBaseUrl] = useState("");
  const [nvidiaModel, setNvidiaModel] = useState("");
  const [photoProvider, setPhotoProvider] = useState<"auto" | "openrouter" | "omniroute" | "nvidia">("auto");
  const [photoModel, setPhotoModel] = useState("");
  const [nvidiaModels, setNvidiaModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const photoModelPlaceholder =
    photoProvider === "nvidia"
      ? "meta/llama-3.2-90b-vision-instruct"
      : "qwen/qwen2.5-vl-72b-instruct";

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("ai_settings")
        .select("provider,photo_provider,photo_model,groq_api_key,openrouter_api_key,omniroute_api_key,omniroute_base_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        toast.error(error.message);
      } else if (data) {
        setProvider(
          data.provider === "openrouter" || data.provider === "omniroute" || data.provider === "nvidia" ? data.provider : "groq",
        );
        setGroqKey(data.groq_api_key ?? "");
        setOpenrouterKey(data.openrouter_api_key ?? "");
        setOmniKey(data.omniroute_api_key ?? "");
        setOmniBaseUrl(data.omniroute_base_url ?? "");
        setNvidiaModel(data.omniroute_base_url ?? "");
        setPhotoProvider(
          data.photo_provider === "openrouter" ||
            data.photo_provider === "omniroute" ||
            data.photo_provider === "nvidia"
            ? data.photo_provider
            : "auto",
        );
        setPhotoModel(data.photo_model ?? "");
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const baseUrl = provider === "nvidia" ? nvidiaModel.trim() : omniBaseUrl.trim();
    const { error } = await supabase.from("ai_settings").upsert(
      {
        user_id: user.id,
        provider,
        groq_api_key: groqKey.trim() || null,
        openrouter_api_key: openrouterKey.trim() || null,
        omniroute_api_key: omniKey.trim() || null,
        omniroute_base_url: baseUrl || null,
        photo_provider: photoProvider === "auto" ? null : photoProvider,
        photo_model: photoModel.trim() || null,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configuracoes de IA salvas");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-display font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> IA
        </h1>
        <p className="text-sm text-muted-foreground">
          Escolha o provedor padrao e cole suas chaves para usar o Coach sem editar o .env.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Provedor padrao
          </Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="groq">Groq</SelectItem>
              <SelectItem value="openrouter">OpenRouter</SelectItem>
              <SelectItem value="omniroute">OmniRoute</SelectItem>
              <SelectItem value="nvidia">NVIDIA</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Groq API Key
            </Label>
            <Input
              type="password"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder="Cole sua chave da Groq"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> {provider === "nvidia" ? "NVIDIA API Key" : "OpenRouter API Key"}
            </Label>
            <Input
              type="password"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              placeholder={provider === "nvidia" ? "Cole sua chave da NVIDIA" : "Cole sua chave do OpenRouter"}
              autoComplete="off"
            />
          </div>
        </div>

        {provider === "nvidia" && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Modelo NVIDIA
            </Label>
            <div className="flex gap-2">
              <Select value={nvidiaModel} onValueChange={setNvidiaModel}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {nvidiaModels.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                disabled={!openrouterKey.trim() || loadingModels}
                onClick={async () => {
                  if (!openrouterKey.trim()) return toast.error("Cole a chave da NVIDIA primeiro.");
                  setLoadingModels(true);
                  try {
                    const models = await fetchNvidiaModels({
                      headers: session?.access_token
                        ? { Authorization: `Bearer ${session.access_token}` }
                        : undefined,
                      data: { apiKey: openrouterKey.trim() },
                    });
                    setNvidiaModels(models);
                    if (!nvidiaModel && models.length) setNvidiaModel(models[0]);
                    toast.success(`${models.length} modelos carregados`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Erro ao buscar modelos");
                  } finally {
                    setLoadingModels(false);
                  }
                }}
                title="Buscar modelos disponiveis"
              >
                {loadingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
            {nvidiaModels.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Cole a chave da NVIDIA e clique em &#x21bb; para buscar os modelos disponiveis.
              </p>
            )}
          </div>
        )}

        {provider === "omniroute" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> OmniRoute API Key
              </Label>
              <Input
                type="password"
                value={omniKey}
                onChange={(e) => setOmniKey(e.target.value)}
                placeholder="Cole sua chave do OmniRoute"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Endpoint proprio
              </Label>
              <Input
                value={omniBaseUrl}
                onChange={(e) => setOmniBaseUrl(e.target.value)}
                placeholder="https://seu-endpoint/v1/chat/completions"
                autoComplete="off"
              />
            </div>
          </div>
        )}

        <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
            <p>
              O provedor padrao sera usado no Coach, chat, analises de texto e analise de foto
              (a foto usa um modelo de visao). O OmniRoute permite usar um endpoint proprio
              compativel com OpenAI. O NVIDIA usa o modelo escolhido pela API da NVIDIA — para a
              foto, escolha um modelo de visao (ex.: meta/llama-3.2-90b-vision-instruct) na lista
              de modelos.
            </p>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Salvando..." : "Salvar configuracoes"}
        </Button>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <span>⌚</span> Google Fit & Samsung Galaxy Watch
            </h3>
            <p className="text-xs text-muted-foreground">
              Sincroniza passos diários e gasto calórico ativo direto do seu smartwatch.
            </p>
          </div>
        </div>

        <GoogleFitSettingsSection />
      </Card>
    </div>
  );
}

function GoogleFitSettingsSection() {
  const { user, session } = useAuth();
  const [status, setStatus] = useState<{ connected: boolean; hasClientConfigured: boolean; lastSync: string | null }>({
    connected: false,
    hasClientConfigured: true,
    lastSync: null,
  });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [clientId, setClientId] = useState(() => {
    if (typeof window !== "undefined") {
      return (
        localStorage.getItem("fitwell_google_client_id") ||
        (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
        ""
      );
    }
    return "";
  });
  const [clientSecret, setClientSecret] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("fitwell_google_client_secret") || "";
    }
    return "";
  });
  const [jsonInput, setJsonInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [syncingData, setSyncingData] = useState(false);
  const [syncedMetrics, setSyncedMetrics] = useState<{ steps: number; activeCalories: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [missingTableNotice, setMissingTableNotice] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const redirectUri =
    typeof window !== "undefined" ? `${window.location.origin}/app/ia` : "";

  const SQL_TABLES_SCRIPT = `-- Criação das tabelas de integração do Google Fit no Supabase:
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user_integrations all" ON public.user_integrations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.daily_steps_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  steps INTEGER NOT NULL DEFAULT 0,
  active_calories NUMERIC DEFAULT 0,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, log_date)
);
ALTER TABLE public.daily_steps_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own daily_steps_logs all" ON public.daily_steps_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_daily_steps_logs_user_date ON public.daily_steps_logs(user_id, log_date);`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_TABLES_SCRIPT);
    setCopiedSql(true);
    toast.success("Script SQL copiado! Cole no SQL Editor do seu Supabase.");
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleSyncNow = async () => {
    if (!session?.access_token) return;
    setSyncingData(true);
    setSyncError(null);
    try {
      const activeClientId =
        clientId.trim() ||
        (typeof window !== "undefined" && localStorage.getItem("fitwell_google_client_id")) ||
        (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
        undefined;
      const activeClientSecret =
        clientSecret.trim() ||
        (typeof window !== "undefined" && localStorage.getItem("fitwell_google_client_secret")) ||
        undefined;

      const localTokensStr = typeof window !== "undefined" ? localStorage.getItem("fitwell_google_fit_tokens") : null;
      let localTokens: any = null;
      if (localTokensStr) {
        try { localTokens = JSON.parse(localTokensStr); } catch {}
      }

      const res: any = await fetchGoogleFitDailyData({
        data: {
          clientId: activeClientId,
          clientSecret: activeClientSecret,
          accessToken: localTokens?.accessToken,
          refreshToken: localTokens?.refreshToken,
          expiresAt: localTokens?.expiresAt,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res?.refreshedTokens && localTokens) {
        localStorage.setItem("fitwell_google_fit_tokens", JSON.stringify({
          ...localTokens,
          ...res.refreshedTokens,
        }));
      }

      if (res?.error) {
        setSyncError(res.error);
        toast.error(res.error);
      } else if (res) {
        setSyncedMetrics({ steps: res.steps, activeCalories: res.activeCalories });
        if (res.steps > 0) {
          toast.success(`${res.steps.toLocaleString("pt-BR")} passos sincronizados do Google Fit!`);
        } else {
          toast.info("Google Fit consultado: 0 passos na nuvem hoje até o momento.");
        }
      }
    } catch (err: any) {
      setSyncError(err?.message || "Falha ao sincronizar");
      toast.error("Erro na sincronização: " + err?.message);
    } finally {
      setSyncingData(false);
    }
  };

  const checkStatus = async () => {
    if (!user) return;
    try {
      let isConn = false;
      let lastSyncTime: string | null = null;

      // 1. Tenta buscar da tabela user_integrations no Supabase
      const { data, error } = await supabase
        .from("user_integrations")
        .select("updated_at, access_token")
        .eq("user_id", user.id)
        .eq("provider", "google_fit")
        .maybeSingle();

      if (!error && data?.access_token) {
        isConn = true;
        lastSyncTime = data.updated_at;
      } else {
        if (error && (error.code === "PGRST205" || error.message?.includes("not find the table"))) {
          setMissingTableNotice(true);
        }
        // 2. Fallback de localStorage no dispositivo
        const localTokensStr = typeof window !== "undefined" ? localStorage.getItem("fitwell_google_fit_tokens") : null;
        if (localTokensStr) {
          try {
            const parsed = JSON.parse(localTokensStr);
            if (parsed?.accessToken) {
              isConn = true;
              lastSyncTime = new Date().toISOString();
            }
          } catch {}
        }
      }

      setStatus({
        connected: isConn,
        hasClientConfigured: Boolean(clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID),
        lastSync: lastSyncTime,
      });

      if (isConn && session?.access_token) {
        const localTokensStr = typeof window !== "undefined" ? localStorage.getItem("fitwell_google_fit_tokens") : null;
        let localTokens: any = null;
        if (localTokensStr) {
          try { localTokens = JSON.parse(localTokensStr); } catch {}
        }

        const activeClientId =
          clientId.trim() ||
          (typeof window !== "undefined" && localStorage.getItem("fitwell_google_client_id")) ||
          (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
          undefined;
        const activeClientSecret =
          clientSecret.trim() ||
          (typeof window !== "undefined" && localStorage.getItem("fitwell_google_client_secret")) ||
          undefined;

        fetchGoogleFitDailyData({
          data: {
            clientId: activeClientId,
            clientSecret: activeClientSecret,
            accessToken: localTokens?.accessToken,
            refreshToken: localTokens?.refreshToken,
            expiresAt: localTokens?.expiresAt,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then((res: any) => {
            if (res?.refreshedTokens && localTokens) {
              localStorage.setItem("fitwell_google_fit_tokens", JSON.stringify({
                ...localTokens,
                ...res.refreshedTokens,
              }));
            }
            if (res?.error) setSyncError(res.error);
            else if (res) setSyncedMetrics({ steps: res.steps, activeCalories: res.activeCalories });
          })
          .catch(() => {});
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();

    // Tratar retorno OAuth caso haja ?code= na URL
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code && session?.access_token) {
        setConnecting(true);
        const currentUri = `${window.location.origin}/app/ia`;
        const activeClientId =
          clientId.trim() ||
          localStorage.getItem("fitwell_google_client_id") ||
          (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
          undefined;
        const activeClientSecret =
          clientSecret.trim() ||
          localStorage.getItem("fitwell_google_client_secret") ||
          undefined;

        exchangeGoogleFitCode({
          data: {
            code,
            redirectUri: currentUri,
            clientId: activeClientId,
            clientSecret: activeClientSecret,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then((res: any) => {
            if (res?.tokens?.accessToken) {
              localStorage.setItem("fitwell_google_fit_tokens", JSON.stringify(res.tokens));
            }
            if (res?.dbSaved === false) {
              setMissingTableNotice(true);
            }
            toast.success("Google Fit conectado com sucesso!");
            url.searchParams.delete("code");
            url.searchParams.delete("scope");
            window.history.replaceState({}, document.title, url.pathname);
            checkStatus();
            handleSyncNow();
          })
          .catch((err) => {
            toast.error("Falha ao vincular Google Fit: " + (err?.message || "Erro desconhecido"));
          })
          .finally(() => setConnecting(false));
      }
    }
  }, [user, session]);

  const handleParseJson = (rawText: string) => {
    try {
      const parsed = JSON.parse(rawText.trim());
      const creds = parsed.web || parsed.installed || parsed;
      const cId = creds.client_id || "";
      const cSec = creds.client_secret || "";

      if (!cId && !cSec) {
        toast.error("Nenhum client_id ou client_secret encontrado no JSON.");
        return;
      }

      if (cId) {
        setClientId(cId);
        localStorage.setItem("fitwell_google_client_id", cId);
      }
      if (cSec) {
        setClientSecret(cSec);
        localStorage.setItem("fitwell_google_client_secret", cSec);
      }
      setJsonInput("");
      setStatus((prev) => ({ ...prev, hasClientConfigured: true }));
      toast.success("Credenciais do Google extraídas e salvas no dispositivo!");
    } catch {
      toast.error("JSON inválido. Copie e cole todo o conteúdo do arquivo do Google Cloud Console.");
    }
  };

  const handleSaveCredentials = () => {
    if (clientId.trim()) {
      localStorage.setItem("fitwell_google_client_id", clientId.trim());
    }
    if (clientSecret.trim()) {
      localStorage.setItem("fitwell_google_client_secret", clientSecret.trim());
    }
    setStatus((prev) => ({ ...prev, hasClientConfigured: Boolean(clientId.trim()) }));
    toast.success("Credenciais salvas com sucesso neste dispositivo!");
  };

  const handleConnect = async () => {
    const activeClientId =
      clientId.trim() ||
      (typeof window !== "undefined" && localStorage.getItem("fitwell_google_client_id")) ||
      (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
      "";

    if (!activeClientId) {
      setShowConfig(true);
      toast.info("Por favor, cole seu Client ID ou JSON do Google antes de conectar.");
      return;
    }

    try {
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;
      const authUrl = await getGoogleFitAuthUrl({
        data: { redirectUri, clientId: activeClientId },
        headers,
      });
      if (authUrl) {
        window.location.href = authUrl;
      }
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível conectar com o Google");
    }
  };

  const handleDisconnect = async () => {
    try {
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;
      await disconnectGoogleFit({ headers });
      if (typeof window !== "undefined") {
        localStorage.removeItem("fitwell_google_fit_tokens");
      }
      setStatus((prev) => ({ ...prev, connected: false }));
      setSyncedMetrics(null);
      toast.success("Google Fit desconectado");
    } catch (err: any) {
      toast.error("Erro ao desconectar: " + err?.message);
    }
  };

  const handleCopyUri = () => {
    if (redirectUri) {
      navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      toast.success("URI de redirecionamento copiada!");
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (loading || connecting) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{connecting ? "Concluindo autorização com o Google..." : "Verificando integração..."}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-1">
      {/* Barra de Status e Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-secondary/50 border border-border/50">
        <div>
          <p className="text-xs font-semibold text-foreground flex items-center gap-2">
            <span>Status:</span>
            <span className={status.connected ? "text-emerald-500 font-bold" : "text-muted-foreground"}>
              {status.connected ? "🟢 Conectado" : "⚪ Não conectado"}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {status.connected
              ? "Passos e calorias do Samsung Watch sincronizados via Google Fit."
              : "Clique abaixo para vincular sua conta Google e ativar a sincronização."}
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {status.connected ? (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={handleSyncNow}
                disabled={syncingData}
                className="h-8 text-xs font-medium gap-1.5 bg-primary text-primary-foreground"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncingData ? "animate-spin" : ""}`} />
                {syncingData ? "Sincronizando..." : "Sincronizar passos"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="h-8 text-xs text-destructive hover:bg-destructive/10"
              >
                Desconectar
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleConnect}
              className="h-8 text-xs font-medium bg-primary text-primary-foreground"
            >
              Conectar Google Fit
            </Button>
          )}
        </div>
      </div>

      {/* Aviso de fallback local caso as tabelas do Supabase ainda não tenham sido criadas */}
      {missingTableNotice && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="font-semibold text-amber-500 flex items-center gap-1.5">
              <span>⚡</span> Conexão ativa neste dispositivo (Modo Local)
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySql}
              className="h-7 text-[11px] gap-1 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 self-start sm:self-auto"
            >
              {copiedSql ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copiedSql ? "SQL Copiado!" : "Copiar SQL para Supabase"}
            </Button>
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            A integração e a leitura de passos funcionam normalmente aqui. Para que sua conexão fique salva na nuvem e sincronize em qualquer outro celular ou computador, basta rodar o script no <strong>SQL Editor</strong> do seu Supabase.
          </p>
        </div>
      )}

      {/* Alerta de erro da sincronização */}
      {syncError && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs space-y-1.5">
          <p className="font-semibold text-destructive flex items-center gap-1.5">
            <span>⚠️</span> {syncError}
          </p>
          {syncError.includes("Fitness API") ? (
            <>
              <p className="text-muted-foreground text-[11px]">
                A <strong>Fitness API</strong> precisa estar ativada no seu projeto no Google Cloud Console.
              </p>
              <a
                href="https://console.cloud.google.com/apis/library/fitness.googleapis.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline hover:opacity-80"
              >
                Ativar Fitness API no Google Cloud Console ↗
              </a>
            </>
          ) : syncError.includes("expirou") ? (
            <p className="text-muted-foreground text-[11px]">
              Clique no botão <strong>Conectar Google Fit</strong> acima para renovar suas permissões com o Google.
            </p>
          ) : null}
        </div>
      )}

      {/* Card de Métricas do Dia quando conectado */}
      {status.connected && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground">
              {syncedMetrics && syncedMetrics.steps > 0
                ? `${syncedMetrics.steps.toLocaleString("pt-BR")} passos hoje`
                : syncedMetrics
                  ? "0 passos na nuvem do Google Fit hoje"
                  : "Aguardando primeira leitura de passos"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {syncedMetrics && syncedMetrics.steps > 0
                ? `~${syncedMetrics.activeCalories} kcal ativas estimadas do smartwatch`
                : "Se já andou hoje, abra o app Google Fit no celular e arraste para baixo para sincronizar os dados do relógio com a nuvem."}
            </p>
          </div>
          {syncedMetrics && syncedMetrics.steps > 0 ? (
            <span className="text-emerald-500 font-bold text-sm">✓ Sincronizado</span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncNow}
              disabled={syncingData}
              className="h-7 text-[11px] gap-1 shrink-0 ml-2"
            >
              <RefreshCw className={`h-3 w-3 ${syncingData ? "animate-spin" : ""}`} />
              Sincronizar
            </Button>
          )}
        </div>
      )}

      {/* Instrução rápida sobre o Samsung Watch */}
      <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-[11px] text-muted-foreground space-y-1.5">
        <p className="font-semibold text-foreground">Como funciona com o Samsung Galaxy Watch?</p>
        <p>
          O <strong>Samsung Health</strong> compartilha os passos com o <strong>Google Fit</strong> no seu celular. Ao conectar aqui, o FitWell Hub sincroniza seus passos automaticamente.
        </p>
        <p>
          <em>Dica:</em> Você também pode lançar seus passos rapidamente a qualquer momento pelo ícone de lápis na página inicial.
        </p>
      </div>

      {/* Accordion / Seção de Credenciais do Google Cloud */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="w-full flex items-center justify-between p-3 text-left bg-secondary/30 hover:bg-secondary/60 transition-colors text-xs font-medium text-foreground"
        >
          <span className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-primary" />
            Configurações de Credenciais do Google Cloud
            {clientId && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded font-normal">
                Configurado
              </span>
            )}
          </span>
          {showConfig ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showConfig && (
          <div className="p-3.5 space-y-3 bg-card border-t border-border/40 text-xs">
            {/* URI de redirecionamento */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                URI de Redirecionamento autorizada (adicione no Google Cloud Console):
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  value={redirectUri}
                  readOnly
                  className="font-mono text-[11px] h-8 bg-muted/50"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyUri}
                  className="h-8 text-xs shrink-0"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>

            {/* Importar via JSON */}
            <div className="space-y-1.5 pt-1">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5" />
                Opção 1: Colar JSON baixado do Google Cloud
              </Label>
              <Textarea
                placeholder='Cole aqui o JSON {"web":{"client_id":"...","client_secret":"..."}}'
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value);
                  if (e.target.value.includes("client_id")) {
                    handleParseJson(e.target.value);
                  }
                }}
                className="font-mono text-[10px] h-16 resize-none"
              />
            </div>

            {/* Campos manuais */}
            <div className="space-y-2 pt-1 border-t border-border/30">
              <Label className="text-[11px] text-muted-foreground">
                Opção 2: Inserir manualmente
              </Label>
              <div className="space-y-1.5">
                <Input
                  placeholder="Google Client ID (.apps.googleusercontent.com)"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Input
                  type="password"
                  placeholder="Google Client Secret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSaveCredentials}
              className="w-full h-8 text-xs mt-1"
            >
              Salvar Credenciais neste Aparelho
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
