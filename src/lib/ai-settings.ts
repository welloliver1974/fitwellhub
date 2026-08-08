// Lógica pura dos provedores de IA (provider/modelo/fallback de chave/endpoint).
// Sem imports — testável em node. Extraído de ai-settings.functions.ts.

export type AiProvider = "groq" | "openrouter" | "omniroute" | "nvidia";

export type AiSettings = {
  provider: AiProvider;
  photo_provider: "openrouter" | "omniroute" | "nvidia" | null;
  photo_model: string | null;
  groq_api_key: string | null;
  openrouter_api_key: string | null;
  omniroute_api_key: string | null;
  omniroute_base_url: string | null;
  nvidia_model: string | null;
  updated_at: string | null;
};

// Shape estrutural mínimo aceito por normalizeAiSettings — agnóstico do tipo
// do Supabase (o server-fn passa a linha tipada por validação estrutural).
export type AiSettingsRow = {
  provider?: string | null;
  photo_provider?: string | null;
  photo_model?: string | null;
  groq_api_key?: string | null;
  openrouter_api_key?: string | null;
  omniroute_api_key?: string | null;
  omniroute_base_url?: string | null;
  nvidia_model?: string | null;
  updated_at?: string | null;
};

const TEXT_MODELS: Record<AiProvider, string> = {
  groq: "llama-3.3-70b-versatile",
  openrouter: "qwen/qwen-2.5-72b-instruct",
  omniroute: "llama-3.3-70b-versatile",
  nvidia: "nvidia/llama-3.1-nemotron-70b-instruct",
};

export function normalizeAiSettings(row?: AiSettingsRow | null): AiSettings {
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
    photo_provider:
      row?.photo_provider === "openrouter" ||
      row?.photo_provider === "omniroute" ||
      row?.photo_provider === "nvidia"
        ? row.photo_provider
        : null,
    photo_model: row?.photo_model?.trim() || null,
    groq_api_key: row?.groq_api_key ?? null,
    openrouter_api_key: row?.openrouter_api_key ?? null,
    omniroute_api_key: row?.omniroute_api_key ?? null,
    omniroute_base_url: row?.omniroute_base_url ?? null,
    nvidia_model: provider === "nvidia" ? (row?.omniroute_base_url?.trim() || null) : null,
    updated_at: row?.updated_at ?? null,
  };
}

export function resolveAiProvider(settings?: Partial<AiSettings> | null): AiProvider {
  if (settings?.provider === "openrouter") return "openrouter";
  if (settings?.provider === "omniroute") return "omniroute";
  if (settings?.provider === "nvidia") return "nvidia";
  return "groq";
}

export function getTextModel(provider: AiProvider, settings?: Partial<AiSettings> | null): string {
  if (provider === "nvidia" && settings?.nvidia_model) return settings.nvidia_model;
  return TEXT_MODELS[provider];
}

export function resolveAiApiKey(
  settings: Partial<AiSettings> | null | undefined,
  provider: AiProvider,
): string | null {
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
  if (provider === "nvidia")
    return process.env.NVIDIA_API_KEY ?? process.env.OPENROUTER_API_KEY ?? null;
  return process.env.OMNIROUTE_API_KEY ?? process.env.OPENROUTER_API_KEY ?? process.env.GROQ_API_KEY ?? null;
}

// Resolve o endpoint de chat/completions por provider (omniroute custom baseUrl).
export function resolveAiChatEndpoint(provider: AiProvider, baseUrl?: string | null): string {
  if (provider === "omniroute" && baseUrl?.trim()) return baseUrl.trim();
  if (provider === "groq") return "https://api.groq.com/openai/v1/chat/completions";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
  if (provider === "nvidia") return "https://integrate.api.nvidia.com/v1/chat/completions";
  return "https://api.groq.com/openai/v1/chat/completions";
}