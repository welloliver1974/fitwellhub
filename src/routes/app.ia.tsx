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
import {
  Loader2,
  Sparkles,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  FileCode,
  Eye,
  EyeOff,
  CheckCircle2,
  Zap,
  Globe,
  Cpu,
  Wrench,
  Camera,
  FlaskConical,
  XCircle,
} from "lucide-react";
import {
  fetchNvidiaModels,
  fetchGroqModels,
  fetchOpenRouterModels,
  testAiProviderModel,
} from "@/server-fns/ai-settings.functions";
import {
  getTelegramIntegrationStatus,
  generateTelegramLinkToken,
  unlinkTelegramAccount,
} from "@/server-fns/telegram.functions";
import {
  encodeAiExtraMeta,
  normalizeAiSettings,
  saveAiSettingsLocal,
  getAiSettingsLocal,
  type AiProvider,
} from "@/lib/ai-settings";
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

const DEFAULT_GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "groq/compound-mini",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
];

const DEFAULT_OPENROUTER_MODELS = [
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-chat",
  "deepseek/deepseek-r1",
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "qwen/qwen-2.5-72b-instruct",
];

const DEFAULT_NVIDIA_MODELS = [
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "meta/llama-3.3-70b-instruct",
  "meta/llama-3.1-8b-instruct",
];

