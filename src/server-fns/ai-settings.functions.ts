import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type AiProvider = "groq" | "openrouter" | "omniroute" | "nvidia";

export type AiSettings = {
  provider: AiProvider;
  groq_api_key: string | null;
  openrouter_api_key: string | null;
  omniroute_api_key: string | null;
  omniroute_base_url: string | null;
  nvidia_model: string | null;
  updated_at: string | null;
};

type AiSettingsRow = Database["public"]["Tables"]["ai_settings"]["Row"];

const TEXT_MODELS: Record<AiProvider, string> = {
  groq: "llama-3.3-70b-versatile",
  openrouter: "qwen/qwen-2.5-72b-instruct",
  omniroute: "llama-3.3-70b-versatile",
  nvidia: "nvidia/llama-3.1-nemotron-70b-instruct",
};

export function normalizeAiSettings(row?: Partial<AiSettingsRow> | null): AiSettings {
  const provider: AiProvider =
    row?.provider === "openrouter"
      ? "openrouter"
      : row?.provider === "omniroute"
        ? "omniroute"
        : row?.provider === "nvidia"
          ? "nvidia"
          : "groq";
  return {
    provider,
    groq_api_key: row?.groq_api_key ?? null,
    openrouter_api_key: row?.openrouter_api_key ?? null,
    omniroute_api_key: row?.omniroute_api_key ?? null,
    omniroute_base_url: row?.omniroute_base_url ?? null,
    nvidia_model: provider === "nvidia" ? (row?.omniroute_base_url?.trim() || null) : null,
    updated_at: row?.updated_at ?? null,
  };
}

export async function fetchAiSettings(supabase: any, userId: string): Promise<AiSettings> {
  const { data } = await supabase
    .from("ai_settings")
    .select("provider,groq_api_key,openrouter_api_key,omniroute_api_key,omniroute_base_url,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  return normalizeAiSettings(data);
}

export function resolveAiProvider(settings?: Partial<AiSettings> | null): AiProvider {
  if (settings?.provider === "openrouter") return "openrouter";
  if (settings?.provider === "omniroute") return "omniroute";
  if (settings?.provider === "nvidia") return "nvidia";
  return "groq";
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

export function getTextModel(provider: AiProvider, settings?: Partial<AiSettings> | null): string {
  if (provider === "nvidia" && settings?.nvidia_model) return settings.nvidia_model;
  return TEXT_MODELS[provider];
}

export function resolveAiApiKey(settings: Partial<AiSettings> | null | undefined, provider: AiProvider): string | null {
  const stored =
    provider === "groq"
      ? settings?.groq_api_key?.trim()
      : provider === "openrouter"
        ? settings?.openrouter_api_key?.trim()
        : provider === "nvidia"
          ? settings?.openrouter_api_key?.trim()
          : settings?.omniroute_api_key?.trim();
  if (stored) return stored;

  if (provider === "groq") return process.env.GROQ_API_KEY ?? null;
  if (provider === "openrouter") return process.env.OPENROUTER_API_KEY ?? null;
  if (provider === "nvidia") return process.env.NVIDIA_API_KEY ?? process.env.OPENROUTER_API_KEY ?? null;
  return process.env.OMNIROUTE_API_KEY ?? process.env.OPENROUTER_API_KEY ?? process.env.GROQ_API_KEY ?? null;
}

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
  const endpoint =
    options.provider === "omniroute" && options.baseUrl?.trim()
      ? options.baseUrl.trim()
      : options.provider === "groq"
        ? "https://api.groq.com/openai/v1/chat/completions"
        : options.provider === "openrouter"
          ? "https://openrouter.ai/api/v1/chat/completions"
          : options.provider === "nvidia"
            ? "https://integrate.api.nvidia.com/v1/chat/completions"
            : "https://api.groq.com/openai/v1/chat/completions";

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
