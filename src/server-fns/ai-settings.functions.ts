import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
// Lógica pura (provider/modelo/fallback/endpoint) vive em src/lib/ai-settings.ts.
import {
  type AiProvider,
  type AiSettings,
  getTextModel,
  normalizeAiSettings,
  resolveAiApiKey,
  resolveAiChatEndpoint,
  resolveAiProvider,
} from "@/lib/ai-settings";
// Re-exporta os tipos/funções para manter os imports existentes das rotas/server-fns.
export {
  type AiProvider,
  type AiSettings,
  getTextModel,
  normalizeAiSettings,
  resolveAiApiKey,
  resolveAiProvider,
} from "@/lib/ai-settings";

type AiSettingsRow = Database["public"]["Tables"]["ai_settings"]["Row"];

export async function fetchAiSettings(supabase: any, userId: string): Promise<AiSettings> {
  const { data } = await supabase
    .from("ai_settings")
    .select("provider,groq_api_key,openrouter_api_key,omniroute_api_key,omniroute_base_url,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  return normalizeAiSettings(data as AiSettingsRow);
}

const nvidiaKeySchema = z.object({ apiKey: z.string().min(1) });

export const fetchNvidiaModels = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => nvidiaKeySchema.parse(d))
  .handler(async ({ data }) => {
    const { apiKey } = data;
    const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Erro ao buscar modelos: ${res.status}`);
    const json = await res.json();
    return (json.data ?? []).map((m: any) => m.id);
  });

export async function callAiChatCompletion(options: {
  provider: AiProvider;
  apiKey: string;
  model: string;
  messages: any[];
  tools?: any[];
  toolChoice?: any;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string | null;
}) {
  const endpoint = resolveAiChatEndpoint(options.provider, options.baseUrl);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
  };

  if (options.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://fitwellhub.app";
    headers["X-Title"] = "FitWell Hub";
  }

  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
  };

  if (options.tools?.length) body.tools = options.tools;
  if (options.toolChoice !== undefined) body.tool_choice = options.toolChoice;
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}