function AiSettingsPage() {
  const { user, session } = useAuth();

  // Provedor ativo para o Coach / Treinos
  const [provider, setProvider] = useState<AiProvider>("groq");

  // Chaves e Modelos por Provedor
  const [groqKey, setGroqKey] = useState("");
  const [groqModel, setGroqModel] = useState("openai/gpt-oss-120b");
  const [groqModels, setGroqModels] = useState<string[]>(DEFAULT_GROQ_MODELS);
  const [loadingGroqModels, setLoadingGroqModels] = useState(false);

  const [openrouterKey, setOpenrouterKey] = useState("");
  const [openrouterModel, setOpenrouterModel] = useState("meta-llama/llama-3.3-70b-instruct");
  const [openrouterModels, setOpenrouterModels] = useState<string[]>(DEFAULT_OPENROUTER_MODELS);
  const [loadingOrModels, setLoadingOrModels] = useState(false);

  const [nvidiaKey, setNvidiaKey] = useState("");
  const [nvidiaModel, setNvidiaModel] = useState("nvidia/llama-3.1-nemotron-70b-instruct");
  const [nvidiaModels, setNvidiaModels] = useState<string[]>(DEFAULT_NVIDIA_MODELS);
  const [loadingNvidiaModels, setLoadingNvidiaModels] = useState(false);

  const [omniKey, setOmniKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customModel, setCustomModel] = useState("");

  // Visão (Foto do prato e Scanner de rótulos)
  const [photoProvider, setPhotoProvider] = useState<"auto" | "openrouter" | "omniroute" | "nvidia">("auto");
  const [photoModel, setPhotoModel] = useState("");

  // Visualização de Chaves
  const [showKeys, setShowKeys] = useState(false);

  // Testes de modelos e conexão
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message?: string; error?: string; latencyMs: number }>
  >({});

  // Estados de página
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 1. Tentar ler do cache local imediatamente para zero lag
    const local = getAiSettingsLocal();
    if (local) {
      if (local.provider) setProvider(local.provider);
      if (local.groq_api_key) setGroqKey(local.groq_api_key);
      if (local.groq_model) setGroqModel(local.groq_model);
      if (local.openrouter_api_key) {
        setOpenrouterKey(local.openrouter_api_key);
        setNvidiaKey(local.openrouter_api_key);
      }
      if (local.openrouter_model) setOpenrouterModel(local.openrouter_model);
      if (local.nvidia_model) setNvidiaModel(local.nvidia_model);
      if (local.omniroute_api_key) setOmniKey(local.omniroute_api_key);
      if (local.custom_base_url) setCustomBaseUrl(local.custom_base_url);
      if (local.custom_model) setCustomModel(local.custom_model);
      if (local.photo_provider) setPhotoProvider(local.photo_provider);
      if (local.photo_model) setPhotoModel(local.photo_model);
    }

    // 2. Sincronizar com o banco Supabase
    if (!user) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("ai_settings")
          .select("provider,photo_provider,photo_model,groq_api_key,openrouter_api_key,omniroute_api_key,omniroute_base_url")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.warn("Aviso ao ler ai_settings do Supabase:", error.message);
        } else if (data) {
          const norm = normalizeAiSettings(data);
          setProvider(norm.provider);
          if (norm.groq_api_key) setGroqKey(norm.groq_api_key);
          if (norm.groq_model) setGroqModel(norm.groq_model);
          if (norm.openrouter_api_key) {
            setOpenrouterKey(norm.openrouter_api_key);
            setNvidiaKey(norm.openrouter_api_key);
          }
          if (norm.openrouter_model) setOpenrouterModel(norm.openrouter_model);
          if (norm.nvidia_model) setNvidiaModel(norm.nvidia_model);
          if (norm.omniroute_api_key) setOmniKey(norm.omniroute_api_key);
          if (norm.custom_base_url) setCustomBaseUrl(norm.custom_base_url);
          if (norm.custom_model) setCustomModel(norm.custom_model);
          if (norm.photo_provider) setPhotoProvider(norm.photo_provider);
          if (norm.photo_model) setPhotoModel(norm.photo_model);
          saveAiSettingsLocal(norm);
        }
      } catch (err) {
        console.error("Erro ao carregar ai_settings:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Função para buscar modelos da Groq em tempo real
  const handleFetchGroqModels = async () => {
    if (!groqKey.trim()) return toast.error("Cole sua chave da Groq primeiro.");
    setLoadingGroqModels(true);
    try {
      const models = await fetchGroqModels({
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        data: { apiKey: groqKey.trim() },
      });
      if (models && models.length > 0) {
        setGroqModels(models);
        if (!models.includes(groqModel)) setGroqModel(models[0]);
        toast.success(`${models.length} modelos ativos carregados da sua conta Groq!`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao consultar modelos da Groq");
    } finally {
      setLoadingGroqModels(false);
    }
  };

  // Função para buscar modelos do OpenRouter em tempo real
  const handleFetchOpenRouterModels = async () => {
    setLoadingOrModels(true);
    try {
      const models = await fetchOpenRouterModels({
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        data: { apiKey: openrouterKey.trim() || undefined },
      });
      if (models && models.length > 0) {
        setOpenrouterModels(models);
        if (!models.includes(openrouterModel)) setOpenrouterModel(models[0]);
        toast.success(`${models.length} modelos carregados do OpenRouter!`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao consultar modelos do OpenRouter");
    } finally {
      setLoadingOrModels(false);
    }
  };

  // Função para buscar modelos da NVIDIA em tempo real
  const handleFetchNvidiaModels = async () => {
    const key = nvidiaKey.trim() || openrouterKey.trim();
    if (!key) return toast.error("Cole sua chave da NVIDIA primeiro.");
    setLoadingNvidiaModels(true);
    try {
      const models = await fetchNvidiaModels({
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        data: { apiKey: key },
      });
      if (models && models.length > 0) {
        setNvidiaModels(models);
        if (!models.includes(nvidiaModel)) setNvidiaModel(models[0]);
        toast.success(`${models.length} modelos carregados da NVIDIA NIM!`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao consultar modelos da NVIDIA");
    } finally {
      setLoadingNvidiaModels(false);
    }
  };

  // Testar conexão e modelo do provedor escolhido
  const handleTestProvider = async (targetProvider: AiProvider) => {
    let apiKey = "";
    let model = "";
    let baseUrl: string | null = null;

    if (targetProvider === "groq") {
      apiKey = groqKey.trim();
      model = groqModel.trim() || DEFAULT_GROQ_MODELS[0];
    } else if (targetProvider === "openrouter") {
      apiKey = openrouterKey.trim();
      model = openrouterModel.trim() || DEFAULT_OPENROUTER_MODELS[0];
    } else if (targetProvider === "nvidia") {
      apiKey = nvidiaKey.trim() || openrouterKey.trim();
      model = nvidiaModel.trim() || DEFAULT_NVIDIA_MODELS[0];
    } else if (targetProvider === "omniroute") {
      apiKey = omniKey.trim() || "local";
      model = customModel.trim() || "default";
      baseUrl = customBaseUrl.trim() || null;
    }

    if (!apiKey && targetProvider !== "omniroute") {
      return toast.error(`Preencha a chave de API de ${targetProvider.toUpperCase()} antes de testar.`);
    }

    if (!model) {
      return toast.error(`Selecione ou informe um modelo para ${targetProvider.toUpperCase()}.`);
    }

    setTestingProvider(targetProvider);
    try {
      const res = await testAiProviderModel({
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        data: {
          provider: targetProvider,
          apiKey,
          model,
          baseUrl,
        },
      });

      setTestResults((prev) => ({ ...prev, [targetProvider]: res }));
      if (res.success) {
        toast.success(`${targetProvider.toUpperCase()}: Conectado em ${res.latencyMs}ms!`);
      } else {
        toast.error(`${targetProvider.toUpperCase()}: ${res.error || "Falha na conexão"}`);
      }
    } catch (err: any) {
      const errRes = {
        success: false,
        error: err?.message || "Erro inesperado ao testar o modelo",
        latencyMs: 0,
      };
      setTestResults((prev) => ({ ...prev, [targetProvider]: errRes }));
      toast.error(errRes.error);
    } finally {
      setTestingProvider(null);
    }
  };

  // Salvar tudo de forma permanente
  const save = async () => {
    setSaving(true);

    const extraMeta = encodeAiExtraMeta({
      groq_model: groqModel.trim() || null,
      openrouter_model: openrouterModel.trim() || null,
      nvidia_model: nvidiaModel.trim() || null,
      custom_model: customModel.trim() || null,
      custom_base_url: customBaseUrl.trim() || null,
    });

    const activeOrKey = provider === "nvidia" ? (nvidiaKey.trim() || openrouterKey.trim()) : openrouterKey.trim();

    const normalized = normalizeAiSettings({
      provider,
      groq_api_key: groqKey.trim() || null,
      openrouter_api_key: activeOrKey || null,
      omniroute_api_key: omniKey.trim() || null,
      omniroute_base_url: extraMeta,
      photo_provider: photoProvider === "auto" ? null : photoProvider,
      photo_model: photoModel.trim() || null,
    });

    // 1. Salvar no cache local imediato
    saveAiSettingsLocal(normalized);

    // 2. Salvar no Supabase
    if (user) {
      const { error } = await supabase.from("ai_settings").upsert(
        {
          user_id: user.id,
          provider,
          groq_api_key: groqKey.trim() || null,
          openrouter_api_key: activeOrKey || null,
          omniroute_api_key: omniKey.trim() || null,
          omniroute_base_url: extraMeta,
          photo_provider: photoProvider === "auto" ? null : photoProvider,
          photo_model: photoModel.trim() || null,
        },
        { onConflict: "user_id" },
      );
      if (error) {
        toast.error(`Aviso: Salvo no dispositivo, mas erro no banco (${error.message})`);
      } else {
        toast.success("Configurações de IA salvas com sucesso no banco e no dispositivo!");
      }
    } else {
      toast.success("Configurações salvas no dispositivo!");
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Carregando configurações de inteligência artificial...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Central de IA
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Configure suas chaves e selecione os modelos direto no app. Nunca mais perca dados a cada deploy.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowKeys(!showKeys)}
          className="rounded-full text-xs gap-1.5"
        >
          {showKeys ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showKeys ? "Ocultar chaves" : "Mostrar chaves"}
        </Button>
      </div>

      {/* Card de Blindagem de Dados */}
      <Card className="p-4 bg-emerald-950/20 border-emerald-500/30 rounded-2xl">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-emerald-200">
              Chaves salvas de forma permanente
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Suas chaves ficam registradas no seu banco de dados na nuvem (Supabase) e com cópia segura no navegador. Você pode dar quantos <em>git push</em> quiser no GitHub que o Cloudflare nunca mais perderá sua conexão de IA.
            </p>
          </div>
        </div>
      </Card>

      {/* Seletor de Provedor Principal */}
      <Card className="p-4 sm:p-5 rounded-2xl border-border/60 space-y-4">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            1. Escolha o Provedor Principal para o Coach & Treinos
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define quem processa as respostas de texto do Coach, Daily Briefing e Gerador de Treinos.
          </p>
        </div>

        {/* Grade de Seleção de Provedores */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => setProvider("groq")}
            className={`p-3 rounded-xl text-left border transition-all ${
              provider === "groq"
                ? "bg-primary/10 border-primary text-foreground shadow-sm"
                : "bg-secondary/20 border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-400" /> Groq
              </span>
              {provider === "groq" && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">Ultra-rápido (0.5s)</p>
          </button>

          <button
            type="button"
            onClick={() => setProvider("openrouter")}
            className={`p-3 rounded-xl text-left border transition-all ${
              provider === "openrouter"
                ? "bg-primary/10 border-primary text-foreground shadow-sm"
                : "bg-secondary/20 border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-blue-400" /> OpenRouter
              </span>
              {provider === "openrouter" && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">DeepSeek, Claude, Llama</p>
          </button>

          <button
            type="button"
            onClick={() => setProvider("nvidia")}
            className={`p-3 rounded-xl text-left border transition-all ${
              provider === "nvidia"
                ? "bg-primary/10 border-primary text-foreground shadow-sm"
                : "bg-secondary/20 border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-emerald-400" /> NVIDIA NIM
              </span>
              {provider === "nvidia" && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">Llama 70B de precisão</p>
          </button>

          <button
            type="button"
            onClick={() => setProvider("omniroute")}
            className={`p-3 rounded-xl text-left border transition-all ${
              provider === "omniroute"
                ? "bg-primary/10 border-primary text-foreground shadow-sm"
                : "bg-secondary/20 border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-purple-400" /> Manual / Custom
              </span>
              {provider === "omniroute" && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">Endpoint próprio/Local</p>
          </button>
        </div>

        {/* Detalhes do Provedor Selecionado: GROQ */}
        {provider === "groq" && (
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/60 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-400" /> Configuração Groq
              </span>
              <span className="text-[11px] text-muted-foreground">gratuito & alta velocidade</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Chave de API da Groq (gsk_...)</Label>
              <Input
                type={showKeys ? "text" : "password"}
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                placeholder="Cole aqui sua gsk_..."
                className="text-xs h-9"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Modelo da Groq para o Coach</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFetchGroqModels}
                  disabled={loadingGroqModels || !groqKey.trim()}
                  className="h-6 px-2 text-[11px] text-primary hover:text-primary gap-1"
                >
                  {loadingGroqModels ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Buscar modelos da minha conta
                </Button>
              </div>

              <Select value={groqModel} onValueChange={setGroqModel}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  {groqModels.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">
                      {m === "openai/gpt-oss-120b" ? "⭐ " : ""}{m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Recomendado: <strong>openai/gpt-oss-120b</strong> ou <strong>qwen/qwen3.8-27b</strong>.
              </p>
            </div>

            {/* Teste do Modelo Groq */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestProvider("groq")}
                  disabled={testingProvider !== null || !groqKey.trim()}
                  className="h-8 text-xs gap-1.5 rounded-lg border-amber-500/30 hover:bg-amber-500/10 text-amber-300"
                >
                  {testingProvider === "groq" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                  ) : (
                    <FlaskConical className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  {testingProvider === "groq" ? "Testando resposta..." : "Testar Conexão e Modelo 🧪"}
                </Button>
                {testResults["groq"] && (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Latência: {testResults["groq"].latencyMs}ms
                  </span>
                )}
              </div>

              {testResults["groq"] && (
                <div
                  className={`mt-2.5 p-2.5 rounded-lg text-xs border flex items-start gap-2.5 ${
                    testResults["groq"].success
                      ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                      : "bg-rose-950/30 border-rose-500/40 text-rose-200"
                  }`}
                >
                  {testResults["groq"].success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="font-semibold text-xs">
                      {testResults["groq"].success
                        ? "Modelo Groq conectado com sucesso! 🎉"
                        : "Falha na comunicação com a Groq"}
                    </p>
                    <p className="text-[11px] opacity-90 break-words">
                      {testResults["groq"].success
                        ? `"${testResults["groq"].message}"`
                        : testResults["groq"].error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detalhes do Provedor Selecionado: OPENROUTER */}
        {provider === "openrouter" && (
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/60 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-blue-400" /> Configuração OpenRouter
              </span>
              <span className="text-[11px] text-muted-foreground">acesso a todos os modelos do mundo</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Chave de API do OpenRouter (sk-or-v1-...)</Label>
              <Input
                type={showKeys ? "text" : "password"}
                value={openrouterKey}
                onChange={(e) => setOpenrouterKey(e.target.value)}
                placeholder="Cole aqui sua sk-or-v1-..."
                className="text-xs h-9"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Modelo Escolhido para o Coach</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFetchOpenRouterModels}
                  disabled={loadingOrModels}
                  className="h-6 px-2 text-[11px] text-primary hover:text-primary gap-1"
                >
                  {loadingOrModels ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Buscar catálogo OpenRouter
                </Button>
              </div>

              <Select value={openrouterModel} onValueChange={setOpenrouterModel}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {openrouterModels.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Teste do Modelo OpenRouter */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestProvider("openrouter")}
                  disabled={testingProvider !== null || !openrouterKey.trim()}
                  className="h-8 text-xs gap-1.5 rounded-lg border-blue-500/30 hover:bg-blue-500/10 text-blue-300"
                >
                  {testingProvider === "openrouter" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                  ) : (
                    <FlaskConical className="h-3.5 w-3.5 text-blue-400" />
                  )}
                  {testingProvider === "openrouter" ? "Testando resposta..." : "Testar Conexão e Modelo 🧪"}
                </Button>
                {testResults["openrouter"] && (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Latência: {testResults["openrouter"].latencyMs}ms
                  </span>
                )}
              </div>

              {testResults["openrouter"] && (
                <div
                  className={`mt-2.5 p-2.5 rounded-lg text-xs border flex items-start gap-2.5 ${
                    testResults["openrouter"].success
                      ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                      : "bg-rose-950/30 border-rose-500/40 text-rose-200"
                  }`}
                >
                  {testResults["openrouter"].success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="font-semibold text-xs">
                      {testResults["openrouter"].success
                        ? "Modelo OpenRouter conectado com sucesso! 🎉"
                        : "Falha na comunicação com o OpenRouter"}
                    </p>
                    <p className="text-[11px] opacity-90 break-words">
                      {testResults["openrouter"].success
                        ? `"${testResults["openrouter"].message}"`
                        : testResults["openrouter"].error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detalhes do Provedor Selecionado: NVIDIA */}
        {provider === "nvidia" && (
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/60 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-emerald-400" /> Configuração NVIDIA NIM
              </span>
              <span className="text-[11px] text-muted-foreground">alta performance com chips NVIDIA</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Chave de API da NVIDIA (nvapi-...)</Label>
              <Input
                type={showKeys ? "text" : "password"}
                value={nvidiaKey || openrouterKey}
                onChange={(e) => {
                  setNvidiaKey(e.target.value);
                  setOpenrouterKey(e.target.value);
                }}
                placeholder="Cole aqui sua nvapi-..."
                className="text-xs h-9"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Modelo NVIDIA</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFetchNvidiaModels}
                  disabled={loadingNvidiaModels || (!nvidiaKey.trim() && !openrouterKey.trim())}
                  className="h-6 px-2 text-[11px] text-primary hover:text-primary gap-1"
                >
                  {loadingNvidiaModels ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Buscar modelos NVIDIA
                </Button>
              </div>

              <Select value={nvidiaModel} onValueChange={setNvidiaModel}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Selecione o modelo" />
                </SelectTrigger>
                <SelectContent>
                  {nvidiaModels.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Teste do Modelo NVIDIA */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestProvider("nvidia")}
                  disabled={testingProvider !== null || (!nvidiaKey.trim() && !openrouterKey.trim())}
                  className="h-8 text-xs gap-1.5 rounded-lg border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-300"
                >
                  {testingProvider === "nvidia" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  ) : (
                    <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  {testingProvider === "nvidia" ? "Testando resposta..." : "Testar Conexão e Modelo 🧪"}
                </Button>
                {testResults["nvidia"] && (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Latência: {testResults["nvidia"].latencyMs}ms
                  </span>
                )}
              </div>

              {testResults["nvidia"] && (
                <div
                  className={`mt-2.5 p-2.5 rounded-lg text-xs border flex items-start gap-2.5 ${
                    testResults["nvidia"].success
                      ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                      : "bg-rose-950/30 border-rose-500/40 text-rose-200"
                  }`}
                >
                  {testResults["nvidia"].success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="font-semibold text-xs">
                      {testResults["nvidia"].success
                        ? "Modelo NVIDIA NIM conectado com sucesso! 🎉"
                        : "Falha na comunicação com a NVIDIA NIM"}
                    </p>
                    <p className="text-[11px] opacity-90 break-words">
                      {testResults["nvidia"].success
                        ? `"${testResults["nvidia"].message}"`
                        : testResults["nvidia"].error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detalhes do Provedor Selecionado: MANUAL / CUSTOM */}
        {provider === "omniroute" && (
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/60 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-purple-400" /> Configuração de Endpoint Manual
              </span>
              <span className="text-[11px] text-muted-foreground">compatível com qualquer API OpenAI</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">URL Completa do Endpoint (Base URL)</Label>
              <Input
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder="Ex: http://localhost:11434/v1/chat/completions ou https://seu-proxy.com/v1"
                className="text-xs h-9"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Chave de API (Opcional se for local)</Label>
                <Input
                  type={showKeys ? "text" : "password"}
                  value={omniKey}
                  onChange={(e) => setOmniKey(e.target.value)}
                  placeholder="Cole aqui se houver"
                  className="text-xs h-9"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Nome do Modelo no Endpoint</Label>
                <Input
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="Ex: llama3, mistral, gpt-4"
                  className="text-xs h-9"
                />
              </div>
            </div>

            {/* Teste do Provedor Manual */}
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestProvider("omniroute")}
                  disabled={testingProvider !== null || !customBaseUrl.trim()}
                  className="h-8 text-xs gap-1.5 rounded-lg border-purple-500/30 hover:bg-purple-500/10 text-purple-300"
                >
                  {testingProvider === "omniroute" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
                  ) : (
                    <FlaskConical className="h-3.5 w-3.5 text-purple-400" />
                  )}
                  {testingProvider === "omniroute" ? "Testando resposta..." : "Testar Endpoint Manual 🧪"}
                </Button>
                {testResults["omniroute"] && (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Latência: {testResults["omniroute"].latencyMs}ms
                  </span>
                )}
              </div>

              {testResults["omniroute"] && (
                <div
                  className={`mt-2.5 p-2.5 rounded-lg text-xs border flex items-start gap-2.5 ${
                    testResults["omniroute"].success
                      ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                      : "bg-rose-950/30 border-rose-500/40 text-rose-200"
                  }`}
                >
                  {testResults["omniroute"].success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="font-semibold text-xs">
                      {testResults["omniroute"].success
                        ? "Endpoint manual respondeu com sucesso! 🎉"
                        : "Falha ao conectar no endpoint manual"}
                    </p>
                    <p className="text-[11px] opacity-90 break-words">
                      {testResults["omniroute"].success
                        ? `"${testResults["omniroute"].message}"`
                        : testResults["omniroute"].error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Seção de Visão (Foto do Prato & Scanner) */}
      <Card className="p-4 sm:p-5 rounded-2xl border-border/60 space-y-4">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1.5">
            <Camera className="h-4 w-4 text-primary" /> 2. Provedor de Visão (Foto do Prato & Rótulos)
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Analisa fotos de refeições para estimar calorias e macronutrientes automaticamente.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Provedor para Análise Visual</Label>
            <Select
              value={photoProvider}
              onValueChange={(v) => setPhotoProvider(v as any)}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto" className="text-xs">
                  Automático (Segue o provedor principal ativo)
                </SelectItem>
                <SelectItem value="openrouter" className="text-xs">
                  OpenRouter (Qwen 2.5 VL / Llama 3.2 Vision)
                </SelectItem>
                <SelectItem value="nvidia" className="text-xs">
                  NVIDIA (Llama 3.2 90B Vision)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Modelo de Visão Customizado (Opcional)</Label>
            <Input
              value={photoModel}
              onChange={(e) => setPhotoModel(e.target.value)}
              placeholder="Padrão: qwen/qwen2.5-vl-72b-instruct"
              className="text-xs h-9"
            />
          </div>
        </div>
      </Card>

      {/* Ações Gerais: Teste do Provedor Ativo + Salvar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleTestProvider(provider)}
          disabled={testingProvider !== null}
          className="rounded-full py-5 text-sm font-semibold border-border gap-2"
        >
          {testingProvider === provider ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <FlaskConical className="h-4 w-4 text-amber-400" />
          )}
          {testingProvider === provider
            ? "Testando modelo ativo..."
            : `Testar Modelo Ativo (${provider.toUpperCase()}) 🧪`}
        </Button>

        <Button
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-full py-5 text-sm font-semibold shadow-md gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Gravando no banco de dados e no aparelho...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Salvar Configurações de IA Permanentemente
            </>
          )}
        </Button>
      </div>

      {/* Integração Telegram & Hermes Agent */}
      <Card className="p-4 sm:p-5 rounded-2xl border-border/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <span>🤖</span> Telegram & Hermes Agent (Treino por Voz)
            </h3>
            <p className="text-xs text-muted-foreground">
              Conclua treinos inteiros ("Terminei o Treino A, marca tudo e salva") ou gere fichas por áudio direto no Telegram.
            </p>
          </div>
        </div>

        <TelegramIntegrationSection />
      </Card>

      {/* Integração Google Fit / Smartwatch */}
      <Card className="p-4 sm:p-5 rounded-2xl border-border/60 space-y-4">
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

function TelegramIntegrationSection() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{
    isLinked: boolean;
    telegramChatId: string | null;
    telegramUsername: string | null;
    activeToken: string | null;
    linkedAt: string | null;
  }>({
    isLinked: false,
    telegramChatId: null,
    telegramUsername: null,
    activeToken: null,
    linkedAt: null,
  });

  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedHermesPrompt, setCopiedHermesPrompt] = useState(false);

  const fetchStatus = async () => {
    if (!session?.access_token) return;
    try {
      setLoading(true);
      const res = await getTelegramIntegrationStatus({
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setStatus(res);
      if (res.activeToken) {
        setToken(res.activeToken);
      }
    } catch (e: any) {
      console.warn("Status Telegram:", e?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [session]);

  const handleGenerateToken = async () => {
    if (!session?.access_token) return;
    try {
      setGenerating(true);
      const res = await generateTelegramLinkToken({
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setToken(res.token);
      toast.success("Código gerado! Envie-o para o seu bot no Telegram.");
      fetchStatus();
    } catch (e: any) {
      toast.error(`Erro ao gerar código: ${e?.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm("Deseja realmente desvincular seu Telegram desta conta?")) return;
    if (!session?.access_token) return;
    try {
      setUnlinking(true);
      await unlinkTelegramAccount({
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      toast.success("Telegram desvinculado com sucesso.");
      setToken(null);
      fetchStatus();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message}`);
    } finally {
      setUnlinking(false);
    }
  };

  const handleCopyToken = () => {
    if (!token) return;
    navigator.clipboard.writeText(`/start ${token}`);
    setCopiedToken(true);
    toast.success("Comando copiado! Cole no chat do seu bot Telegram.");
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const hermesToolCurl = `curl -X POST "${typeof window !== "undefined" ? window.location.origin : ""}/_serverFn/executeHermesAction" \\
  -H "Content-Type: application/json" \\
  -d '{
    "telegramChatId": "SEU_CHAT_ID",
    "action": "complete_workout",
    "payload": { "routine_name": "A" }
  }'`;

  const hermesSystemInstruction = `Você é o Personal Trainer e Assistente FitWell Hub do usuário no Telegram.
Quando o usuário disser que terminou um treino (ex: "terminei o treino A", "marca o treino de peito", "treino feito"), use a ferramenta 'fitwell_action' com action='complete_workout' e routine_name='Treino A'.
Quando o usuário pedir para prescrever ou criar um treino por voz (ex: "hoje meu treino é o A, cria aí focado em peito e ombro"), use a ferramenta 'fitwell_action' com action='create_workout', name='Treino A' e focus='Peito e Ombro'.`;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Verificando status de pareamento do Telegram...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-1">
      {/* Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-secondary/50 border border-border/50">
        <div>
          <p className="text-xs font-semibold text-foreground flex items-center gap-2">
            <span>Status da Conexão:</span>
            <span className={status.isLinked ? "text-emerald-500 font-bold" : "text-amber-500 font-medium"}>
              {status.isLinked ? "🟢 Conectado e Ativo" : "🟡 Aguardando Vinculação"}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {status.isLinked
              ? `Vinculado ao Chat ID: ${status.telegramChatId}${status.telegramUsername ? ` (@${status.telegramUsername})` : ""}`
              : "Gere um código de 6 dígitos e envie para o seu Bot no Telegram para ativar o registro por voz."}
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {status.isLinked ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlink}
              disabled={unlinking}
              className="h-8 text-xs text-destructive hover:bg-destructive/10"
            >
              {unlinking ? "Desvinculando..." : "Desconectar Bot"}
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleGenerateToken}
              disabled={generating}
              className="h-8 text-xs font-medium gap-1.5 bg-primary text-primary-foreground"
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
              {token ? "Gerar Novo Código" : "Gerar Código de Vinculação"}
            </Button>
          )}
        </div>
      </div>

      {/* Caixa do Código de Pareamento */}
      {!status.isLinked && (
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>📲</span> Como conectar em 1 minuto:
            </h4>
            <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
              <li>Clique em <strong>Gerar Código de Vinculação</strong> acima se ainda não tiver gerado.</li>
              <li>Copie o comando abaixo com o código gerado.</li>
              <li>Envie essa mensagem para o seu <strong>Bot no Telegram</strong>. Pronto!</li>
            </ol>
          </div>

          {token && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <div className="px-3 py-2 bg-background rounded-lg border border-border font-mono text-sm font-bold tracking-wider text-primary text-center sm:text-left flex-1 select-all">
                /start {token}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyToken}
                className="h-9 gap-1.5 text-xs shrink-0"
              >
                {copiedToken ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedToken ? "Copiado!" : "Copiar Comando"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Instruções para o Hermes Agent / Webhook */}
      <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-primary" /> Configuração do Hermes Agent (Tools / Ações)
          </span>
          <span className="text-[10px] text-muted-foreground">Endpoints e Prompts Prontos</span>
        </div>

        <p className="text-xs text-muted-foreground">
          O Hermes Agent pode enviar requisições HTTP para a ação <code>executeHermesAction</code> do FitWell Hub com as seguintes ações suportadas:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-lg bg-background border border-border/60 space-y-1">
            <div className="font-semibold text-foreground">1. Concluir Treino ("Check-in")</div>
            <div className="text-[11px] text-muted-foreground">
              Ação: <code>action: "complete_workout"</code><br />
              Exemplo: <em>"Terminei o Treino A, marca tudo e salva"</em>. O sistema grava a sessão e todas as séries habituais.
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-background border border-border/60 space-y-1">
            <div className="font-semibold text-foreground">2. Criar Treino por Voz</div>
            <div className="text-[11px] text-muted-foreground">
              Ação: <code>action: "create_workout"</code><br />
              Exemplo: <em>"Hoje meu treino é o A, cria aí focado em peitoral e tríceps"</em>. O sistema prescreve e salva a rotina.
            </div>
          </div>
        </div>

        {/* Prompt pronto para copiar */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground">Prompt de Sistema sugerido para o Hermes Agent:</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(hermesSystemInstruction);
                setCopiedHermesPrompt(true);
                toast.success("Prompt copiado!");
                setTimeout(() => setCopiedHermesPrompt(false), 2000);
              }}
              className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
            >
              {copiedHermesPrompt ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {copiedHermesPrompt ? "Copiado" : "Copiar Prompt"}
            </Button>
          </div>
          <Textarea
            readOnly
            value={hermesSystemInstruction}
            className="font-mono text-[11px] h-20 resize-none bg-background/60"
          />
        </div>
      </div>
    </div>
  );
}

