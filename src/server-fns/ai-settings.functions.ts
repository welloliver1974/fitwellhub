import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Lógica pura (provider/modelo/fallback/endpoint) vive em src/lib/ai-settings.ts.
import {
  type AiProvider,
  type AiSettings,
  getTextModel,
  getVisionModel,
  normalizeAiSettings,
  resolveAiApiKey,
  resolveAiChatEndpoint,
  resolveAiProvider,
  resolveVisionProvider,
} from "@/lib/ai-settings";
// Re-exporta os tipos/funções para manter os imports existentes das rotas/server-fns.
export {
  type AiProvider,
  type AiSettings,
  getTextModel,
  getVisionModel,
  normalizeAiSettings,
  resolveAiApiKey,
  resolveAiProvider,
  resolveVisionProvider,
} from "@/lib/ai-settings";

type AiSettingsRow = Database["public"]["Tables"]["ai_settings"]["Row"];

export async function fetchAiSettings(supabase: any, userId: string): Promise<AiSettings> {
  const { data } = await supabase
    .from("ai_settings")
    .select("provider,photo_provider,photo_model,groq_api_key,openrouter_api_key,omniroute_api_key,omniroute_base_url,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  return normalizeAiSettings(data as AiSettingsRow);
}

const apiKeySchema = z.object({ apiKey: z.string().min(1) });

/**
 * Busca a lista oficial de modelos ativos da conta Groq
 */
export const fetchGroqModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => apiKeySchema.parse(d))
  .handler(async ({ data }) => {
    const { apiKey } = data;
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro Groq (${res.status}): ${errText || "Chave inválida ou cota excedida"}`);
    }
    const json = await res.json();
    const rawList: any[] = json.data ?? [];

    // Prioriza modelos de chat e texto, filtrando whisper e áudio para a lista principal
    const filtered = rawList
      .filter((m) => m.active !== false && !m.id?.includes("whisper"))
      .map((m) => m.id as string);

    // Ordena colocando os recomendados no topo
    const priority = [
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b",
      "groq/compound-mini",
      "openai/gpt-oss-20b",
      "qwen/qwen3.6-27b",
    ];
    filtered.sort((a, b) => {
      const idxA = priority.indexOf(a);
      const idxB = priority.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return filtered;
  });

/**
 * Busca os modelos ativos no OpenRouter
 */
export const fetchOpenRouterModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ apiKey: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const headers: Record<string, string> = {
      "HTTP-Referer": "https://fitwellhub.app",
      "X-Title": "FitWell Hub",
    };
    if (data?.apiKey?.trim()) {
      headers["Authorization"] = `Bearer ${data.apiKey.trim()}`;
    }

    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers,
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) {
      throw new Error(`Erro OpenRouter (${res.status})`);
    }
    const json = await res.json();
    const rawList: any[] = json.data ?? [];

    // Mapeia e prioriza modelos mais populares
    const allIds = rawList.map((m) => m.id as string);

    const popular = [
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat",
      "deepseek/deepseek-r1",
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "qwen/qwen-2.5-72b-instruct",
      "qwen/qwen2.5-vl-72b-instruct",
    ];

    allIds.sort((a, b) => {
      const idxA = popular.indexOf(a);
      const idxB = popular.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return allIds.slice(0, 80); // Retorna os 80 mais relevantes
  });

/**
 * Busca a lista de modelos da NVIDIA NIM
 */
export const fetchNvidiaModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => apiKeySchema.parse(d))
  .handler(async ({ data }) => {
    const { apiKey } = data;
    const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Erro ao buscar modelos NVIDIA: ${res.status}`);
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
  let model = options.model;
  let maxTokens = options.maxTokens;

  // Proteções e calibragens automáticas para o provedor GROQ:
  // 1. O limite do plano gratuito do Groq é de 1000 OTPM (output tokens/min). Limitamos a 500-600 para nunca estourar rate limit.
  // 2. Substituir modelos descontinuados/inacessíveis (ex: llama-3.3-70b-versatile, llama-3.1-8b-instant, etc.)
  if (options.provider === "groq") {
    if (!maxTokens || maxTokens > 600) {
      maxTokens = 600;
    }
    const deprecated = [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "deepseek-r1-distill-llama-70b",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ];
    if (!model || deprecated.includes(model)) {
      model = "openai/gpt-oss-120b";
    }
  }

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
    model,
    messages: options.messages,
  };

  if (options.tools?.length) body.tools = options.tools;
  if (options.toolChoice !== undefined) body.tool_choice = options.toolChoice;
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  let data = await response.json();

  // Se der model_not_found ou rate_limit no Groq, tenta fallback transparente com modelo alternativo funcional
  if (
    options.provider === "groq" &&
    data?.error &&
    (data.error.code === "model_not_found" || data.error.code === "rate_limit_exceeded")
  ) {
    const fallbackModel = model === "openai/gpt-oss-120b" ? "qwen/qwen3.8-27b" : "openai/gpt-oss-120b";
    body.model = fallbackModel;
    body.max_tokens = 500;
    const retryRes = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    data = await retryRes.json();
  }

  return data;
}

const testInputSchema = z.object({
  provider: z.enum(["groq", "openrouter", "nvidia", "omniroute"]),
  apiKey: z.string().min(1, "Chave de API necessária"),
  model: z.string().min(1, "Nome do modelo necessário"),
  baseUrl: z.string().nullable().optional(),
});

/**
 * Testa a conexão e resposta de um modelo de IA em tempo real
 */
export const testAiProviderModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => testInputSchema.parse(d))
  .handler(async ({ data }) => {
    const startTime = Date.now();
    try {
      const completion = await callAiChatCompletion({
        provider: data.provider,
        apiKey: data.apiKey.trim(),
        model: data.model.trim(),
        baseUrl: data.baseUrl,
        messages: [
          {
            role: "system",
            content: "Você é o assistente FitWell. Responda em apenas uma frase curta e amigável confirmando que está conectado.",
          },
          {
            role: "user",
            content: "FitWell teste de conexão. Responda brevemente.",
          },
        ],
        temperature: 0.3,
        maxTokens: 50,
      });

      const latencyMs = Date.now() - startTime;
      const message =
        completion?.choices?.[0]?.message?.content?.trim() || "Conexão estabelecida com sucesso!";

      return {
        success: true,
        message,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      let errorMsg = err?.message || String(err) || "Erro desconhecido ao testar conexão";
      try {
        const parsed = JSON.parse(errorMsg);
        if (parsed?.error?.message) errorMsg = parsed.error.message;
      } catch {
        // Usa mensagem direta se não for JSON
      }

      return {
        success: false,
        error: errorMsg,
        latencyMs,
      };
    }
  });

