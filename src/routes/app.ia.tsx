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
import { Loader2, Sparkles, KeyRound, ShieldCheck, RefreshCw } from "lucide-react";
import { fetchNvidiaModels } from "@/server-fns/ai-settings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ia")({
  component: AiSettingsPage,
});

type AiProvider = "groq" | "openrouter" | "omniroute" | "nvidia";

function AiSettingsPage() {
  const { user } = useAuth();
  const [provider, setProvider] = useState<AiProvider>("groq");
  const [groqKey, setGroqKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [omniKey, setOmniKey] = useState("");
  const [omniBaseUrl, setOmniBaseUrl] = useState("");
  const [nvidiaModel, setNvidiaModel] = useState("");
  const [nvidiaModels, setNvidiaModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("ai_settings")
        .select("provider,groq_api_key,openrouter_api_key,omniroute_api_key,omniroute_base_url")
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
                    const models = await fetchNvidiaModels(openrouterKey.trim());
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
              O provedor padrao sera usado no Coach, chat e analises de texto. O OpenRouter
              continua sendo usado para analise de foto quando houver chave salva. O OmniRoute
              permite usar um endpoint proprio compativel com OpenAI. O NVIDIA usa o modelo
              Nemotron-70B diretamente pela API da NVIDIA.
            </p>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Salvando..." : "Salvar configuracoes"}
        </Button>
      </Card>
    </div>
  );
}
