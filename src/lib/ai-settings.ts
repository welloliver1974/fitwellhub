// Lógica pura dos provedores de IA (provider/modelo/fallback de chave/endpoint).
// Sem imports — testável em node. Extraído de ai-settings.functions.ts.

export type AiProvider = "groq" | "openrouter" | "omniroute" | "nvidia";
export type VisionAiProvider = "openrouter" | "omniroute" | "nvidia";

export type AiSettings = {
  provider: AiProvider;
  photo_provider: "openrouter" | "omniroute" | "nvidia" | null;
  photo_model: string | null;
  groq_api_key: string | null;
  groq_model: string | null;
  openrouter_api_key: string | null;
  openrouter_model: string | null;
  omniroute_api_key: string | null;
  omniroute_base_url: string | null;
  custom_model: string | null;
  custom_base_url: string | null;
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

export const DEFAULT_TEXT_MODELS: Record<AiProvider, string> = {
  groq: "llama-3.3-70b-versatile",
  openrouter: "meta-llama/llama-3.3-70b-instruct",
  omniroute: "llama-3.3-70b-versatile",
  nvidia: "nvidia/llama-3.1-nemotron-70b-instruct",
};

export const AI_SETTINGS_STORAGE_KEY = "fitwell_ai_settings_v2";

export function normalizeAiSettings(row?: AiSettingsRow | null): AiSettings {
  const provider: AiProvider =
    row?.provider === "openrouter"
      ? "openrouter"
      : row?.provider === "omniroute"
        ? "omniroute"
        : row?.provider === "nvidia"
          ? "nvidia"
          : "groq";

  // Deserializa metadados extras (modelos customizados) se omniroute_base_url contiver JSON
  let extraMeta: Record<string, string> = {};
  const rawBase = row?.omniroute_base_url?.trim() || "";
  if (rawBase.startsWith("{")) {
    try {
      extraMeta = JSON.parse(rawBase);
    } catch {}
  }

  const groq_model = extraMeta.groq_model?.trim() || null;
  const openrouter_model = extraMeta.openrouter_model?.trim() || null;
  const custom_model = extraMeta.custom_model?.trim() || null;
  const custom_base_url =
    extraMeta.custom_base_url?.trim() ||
    (provider === "omniroute" && !rawBase.startsWith("{") && rawBase ? rawBase : null);

  let nvidia_model: string | null = null;
  if (provider === "nvidia") {
    nvidia_model = extraMeta.nvidia_model?.trim() || (!rawBase.startsWith("{") && rawBase ? rawBase : null);
  } else if (extraMeta.nvidia_model?.trim()) {
    nvidia_model = extraMeta.nvidia_model.trim();
  }

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
    groq_model,
    openrouter_api_key: row?.openrouter_api_key ?? null,
    openrouter_model,
    omniroute_api_key: row?.omniroute_api_key ?? null,
    omniroute_base_url: row?.omniroute_base_url ?? null,
    custom_model,
    custom_base_url,
    nvidia_model,
    updated_at: row?.updated_at ?? null,
  };
}

/**
 * Codifica modelos customizados para armazenamento seguro na coluna omniroute_base_url
 */
export function encodeAiExtraMeta(data: {
  groq_model?: string | null;
  openrouter_model?: string | null;
  nvidia_model?: string | null;
  custom_model?: string | null;
  custom_base_url?: string | null;
}): string {
  const payload: Record<string, string> = {};
  if (data.groq_model?.trim()) payload.groq_model = data.groq_model.trim();
  if (data.openrouter_model?.trim()) payload.openrouter_model = data.openrouter_model.trim();
  if (data.nvidia_model?.trim()) payload.nvidia_model = data.nvidia_model.trim();
  if (data.custom_model?.trim()) payload.custom_model = data.custom_model.trim();
  if (data.custom_base_url?.trim()) payload.custom_base_url = data.custom_base_url.trim();
  return JSON.stringify(payload);
}

export function resolveAiProvider(settings?: Partial<AiSettings> | null): AiProvider {
  if (settings?.provider === "openrouter") return "openrouter";
  if (settings?.provider === "omniroute") return "omniroute";
  if (settings?.provider === "nvidia") return "nvidia";
  return "groq";
}

export function getTextModel(provider: AiProvider, settings?: Partial<AiSettings> | null): string {
  if (provider === "groq" && settings?.groq_model?.trim()) return settings.groq_model.trim();
  if (provider === "openrouter" && settings?.openrouter_model?.trim()) return settings.openrouter_model.trim();
  if (provider === "nvidia" && settings?.nvidia_model?.trim()) return settings.nvidia_model.trim();
  if (provider === "omniroute" && settings?.custom_model?.trim()) return settings.custom_model.trim();
  return DEFAULT_TEXT_MODELS[provider] || DEFAULT_TEXT_MODELS.groq;
}

export function resolveVisionProvider(settings?: Partial<AiSettings> | null): VisionAiProvider {
  if (settings?.photo_provider === "openrouter") return "openrouter";
  if (settings?.photo_provider === "omniroute") return "omniroute";
  if (settings?.photo_provider === "nvidia") return "nvidia";
  if (settings?.provider === "omniroute") return "omniroute";
  if (settings?.provider === "nvidia") return "nvidia";
  return "openrouter";
}

export function getVisionModel(
  provider: VisionAiProvider,
  settings?: Partial<AiSettings> | null,
): string {
  const saved = settings?.photo_model?.trim();
  if (provider === "nvidia" && saved === "nvidia/llama-3.2-90b-vision-instruct") {
    return "meta/llama-3.2-90b-vision-instruct";
  }
  if (saved) return saved;
  if (provider === "nvidia") return "meta/llama-3.2-90b-vision-instruct";
  return "qwen/qwen2.5-vl-72b-instruct";
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
  if (provider === "omniroute" && baseUrl?.trim()) {
    const clean = baseUrl.trim();
    if (!clean.startsWith("{")) return clean;
    try {
      const parsed = JSON.parse(clean);
      if (parsed.custom_base_url) return parsed.custom_base_url;
    } catch {}
  }
  if (provider === "groq") return "https://api.groq.com/openai/v1/chat/completions";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
  if (provider === "nvidia") return "https://integrate.api.nvidia.com/v1/chat/completions";
  return "https://api.groq.com/openai/v1/chat/completions";
}

/**
 * Salva as configurações de IA no localStorage para carregamento instantâneo offline
 */
export function saveAiSettingsLocal(settings: AiSettings): void {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }
}

/**
 * Lê as configurações salvas em localStorage
 */
export function getAiSettingsLocal(): AiSettings | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AiSettings;
  } catch {
    return null;
  }
}
