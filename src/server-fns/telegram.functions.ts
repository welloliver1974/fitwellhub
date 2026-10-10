import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getLocalDate, getLocalDateMinusDays, todayBoundsSaoPaulo, calculateAge, inferDateFromRelativeText } from "@/lib/utils";
import { estimateActiveCaloriesFromSteps } from "@/lib/google-fit-utils";
import {
  callAiChatCompletion,
  fetchAiSettings,
  getTextModel,
  resolveAiApiKey,
  resolveAiProvider,
} from "@/server-fns/ai-settings.functions";
import {
  sanitizeGeneratedRoutine,
  getDeterministicRoutineFallback,
  type GeneratedRoutine,
} from "@/lib/workout-ai-utils";
import { isCardioExercise } from "@/lib/cardio-utils";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Client Supabase admin/service ou com chave de publicação para chamadas do webhook
function getSupabaseServiceClient() {
  const getEnv = (name: string) => {
    return (
      (typeof process !== "undefined" ? process.env?.[name] : undefined) ||
      (import.meta.env as any)?.[name] ||
      (globalThis as any)?.[name]
    );
  };

  const url =
    getEnv("SUPABASE_URL") ||
    getEnv("VITE_SUPABASE_URL") ||
    "https://haavrgglnfbchiygspqw.supabase.co";

  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey =
    getEnv("SUPABASE_PUBLISHABLE_KEY") ||
    getEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    "sb_publishable_Ad2aSiOJKf_53pnMCLhc6A_JkX1vvJ2";

  if (!serviceKey) {
    console.warn(
      "[Hermes ServerFn] AVISO: SUPABASE_SERVICE_ROLE_KEY não foi encontrada no ambiente de execução. Operações em tabelas com RLS fechado podem retornar vazias."
    );
  }

  const key = serviceKey || publishableKey;

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}


// ---------------------------------------------------------------------------
// 1. Gerenciamento de Pareamento do Telegram (Pelo App do Usuário)
// ---------------------------------------------------------------------------

export const getTelegramIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data, error } = await supabase
      .from("telegram_integrations" as any)
      .select("telegram_chat_id, telegram_username, created_at, link_token, token_expires_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.warn("Erro ao consultar telegram_integrations:", error.message);
    }

    const row = data as any;
    const isLinked = Boolean(row?.telegram_chat_id);

    return {
      isLinked,
      telegramChatId: row?.telegram_chat_id ? String(row.telegram_chat_id) : null,
      telegramUsername: row?.telegram_username || null,
      activeToken: row?.link_token || null,
      linkedAt: row?.created_at || null,
    };
  });

export const generateTelegramLinkToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Gera um código de 6 caracteres alfanuméricos simples ou token aleatório
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const linkToken = `FIT-${randomSuffix}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 min

    const { data, error } = await supabase
      .from("telegram_integrations" as any)
      .upsert(
        {
          user_id: userId,
          link_token: linkToken,
          token_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("link_token")
      .single();

    if (error) {
      throw new Error(`Erro ao gerar token: ${error.message}`);
    }

    return {
      token: (data as any).link_token as string,
      expiresInMinutes: 30,
    };
  });

export const unlinkTelegramAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { error } = await supabase
      .from("telegram_integrations" as any)
      .update({
        telegram_chat_id: null,
        telegram_username: null,
        link_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Erro ao desvincular Telegram: ${error.message}`);
    }

    return { success: true };
  });

const directLinkSchema = z.object({
  chatId: z.string().trim().min(1, "Chat ID obrigatório"),
  username: z.string().trim().optional(),
});

export const linkTelegramDirectly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => directLinkSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const numericChatId = Number(data.chatId.replace(/[^0-9-]/g, ""));

    if (isNaN(numericChatId) || numericChatId === 0) {
      throw new Error("Chat ID inválido. Deve ser um número (ex: 123456789).");
    }

    const { error } = await supabase
      .from("telegram_integrations" as any)
      .upsert(
        {
          user_id: userId,
          telegram_chat_id: numericChatId,
          telegram_username: data.username || null,
          link_token: null,
          token_expires_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      throw new Error(`Erro ao salvar vínculo: ${error.message}`);
    }

    return { success: true, chatId: String(numericChatId) };
  });

// ---------------------------------------------------------------------------
// 2. Ações Executadas pelo Hermes Agent (Webhook / Ação Externa)
// ---------------------------------------------------------------------------

export type ResolvedFoodItem = {
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "Favoritos" | "Histórico" | "OpenFoodFacts" | "Tabela TACO/IA";
};

/**
 * Consulta em 4 camadas para garantir precisão e dados reais:
 * 1. Alimentos favoritos cadastrados pelo próprio usuário no app
 * 2. Histórico recente de refeições do usuário
 * 3. OpenFoodFacts (Base de alimentos, marcas e código de barras)
 * 4. Estimativa canônica de Nutrição Esportiva (Tabela TACO) via IA
 */
export async function resolveFoodItemWithLibrary(
  supabase: any,
  userId: string,
  query: string,
  grams: number = 100,
  fallbackMacros?: { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number }
): Promise<ResolvedFoodItem> {
  const cleanQuery = query.trim();
  const g = grams > 0 ? grams : 100;

  // 1. Verificar Favoritos do Usuário
  try {
    const { data: favs } = await supabase
      .from("favorite_foods")
      .select("name, grams, calories, protein_g, carbs_g, fat_g")
      .eq("user_id", userId)
      .ilike("name", `%${cleanQuery}%`)
      .limit(1);

    if (favs && favs.length > 0) {
      const fav = favs[0];
      const refG = Number(fav.grams) || 100;
      const ratio = g / refG;
      return {
        name: fav.name,
        grams: g,
        calories: Math.round(Number(fav.calories || 0) * ratio),
        protein_g: Math.round(Number(fav.protein_g || 0) * ratio * 10) / 10,
        carbs_g: Math.round(Number(fav.carbs_g || 0) * ratio * 10) / 10,
        fat_g: Math.round(Number(fav.fat_g || 0) * ratio * 10) / 10,
        source: "Favoritos",
      };
    }
  } catch (err) {
    console.error("Erro ao buscar em favorite_foods:", err);
  }

  // 2. Verificar Histórico Recente do Usuário
  try {
    const { data: recents } = await supabase
      .from("meal_items")
      .select("name, grams, calories, protein_g, carbs_g, fat_g")
      .eq("user_id", userId)
      .ilike("name", `%${cleanQuery}%`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recents && recents.length > 0) {
      const rec = recents[0];
      const refG = Number(rec.grams) || 100;
      const ratio = g / refG;
      return {
        name: rec.name,
        grams: g,
        calories: Math.round(Number(rec.calories || 0) * ratio),
        protein_g: Math.round(Number(rec.protein_g || 0) * ratio * 10) / 10,
        carbs_g: Math.round(Number(rec.carbs_g || 0) * ratio * 10) / 10,
        fat_g: Math.round(Number(rec.fat_g || 0) * ratio * 10) / 10,
        source: "Histórico",
      };
    }
  } catch (err) {
    console.error("Erro ao buscar em meal_items:", err);
  }

  // 3. Consultar OpenFoodFacts (Base Global de Alimentos e Marcas)
  try {
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
      cleanQuery
    )}&search_simple=1&action=process&json=1&page_size=1`;
    const offRes = await fetch(offUrl, { signal: AbortSignal.timeout(4000) });
    if (offRes.ok) {
      const body = await offRes.json();
      const p = body.products?.[0]?.nutriments;
      const prodName = body.products?.[0]?.product_name;
      const kcal100 = p?.["energy-kcal_100g"] ?? p?.["energy-kcal"];
      if (kcal100 !== undefined && kcal100 !== null && !isNaN(Number(kcal100))) {
        const ratio = g / 100;
        return {
          name: prodName || cleanQuery,
          grams: g,
          calories: Math.round(Number(kcal100) * ratio),
          protein_g: Math.round(Number(p["proteins_100g"] ?? 0) * ratio * 10) / 10,
          carbs_g: Math.round(Number(p["carbohydrates_100g"] ?? 0) * ratio * 10) / 10,
          fat_g: Math.round(Number(p["fat_100g"] ?? 0) * ratio * 10) / 10,
          source: "OpenFoodFacts",
        };
      }
    }
  } catch (offErr) {
    // Timeout ou rede, segue para IA/TACO
  }

  // Se já tiver macros passados por fallback válido
  if (fallbackMacros && fallbackMacros.calories !== undefined) {
    return {
      name: cleanQuery,
      grams: g,
      calories: Math.round(Number(fallbackMacros.calories || 0)),
      protein_g: Math.round(Number(fallbackMacros.protein_g || 0) * 10) / 10,
      carbs_g: Math.round(Number(fallbackMacros.carbs_g || 0) * 10) / 10,
      fat_g: Math.round(Number(fallbackMacros.fat_g || 0) * 10) / 10,
      source: "Tabela TACO/IA",
    };
  }

  // 4. Estimativa Canônica de Nutrição Esportiva (Tabela TACO) via IA
  try {
    const settings = await fetchAiSettings(supabase, userId);
    const provider = resolveAiProvider(settings);
    const apiKey = resolveAiApiKey(settings, provider);
    if (apiKey) {
      const res = await callAiChatCompletion({
        provider,
        apiKey,
        model: getTextModel(provider, settings),
        baseUrl: settings.omniroute_base_url,
        messages: [
          {
            role: "system",
            content:
              "Você é um nutricionista esportivo. Estime macros (kcal, proteína, carboidrato, gordura) de alimentos brasileiros. Use a tabela TACO como referência mental. Retorne APENAS via tool call.",
          },
          {
            role: "user",
            content: `Alimento: "${cleanQuery}". Porção: ${g}g. Estime os macros para essa porção exata.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_macros",
              description: "Reporta macros nutricionais estimados com base na tabela TACO",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Nome canônico do alimento em português" },
                  calories: { type: "number", description: "kcal por porção informada" },
                  protein_g: { type: "number" },
                  carbs_g: { type: "number" },
                  fat_g: { type: "number" },
                },
                required: ["name", "calories", "protein_g", "carbs_g", "fat_g"],
                additionalProperties: false,
              },
            },
          },
        ],
        toolChoice: { type: "function", function: { name: "report_macros" } },
      });
      const json = res as any;
      const call = json.choices?.[0]?.message?.tool_calls?.[0];
      if (call) {
        const args = JSON.parse(call.function.arguments);
        return {
          name: args.name || cleanQuery,
          grams: g,
          calories: Math.round(Number(args.calories || 0)),
          protein_g: Math.round(Number(args.protein_g || 0) * 10) / 10,
          carbs_g: Math.round(Number(args.carbs_g || 0) * 10) / 10,
          fat_g: Math.round(Number(args.fat_g || 0) * 10) / 10,
          source: "Tabela TACO/IA",
        };
      }
    }
  } catch (aiErr) {
    console.error("Erro no fallback TACO/IA:", aiErr);
  }

  // Fallback seguro caso não encontre
  return {
    name: cleanQuery,
    grams: g,
    calories: Math.round(g * 1.5),
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    source: "Tabela TACO/IA",
  };
}

function inferMealTypeFromTimeOrText(text?: string): "Café da manhã" | "Lanche da manhã" | "Almoço" | "Lanche da tarde" | "Jantar" | "Ceia" {
  if (text) {
    const t = text.toLowerCase();
    if (t.includes("café da manhã") || t.includes("cafe da manha") || t.includes("desjejum") || t.includes("acordei")) return "Café da manhã";
    if (t.includes("lanche da manhã") || t.includes("lanche da manha")) return "Lanche da manhã";
    if (t.includes("almoç") || t.includes("almoc")) return "Almoço";
    if (t.includes("lanche da tarde") || t.includes("café da tarde") || t.includes("shake") || t.includes("pré-treino") || t.includes("pos-treino") || t.includes("pós-treino") || t.includes("lanche")) return "Lanche da tarde";
    if (t.includes("janta") || t.includes("jantar")) return "Jantar";
    if (t.includes("ceia")) return "Ceia";
  }

  // Horário atual de Brasília
  const hour = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false });
  const h = parseInt(hour, 10);
  if (h >= 5 && h < 10) return "Café da manhã";
  if (h >= 10 && h < 12) return "Lanche da manhã";
  if (h >= 12 && h < 15) return "Almoço";
  if (h >= 15 && h < 19) return "Lanche da tarde";
  if (h >= 19 && h < 22) return "Jantar";
  return "Ceia";
}

function normalizeMeasurementLabel(rawLabel: string): string[] {
  const clean = rawLabel.trim().toLowerCase();

  const directMap: Record<string, string> = {
    cintura: "Cintura",
    quadril: "Quadril",
    peito: "Peito",
    peitoral: "Peito",
    ombro: "Ombros",
    ombros: "Ombros",
    costas: "Costas",
    dorsal: "Costas",
    dorsais: "Costas",
    pochete: "Pochete",
    abdômen: "Cintura",
    abdomen: "Cintura",
    barriga: "Cintura",
    "braço direito": "Braço Direito",
    "braco direito": "Braço Direito",
    "braço esquerdo": "Braço Esquerdo",
    "braco esquerdo": "Braço Esquerdo",
    "antebraço direito": "Antebraço Direito",
    "antebraco direito": "Antebraço Direito",
    "antebraço esquerdo": "Antebraço Esquerdo",
    "antebraco esquerdo": "Antebraço Esquerdo",
    "coxa direita": "Coxa Direita",
    "coxa esquerda": "Coxa Esquerda",
    "panturrilha direita": "Panturrilha Direita",
    "panturrilha esquerda": "Panturrilha Esquerda",
    pescoço: "Pescoço",
    pescoco: "Pescoço",
  };

  if (directMap[clean]) return [directMap[clean]];

  if (clean === "braço" || clean === "braco" || clean === "biceps" || clean === "bíceps") {
    return ["Braço Direito", "Braço Esquerdo"];
  }
  if (clean === "coxa" || clean === "perna") {
    return ["Coxa Direita", "Coxa Esquerda"];
  }
  if (clean === "panturrilha") {
    return ["Panturrilha Direita", "Panturrilha Esquerda"];
  }
  if (clean === "antebraço" || clean === "antebraco") {
    return ["Antebraço Direito", "Antebraço Esquerdo"];
  }

  return [clean.charAt(0).toUpperCase() + clean.slice(1)];
}

function parseMeasurementsFromText(text: string): Array<{ label: string; value_cm: number }> {
  const results: Array<{ label: string; value_cm: number }> = [];
  const regex = /(cintura|quadril|peitoral|peito|ombros?|costas|dorsal|pochete|abd[ôo]men|barriga|braço\s*(?:direito|esquerdo|d|e)?|braco\s*(?:direito|esquerdo|d|e)?|antebraco\s*(?:direito|esquerdo|d|e)?|antebraço\s*(?:direito|esquerdo|d|e)?|coxa\s*(?:direita|esquerda|d|e)?|panturrilha\s*(?:direita|esquerda|d|e)?|pesco[çc]o)\s*(?:[:=]|de|medindo)?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:cm)?/gi;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const rawLabel = match[1];
    const val = parseFloat(match[2].replace(",", "."));
    if (val > 0) {
      const normalizedLabels = normalizeMeasurementLabel(rawLabel);
      for (const norm of normalizedLabels) {
        results.push({ label: norm, value_cm: val });
      }
    }
  }
  return results;
}

const hermesActionSchema = z.object({
  secretKey: z.string().optional(),
  telegramChatId: z.union([z.string(), z.number()]),
  telegramUsername: z.string().optional(),
  action: z.enum([
    "pair",
    "complete_workout",
    "duplicate_workout",
    "create_workout",
    "undo_workout",
    "log_voice",
    "status",
    "log_meal",
    "duplicate_meal",
    "search_food",
    "update_meal_item",
    "delete_meal_item",
    "delete_meal",
    "adjust_water",
    "get_day",
    "list_meals",
    "log_measurement",
    "get_measurements",
    "log_weight",
    "get_weight",
    "log_steps",
    "get_steps",
    "get_profile",
    "get_bioimpedance",
    "log_bioimpedance",
    "get_workout_session",
  ]),
  payload: z.record(z.any()).default({}),
});

export type HermesActionInput = z.infer<typeof hermesActionSchema>;

/**
 * Endpoint unificado que o Hermes Agent chama.
 */
export const executeHermesAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => hermesActionSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServiceClient();
    const chatId = Number(data.telegramChatId);

    // Validação opcional de segredo caso configurado no ambiente
    const serverSecret = process.env.HERMES_WEBHOOK_SECRET;
    if (serverSecret && data.secretKey !== serverSecret) {
      return { success: false, error: "Acesso não autorizado (secret inválido)." };
    }

    // 1. AÇÃO: PAREAR CONTA (Comando /start FIT-XXXXXX)
    if (data.action === "pair") {
      const token = String(data.payload.token || "").trim().toUpperCase();
      if (!token) {
        return { success: false, error: "Token de pareamento não informado." };
      }

      const { data: integ, error: findErr } = await supabase
        .from("telegram_integrations" as any)
        .select("id, user_id, token_expires_at")
        .eq("link_token", token)
        .maybeSingle();

      if (findErr || !integ) {
        return {
          success: false,
          error: "Código de pareamento inválido ou não encontrado. Gere um novo no app.",
        };
      }

      const expiresAt = (integ as any).token_expires_at;
      if (expiresAt && new Date(expiresAt) < new Date()) {
        return {
          success: false,
          error: "Código de pareamento expirado. Gere um novo no app.",
        };
      }

      // Conclui o vínculo
      const { error: linkErr } = await supabase
        .from("telegram_integrations" as any)
        .update({
          telegram_chat_id: chatId,
          telegram_username: data.telegramUsername || null,
          link_token: null,
          token_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (integ as any).id);

      if (linkErr) {
        return { success: false, error: `Erro ao vincular: ${linkErr.message}` };
      }

      return {
        success: true,
        message: "Conta vinculada com sucesso ao FitWell Hub! Agora você pode registrar ou criar treinos por áudio ou texto.",
      };
    }

    // Para as demais ações, precisamos do usuário vinculado
    const { data: integRow } = await supabase
      .from("telegram_integrations" as any)
      .select("user_id")
      .eq("telegram_chat_id", chatId)
      .maybeSingle();

    if (!integRow?.user_id) {
      return {
        success: false,
        error: "Sua conta do Telegram ainda não está conectada ao FitWell Hub. Abra o app, vá em Configurações/IA e gere seu código de pareamento!",
        needsPairing: true,
      };
    }

    const userId = (integRow as any).user_id as string;

    // 2. AÇÃO: STATUS
    if (data.action === "status") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();

      const { data: workouts } = await supabase
        .from("workouts")
        .select("id, name")
        .eq("user_id", userId)
        .order("name");

      const today = getLocalDate();
      const { data: todayMeals } = await supabase
        .from("meals")
        .select("id")
        .eq("user_id", userId)
        .eq("meal_date", today);
      const mealIds = (todayMeals || []).map((m) => m.id);
      let dayKcal = 0;
      let dayP = 0;
      let dayC = 0;
      let dayF = 0;
      if (mealIds.length > 0) {
        const { data: dayItems } = await supabase
          .from("meal_items")
          .select("calories, protein_g, carbs_g, fat_g")
          .in("meal_id", mealIds);
        (dayItems || []).forEach((it) => {
          dayKcal += it.calories || 0;
          dayP += Number(it.protein_g || 0);
          dayC += Number(it.carbs_g || 0);
          dayF += Number(it.fat_g || 0);
        });
      }

      const { data: waterEntries } = await supabase
        .from("water_logs")
        .select("ml")
        .eq("user_id", userId)
        .eq("log_date", today);
      const totalWaterMl = (waterEntries || []).reduce((acc, w) => acc + (w.ml || 0), 0);

      // Último peso registrado
      const { data: latestWeightRows } = await supabase
        .from("body_weights")
        .select("weight_kg, log_date")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      const latestWeight = latestWeightRows?.[0]
        ? {
            weight_kg: Number(latestWeightRows[0].weight_kg),
            log_date: latestWeightRows[0].log_date,
          }
        : null;

      // Últimas medidas corporais registradas
      const { data: recentMeasurements } = await supabase
        .from("body_measurements")
        .select("label, value_cm, log_date")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .limit(30);

      const latestMeasurementsMap: Record<string, { value_cm: number; log_date: string }> = {};
      (recentMeasurements || []).forEach((m) => {
        if (!latestMeasurementsMap[m.label]) {
          latestMeasurementsMap[m.label] = {
            value_cm: Number(m.value_cm),
            log_date: m.log_date,
          };
        }
      });

      return {
        success: true,
        userName: profile?.full_name || "Atleta",
        workouts: (workouts || []).map((w) => w.name),
        todayNutrition: {
          calories: dayKcal,
          protein_g: Math.round(dayP * 10) / 10,
          carbs_g: Math.round(dayC * 10) / 10,
          fat_g: Math.round(dayF * 10) / 10,
          water_ml: totalWaterMl,
          mealsCount: (todayMeals || []).length,
        },
        latestWeight,
        latestMeasurements: latestMeasurementsMap,
      };
    }

    // 3. AÇÃO: CHECK-IN RÁPIDO ("Terminei o Treino A, marca tudo e salva")
    if (data.action === "complete_workout") {
      const routineNameQuery = String(data.payload.routine_name || data.payload.workout || "").trim();
      const notes = data.payload.notes ? String(data.payload.notes) : "Registrado via Telegram";

      // Busca todos os treinos do usuário ordenados pelos mais recentes primeiro
      const { data: userWorkouts } = await supabase
        .from("workouts")
        .select("id, name, workout_date")
        .eq("user_id", userId)
        .order("workout_date", { ascending: false });

      if (!userWorkouts || userWorkouts.length === 0) {
        return {
          success: false,
          error: "Você não possui nenhuma ficha de treino cadastrada no FitWell Hub.",
        };
      }

      // Algoritmo refinado de correspondência de nome
      const cleanQuery = routineNameQuery.toLowerCase().replace(/^treino\s+/i, "").trim();

      // 1. Match exato no nome completo
      let matchedWorkout = userWorkouts.find(
        (w) => w.name.toLowerCase() === routineNameQuery.toLowerCase()
      );

      // 2. Se pediu apenas uma letra ("B", "Treino B"), priorizar treinos que começam com essa letra
      if (!matchedWorkout && (cleanQuery.length === 1 || /^treino\s+[a-z]$/i.test(routineNameQuery))) {
        const letter = cleanQuery.length === 1 ? cleanQuery : cleanQuery.slice(-1);
        matchedWorkout = userWorkouts.find((w) => {
          const lower = w.name.toLowerCase();
          return (
            lower.startsWith(`treino ${letter}`) ||
            lower.startsWith(`${letter} -`) ||
            lower.startsWith(`${letter} `) ||
            new RegExp(`\\b${letter}\\b`, "i").test(w.name)
          );
        });
      }

      // 3. Match parcial por substring
      if (!matchedWorkout && routineNameQuery) {
        matchedWorkout = userWorkouts.find((w) =>
          w.name.toLowerCase().includes(routineNameQuery.toLowerCase())
        );
      }

      // 4. Se ainda não encontrou, desambiguação
      if (!matchedWorkout) {
        const availableNames = Array.from(new Set(userWorkouts.map((w) => w.name)))
          .map((n) => `• ${n}`)
          .join("\n");
        return {
          success: false,
          error: `Não encontrei o treino "${routineNameQuery}". Seus treinos disponíveis são:\n${availableNames}\n\nQual deles você realizou?`,
        };
      }

      // Carregar exercícios e séries do treino modelo
      const { data: exercises } = await supabase
        .from("exercises")
        .select("id, name, position")
        .eq("workout_id", matchedWorkout.id)
        .order("position");

      const exIds = (exercises || []).map((e) => e.id);
      const { data: sets } = exIds.length
        ? await supabase
            .from("sets")
            .select("exercise_id, set_number, reps, weight_kg")
            .in("exercise_id", exIds)
        : { data: [] };

      // 1. Cria a sessão finalizada em workout_sessions
      const { data: session, error: sessErr } = await supabase
        .from("workout_sessions")
        .insert({
          user_id: userId,
          workout_id: matchedWorkout.id,
          name: matchedWorkout.name,
          completed_at: new Date().toISOString(),
          notes: notes,
        })
        .select()
        .single();

      if (sessErr || !session) {
        return {
          success: false,
          error: `Erro ao criar sessão de treino: ${sessErr?.message}`,
        };
      }

      // 2. Cria as séries realizadas em workout_session_sets
      const sessionSetsToInsert: any[] = [];

      (exercises || []).forEach((e) => {
        const exSets = (sets || []).filter((s) => s.exercise_id === e.id);
        if (exSets.length > 0) {
          exSets.forEach((s) => {
            sessionSetsToInsert.push({
              session_id: session.id,
              user_id: userId,
              exercise_name: e.name,
              set_number: s.set_number,
              reps: s.reps || 10,
              weight_kg: Number(s.weight_kg || 0),
              completed: true,
            });
          });
        } else {
          // Se não havia séries cadastradas, insere 3 séries padrão
          for (let i = 1; i <= 3; i++) {
            sessionSetsToInsert.push({
              session_id: session.id,
              user_id: userId,
              exercise_name: e.name,
              set_number: i,
              reps: 10,
              weight_kg: 0,
              completed: true,
            });
          }
        }
      });

      if (sessionSetsToInsert.length > 0) {
        await supabase.from("workout_session_sets").insert(sessionSetsToInsert);
      }

      const totalExercises = exercises?.length || 0;
      const totalSets = sessionSetsToInsert.length;

      return {
        success: true,
        workoutName: matchedWorkout.name,
        totalExercises,
        totalSets,
        message: `🔥 Treino "${matchedWorkout.name}" marcado como concluído com sucesso!\n• ${totalExercises} exercícios registrados\n• ${totalSets} séries concluídas\nSeus gráficos de progresso já foram atualizados. Bom descanso! 💪`,
      };
    }

    // 4. AÇÃO: DUPLICAR TREINO EXISTENTE ("Hoje meu treino é o A, duplica ele para mim")
    if (data.action === "duplicate_workout") {
      const routineNameQuery = String(data.payload.routine_name || data.payload.workout || "A").trim();
      const targetDate = data.payload.date ? String(data.payload.date) : getLocalDate();

      // Busca os treinos do usuário ordenados pelos mais recentes primeiro
      const { data: userWorkouts } = await supabase
        .from("workouts")
        .select("id, name, notes, workout_date")
        .eq("user_id", userId)
        .order("workout_date", { ascending: false });

      if (!userWorkouts || userWorkouts.length === 0) {
        return {
          success: false,
          error: "Você não possui nenhuma ficha de treino cadastrada no FitWell Hub para duplicar.",
        };
      }

      const cleanQuery = routineNameQuery.toLowerCase().replace(/^treino\s+/i, "").trim();

      // 1. Match exato
      let sourceWorkout = userWorkouts.find(
        (w) => w.name.toLowerCase() === routineNameQuery.toLowerCase()
      );

      // 2. Se pediu apenas uma letra ("B", "Treino B"), priorizar treinos que começam com essa letra
      if (!sourceWorkout && (cleanQuery.length === 1 || /^treino\s+[a-z]$/i.test(routineNameQuery))) {
        const letter = cleanQuery.length === 1 ? cleanQuery : cleanQuery.slice(-1);
        sourceWorkout = userWorkouts.find((w) => {
          const lower = w.name.toLowerCase();
          return (
            lower.startsWith(`treino ${letter}`) ||
            lower.startsWith(`${letter} -`) ||
            lower.startsWith(`${letter} `) ||
            new RegExp(`\\b${letter}\\b`, "i").test(w.name)
          );
        });
      }

      // 3. Match parcial por substring
      if (!sourceWorkout && routineNameQuery) {
        sourceWorkout = userWorkouts.find((w) =>
          w.name.toLowerCase().includes(routineNameQuery.toLowerCase())
        );
      }

      if (!sourceWorkout) {
        const names = Array.from(new Set(userWorkouts.map((w) => w.name)))
          .map((n) => `• ${n}`)
          .join("\n");
        return {
          success: false,
          error: `Não encontrei o treino "${routineNameQuery}". Suas fichas são:\n${names}\n\nQual delas você quer duplicar?`,
        };
      }

      // Carregar exercícios e séries da ficha modelo
      const { data: sourceExercises } = await supabase
        .from("exercises")
        .select("id, name, position, notes")
        .eq("workout_id", sourceWorkout.id)
        .order("position");

      const exIds = (sourceExercises || []).map((e) => e.id);
      const { data: sourceSets } = exIds.length
        ? await supabase
            .from("sets")
            .select("exercise_id, set_number, reps, weight_kg")
            .in("exercise_id", exIds)
        : { data: [] };

      // Criar a nova ficha duplicada com a data de hoje
      const { data: duplicatedWorkout, error: dupErr } = await supabase
        .from("workouts")
        .insert({
          user_id: userId,
          name: sourceWorkout.name,
          workout_date: targetDate,
          notes: sourceWorkout.notes || `Duplicado para o dia ${targetDate} via Telegram`,
        })
        .select()
        .single();

      if (dupErr || !duplicatedWorkout) {
        return {
          success: false,
          error: `Erro ao duplicar treino: ${dupErr?.message}`,
        };
      }

      // Duplicar exercícios e séries associados
      for (const ex of sourceExercises || []) {
        const { data: newEx } = await supabase
          .from("exercises")
          .insert({
            workout_id: duplicatedWorkout.id,
            user_id: userId,
            name: ex.name,
            position: ex.position,
            notes: ex.notes,
          })
          .select()
          .single();

        if (newEx) {
          const setsOfThisEx = (sourceSets || []).filter((s) => s.exercise_id === ex.id);
          if (setsOfThisEx.length > 0) {
            const newSets = setsOfThisEx.map((s) => ({
              exercise_id: newEx.id,
              user_id: userId,
              set_number: s.set_number,
              reps: s.reps,
              weight_kg: s.weight_kg,
            }));
            await supabase.from("sets").insert(newSets);
          }
        }
      }

      const totalExs = sourceExercises?.length || 0;

      return {
        success: true,
        workoutId: duplicatedWorkout.id,
        workoutName: duplicatedWorkout.name,
        workoutDate: targetDate,
        totalExercises: totalExs,
        message: `📋 Treino "${duplicatedWorkout.name}" duplicado e preparado para hoje (${targetDate}) com sucesso!\n• ${totalExs} exercícios importados com suas cargas e repetições habituais.\nBora treinar! Quando terminar, é só me avisar. 💪`,
      };
    }

    // 5. AÇÃO: CRIAR/PRESCREVER NOVO TREINO POR VOZ ("Cria o treino A focado em peito")
    if (data.action === "create_workout") {
      const workoutName = String(data.payload.name || "Treino Personalizado").trim();
      const focus = String(data.payload.focus || "Hipertrofia e Força").trim();
      const exercisesRequested = Array.isArray(data.payload.exercises)
        ? data.payload.exercises
        : null;

      let finalExercises: Array<{ name: string; sets: number; reps: number; weight: number }> = [];

      // Se o Hermes já enviou os exercícios estruturados
      if (exercisesRequested && exercisesRequested.length > 0) {
        finalExercises = exercisesRequested.map((ex: any) => ({
          name: String(ex.name || "Exercício"),
          sets: Number(ex.sets || 4),
          reps: Number(ex.reps || 10),
          weight: Number(ex.weight || 0),
        }));
      } else {
        // Gera exercícios adequados com a IA interna do FitWell caso não venham prontos
        const aiSettings = await fetchAiSettings(supabase, userId);
        const provider = resolveAiProvider(aiSettings);
        const apiKey = resolveAiApiKey(aiSettings, provider);
        const model = getTextModel(aiSettings, provider);

        if (apiKey) {
          const prompt = `Crie uma lista de 5 a 6 exercícios eficientes para um treino chamado "${workoutName}" com foco em "${focus}".
Responda EXCLUSIVAMENTE em formato JSON com o schema:
{
  "exercises": [
    { "name": "Nome do Exercício", "sets": 4, "reps": 10, "weight": 0 }
  ]
}`;
          try {
            const res = await callAiChatCompletion({
              provider,
              apiKey,
              model,
              messages: [{ role: "user", content: prompt }],
              temperature: 0.3,
            });

            const match = res.content.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (parsed.exercises && Array.isArray(parsed.exercises)) {
                finalExercises = parsed.exercises;
              }
            }
          } catch (e) {
            console.warn("Fallback de geração de exercícios:", e);
          }
        }

        // Fallback básico se a IA falhar
        if (finalExercises.length === 0) {
          finalExercises = [
            { name: "Supino Reto / Exercício Base", sets: 4, reps: 10, weight: 20 },
            { name: "Desenvolvimento / Acessório Primário", sets: 3, reps: 12, weight: 14 },
            { name: "Elevação Lateral / Isolador", sets: 4, reps: 12, weight: 10 },
            { name: "Tríceps Polia / Finalizador", sets: 3, reps: 15, weight: 25 },
          ];
        }
      }

      // 1. Criar ou atualizar o treino em `workouts`
      const today = getLocalDate();
      const { data: newWorkout, error: wErr } = await supabase
        .from("workouts")
        .insert({
          user_id: userId,
          name: workoutName,
          workout_date: today,
          notes: `Foco: ${focus} (Criado via Hermes Telegram)`,
        })
        .select()
        .single();

      if (wErr || !newWorkout) {
        return { success: false, error: `Erro ao salvar treino: ${wErr?.message}` };
      }

      // 2. Inserir exercícios e séries
      for (let i = 0; i < finalExercises.length; i++) {
        const item = finalExercises[i];
        const { data: exRow, error: exErr } = await supabase
          .from("exercises")
          .insert({
            workout_id: newWorkout.id,
            user_id: userId,
            name: item.name,
            position: i + 1,
            notes: `${item.sets}x ${item.reps} reps`,
          })
          .select()
          .single();

        if (exRow && !exErr) {
          const setsToInsert = [];
          for (let s = 1; s <= item.sets; s++) {
            setsToInsert.push({
              exercise_id: exRow.id,
              user_id: userId,
              set_number: s,
              reps: item.reps,
              weight_kg: item.weight,
            });
          }
          await supabase.from("sets").insert(setsToInsert);
        }
      }

      const exerciseListText = finalExercises
        .map((e, idx) => `${idx + 1}. ${e.name} (${e.sets}x ${e.reps})`)
        .join("\n");

      return {
        success: true,
        workoutId: newWorkout.id,
        workoutName: newWorkout.name,
        message: `✅ Treino "${newWorkout.name}" criado com sucesso no FitWell Hub!\n\n📋 Exercícios:\n${exerciseListText}\n\nJá está disponível no seu app. Bom treino! 🏋️‍♂️`,
      };
    }

    // 6. AÇÃO: REGISTRAR REFEIÇÃO / ALIMENTOS / ÁGUA ("Hermes, almocei 150g de frango e 100g de arroz e tomei 400ml de água")
    if (data.action === "log_meal") {
      const rawText = data.payload.raw_text ? String(data.payload.raw_text).trim() : "";
      let mealType = (data.payload.meal_type as string) || undefined;
      let targetDate = data.payload.meal_date || data.payload.date ? String(data.payload.meal_date || data.payload.date) : "";
      if (!targetDate && rawText) {
        targetDate = inferDateFromRelativeText(rawText) || "";
      }
      if (!targetDate) {
        targetDate = getLocalDate();
      }
      let waterMl = Number(data.payload.water_ml || 0);
      let inputItems: Array<{ name: string; grams?: number; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number }> =
        Array.isArray(data.payload.items) ? data.payload.items : [];

      if (!mealType) {
        mealType = inferMealTypeFromTimeOrText(rawText);
      }

      // Se não vieram itens estruturados, mas veio raw_text (ex: áudio ou texto corrido transcrito do usuário)
      if (inputItems.length === 0 && rawText) {
        try {
          const settings = await fetchAiSettings(supabase, userId);
          const provider = resolveAiProvider(settings);
          const apiKey = resolveAiApiKey(settings, provider);
          if (apiKey) {
            const aiRes = await callAiChatCompletion({
              provider,
              apiKey,
              model: getTextModel(provider, settings),
              baseUrl: settings.omniroute_base_url,
              messages: [
                {
                  role: "system",
                  content:
                    `Você é um nutricionista esportivo. Analise o relato falado do usuário e identifique: consumo de água (em ml), tipo da refeição (Café da manhã, Almoço, Jantar, Lanche), data da refeição (se foi hoje, ontem, anteontem etc. retorne no formato YYYY-MM-DD considerando que a data de hoje é ${getLocalDate()}) e cada alimento com sua porção em gramas estimada. Retorne APENAS via chamada da função record_voice_intake.`,
                },
                {
                  role: "user",
                  content: `Relato do usuário: "${rawText}". Refeição provável: ${mealType}.`,
                },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "record_voice_intake",
                    description: "Extrai água, data da refeição, refeição e lista de alimentos de um relato",
                    parameters: {
                      type: "object",
                      properties: {
                        meal_date: {
                          type: "string",
                          description: `Data da refeição em formato YYYY-MM-DD se o usuário se referir a ontem, anteontem ou data específica (hoje é ${getLocalDate()})`,
                        },
                        water_ml: { type: "number", description: "Água em ml relatada (0 se não informado)" },
                        meal_type: { type: "string", enum: ["Café da manhã", "Almoço", "Jantar", "Lanche"] },
                        items: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string", description: "Nome canônico do alimento em português" },
                              grams: { type: "number", description: "Quantidade estimada em gramas" },
                            },
                            required: ["name"],
                          },
                        },
                      },
                      required: ["items"],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              toolChoice: { type: "function", function: { name: "record_voice_intake" } },
            });
            const json = aiRes as any;
            const call = json.choices?.[0]?.message?.tool_calls?.[0];
            if (call) {
              const args = JSON.parse(call.function.arguments);
              if (args.water_ml && waterMl === 0) waterMl = Number(args.water_ml);
              if (args.meal_type && !data.payload.meal_type) {
                mealType = args.meal_type === "Lanche" ? "Lanche da tarde" : args.meal_type;
              }
              if (args.meal_date && !data.payload.meal_date && !data.payload.date) {
                targetDate = String(args.meal_date);
              }
              if (Array.isArray(args.items) && args.items.length > 0) {
                inputItems = args.items;
              }
            }
          }
        } catch (parseErr) {
          console.error("Erro ao analisar relato falado com IA:", parseErr);
        }
      }

      // Normaliza 'Lanche' genérico para 'Lanche da tarde' oficial do app
      if (mealType === "Lanche") {
        mealType = "Lanche da tarde";
      }

      // Se só registrou água (ex: "tomei 500ml de água")
      if (inputItems.length === 0 && waterMl > 0) {
        await supabase.from("water_logs").insert({
          user_id: userId,
          log_date: targetDate,
          ml: Math.round(waterMl),
        });

        const { data: todayWater } = await supabase
          .from("water_logs")
          .select("ml")
          .eq("user_id", userId)
          .eq("log_date", targetDate);
        const totalWaterToday = (todayWater || []).reduce((acc, w) => acc + (w.ml || 0), 0);

        const isToday = targetDate === getLocalDate();
        const isYesterday = targetDate === getLocalDateMinusDays(1);
        const dateDesc = isToday ? "hoje" : isYesterday ? "ontem" : targetDate.split("-").reverse().join("/");

        return {
          success: true,
          water_ml: waterMl,
          target_date: targetDate,
          total_water_today: totalWaterToday,
          message: `💧 **+${waterMl}ml de água** registrados com sucesso no FitWell Hub (${isToday ? "hoje" : `data: ${dateDesc}`})!\n\nTotal acumulado de ${dateDesc}: **${totalWaterToday}ml** hidratados. Continue assim! 🥤`,
        };
      }

      if (inputItems.length === 0) {
        return {
          success: false,
          error: "Nenhum alimento ou quantidade de água foi identificado no seu relato.",
        };
      }

      // Resolver cada alimento com as 4 camadas da biblioteca
      const resolvedItems: ResolvedFoodItem[] = [];
      for (const it of inputItems) {
        const grams = Number(it.grams) || 100;
        const resolved = await resolveFoodItemWithLibrary(
          supabase,
          userId,
          it.name,
          grams,
          it.calories !== undefined
            ? {
                calories: it.calories,
                protein_g: it.protein_g,
                carbs_g: it.carbs_g,
                fat_g: it.fat_g,
              }
            : undefined
        );
        resolvedItems.push(resolved);
      }

      // 1. Localizar ou criar a refeição do dia
      const finalMealType = mealType || "Almoço";
      const { data: existingMeal } = await supabase
        .from("meals")
        .select("id")
        .eq("user_id", userId)
        .eq("meal_date", targetDate)
        .eq("meal_type", finalMealType)
        .maybeSingle();

      let mealId = existingMeal?.id;
      if (!mealId) {
        const { data: newMeal, error: mErr } = await supabase
          .from("meals")
          .insert({
            user_id: userId,
            meal_date: targetDate,
            meal_type: finalMealType,
          })
          .select("id")
          .single();
        if (mErr || !newMeal) {
          return { success: false, error: `Erro ao criar refeição: ${mErr?.message}` };
        }
        mealId = newMeal.id;
      }

      // 2. Inserir itens da refeição
      const itemsToInsert = resolvedItems.map((ri) => ({
        user_id: userId,
        meal_id: mealId,
        name: ri.name,
        grams: ri.grams,
        calories: ri.calories,
        protein_g: ri.protein_g,
        carbs_g: ri.carbs_g,
        fat_g: ri.fat_g,
      }));

      const { error: insertItemsErr } = await supabase.from("meal_items").insert(itemsToInsert);
      if (insertItemsErr) {
        return { success: false, error: `Erro ao salvar itens no diário: ${insertItemsErr.message}` };
      }

      // 3. Registrar consumo de água se houver
      if (waterMl > 0) {
        await supabase.from("water_logs").insert({
          user_id: userId,
          log_date: targetDate,
          ml: Math.round(waterMl),
        });
      }
      const { data: allWater } = await supabase
        .from("water_logs")
        .select("ml")
        .eq("user_id", userId)
        .eq("log_date", targetDate);
      const totalWaterToday = (allWater || []).reduce((acc, w) => acc + (w.ml || 0), 0);

      // 4. Totais da refeição
      const mealKcal = resolvedItems.reduce((a, b) => a + b.calories, 0);
      const mealP = Math.round(resolvedItems.reduce((a, b) => a + b.protein_g, 0) * 10) / 10;
      const mealC = Math.round(resolvedItems.reduce((a, b) => a + b.carbs_g, 0) * 10) / 10;
      const mealF = Math.round(resolvedItems.reduce((a, b) => a + b.fat_g, 0) * 10) / 10;

      // 5. Totais acumulados do dia
      const { data: todayMeals } = await supabase
        .from("meals")
        .select("id")
        .eq("user_id", userId)
        .eq("meal_date", targetDate);
      const todayMealIds = (todayMeals || []).map((m) => m.id);

      let dayKcal = 0;
      let dayP = 0;
      let dayC = 0;
      let dayF = 0;

      if (todayMealIds.length > 0) {
        const { data: dayItems } = await supabase
          .from("meal_items")
          .select("calories, protein_g, carbs_g, fat_g")
          .in("meal_id", todayMealIds);

        (dayItems || []).forEach((item) => {
          dayKcal += Number(item.calories || 0);
          dayP += Number(item.protein_g || 0);
          dayC += Number(item.carbs_g || 0);
          dayF += Number(item.fat_g || 0);
        });
      }
      dayP = Math.round(dayP * 10) / 10;
      dayC = Math.round(dayC * 10) / 10;
      dayF = Math.round(dayF * 10) / 10;

      // 6. Meta do usuário
      const { data: userGoal } = await supabase
        .from("goals")
        .select("calories, protein_g, carbs_g, fat_g")
        .eq("user_id", userId)
        .maybeSingle();

      const goalKcal = userGoal?.calories || 2000;
      const goalP = userGoal?.protein_g || 140;
      const proteinPercent = Math.round((dayP / goalP) * 100);
      const kcalPercent = Math.round((dayKcal / goalKcal) * 100);

      // 7. Formatação da mensagem humanizada do Hermes
      const isToday = targetDate === getLocalDate();
      const isYesterday = targetDate === getLocalDateMinusDays(1);
      const dateSuffix = isToday
        ? ""
        : isYesterday
        ? " (de ontem)"
        : ` (${targetDate.split("-").reverse().join("/")})`;
      const dateLabel = isToday ? "Hoje" : isYesterday ? "Ontem" : targetDate.split("-").reverse().join("/");

      let replyMsg = `🍽️ **${finalMealType}${dateSuffix} registrado no FitWell Hub!**\n\n`;
      resolvedItems.forEach((ri) => {
        replyMsg += `• **${ri.name}** (${ri.grams}g): ${ri.calories} kcal | ${ri.protein_g}g P | ${ri.carbs_g}g C | ${ri.fat_g}g G\n`;
      });

      if (waterMl > 0) {
        replyMsg += `💧 **+${waterMl}ml de água** (${totalWaterToday}ml acumulados em ${dateLabel.toLowerCase()})\n`;
      }

      replyMsg += `\n📊 **Total da Refeição:** ${mealKcal} kcal | ${mealP}g P | ${mealC}g C | ${mealF}g G\n`;
      replyMsg += `🎯 **Progresso de ${dateLabel}:** ${Math.round(dayKcal)}/${goalKcal} kcal (${kcalPercent}%) • ${dayP}/${goalP}g Proteína (${proteinPercent}%)\n`;
      if (proteinPercent >= 100) {
        replyMsg += `🔥 Parabéns! Você bateu a meta de proteínas do dia! 🚀`;
      } else {
        const remainingP = Math.max(0, Math.round(goalP - dayP));
        replyMsg += `Faltam ${remainingP}g de proteína para completar sua meta diária.`;
      }

      return {
        success: true,
        mealType: finalMealType,
        mealDate: targetDate,
        items: resolvedItems,
        mealTotals: { calories: mealKcal, protein_g: mealP, carbs_g: mealC, fat_g: mealF },
        dayTotals: { calories: Math.round(dayKcal), protein_g: dayP, carbs_g: dayC, fat_g: dayF },
        water_ml: waterMl,
        total_water_today: totalWaterToday,
        goals: { calories: goalKcal, protein_g: goalP },
        message: replyMsg,
      };
    }

    // 6.1 AÇÃO: DUPLICAR OU REPETIR REFEIÇÃO ("Hermes, repete meu almoço de ontem no almoço de hoje", "duplica o que jantei ontem")
    if (data.action === "duplicate_meal") {
      const rawText = data.payload.raw_text ? String(data.payload.raw_text).trim() : "";
      let sourceDate = data.payload.source_date || data.payload.from_date ? String(data.payload.source_date || data.payload.from_date) : "";
      if (!sourceDate && rawText) {
        sourceDate = inferDateFromRelativeText(rawText) || "";
      }
      if (!sourceDate) {
        sourceDate = getLocalDateMinusDays(1); // padrão: ontem
      }

      let targetDate = data.payload.target_date || data.payload.to_date || data.payload.meal_date || data.payload.date
        ? String(data.payload.target_date || data.payload.to_date || data.payload.meal_date || data.payload.date)
        : getLocalDate(); // padrão: hoje

      let mealType = data.payload.meal_type || data.payload.source_meal_type;
      if (!mealType && rawText) {
        mealType = inferMealTypeFromTimeOrText(rawText);
      }
      if (!mealType) {
        mealType = inferMealTypeFromTimeOrText();
      }
      if (mealType === "Lanche") {
        mealType = "Lanche da tarde";
      }

      // 1. Busca as refeições da data de origem
      const { data: sourceMeals, error: smErr } = await supabase
        .from("meals")
        .select("id, meal_type, meal_date")
        .eq("user_id", userId)
        .eq("meal_date", sourceDate);

      const isSourceYesterday = sourceDate === getLocalDateMinusDays(1);
      const isSourceToday = sourceDate === getLocalDate();
      const sourceDateLabel = isSourceYesterday ? "ontem" : isSourceToday ? "hoje" : sourceDate.split("-").reverse().join("/");

      if (smErr) {
        return { success: false, error: `Erro ao buscar refeições de ${sourceDateLabel}: ${smErr.message}` };
      }

      if (!sourceMeals || sourceMeals.length === 0) {
        return {
          success: false,
          error: `Nenhuma refeição foi encontrada registrada no FitWell Hub para ${sourceDateLabel} (${sourceDate}).`,
        };
      }

      // 2. Localiza a refeição de origem correspondente
      let matchedMeal = sourceMeals.find(
        (m: any) => m.meal_type.toLowerCase() === String(mealType).toLowerCase()
      );

      if (!matchedMeal) {
        matchedMeal = sourceMeals.find((m: any) =>
          m.meal_type.toLowerCase().includes(String(mealType).toLowerCase()) ||
          String(mealType).toLowerCase().includes(m.meal_type.toLowerCase())
        );
      }

      if (!matchedMeal && sourceMeals.length === 1) {
        matchedMeal = sourceMeals[0];
      }

      if (!matchedMeal) {
        const available = sourceMeals.map((m: any) => `"${m.meal_type}"`).join(", ");
        return {
          success: false,
          error: `Não encontrei a refeição "${mealType}" em ${sourceDateLabel}. As refeições registradas foram: ${available}.`,
        };
      }

      // 3. Buscar os itens da refeição de origem
      const { data: sourceItems, error: siErr } = await supabase
        .from("meal_items")
        .select("name, grams, calories, protein_g, carbs_g, fat_g")
        .eq("meal_id", matchedMeal.id);

      if (siErr) {
        return { success: false, error: `Erro ao buscar alimentos da refeição de origem: ${siErr.message}` };
      }

      if (!sourceItems || sourceItems.length === 0) {
        return {
          success: false,
          error: `A refeição "${matchedMeal.meal_type}" de ${sourceDateLabel} não possui alimentos cadastrados para duplicar.`,
        };
      }

      // 4. Criar ou localizar a refeição de destino
      const targetMealType = (data.payload.target_meal_type as string) || matchedMeal.meal_type;
      const { data: existingTargetMeal } = await supabase
        .from("meals")
        .select("id")
        .eq("user_id", userId)
        .eq("meal_date", targetDate)
        .eq("meal_type", targetMealType)
        .maybeSingle();

      let targetMealId = existingTargetMeal?.id;
      if (!targetMealId) {
        const { data: newTargetMeal, error: mErr } = await supabase
          .from("meals")
          .insert({
            user_id: userId,
            meal_date: targetDate,
            meal_type: targetMealType,
          })
          .select("id")
          .single();

        if (mErr || !newTargetMeal) {
          return {
            success: false,
            error: `Erro ao criar refeição de destino no diário: ${mErr?.message || "falha desconhecida"}`,
          };
        }
        targetMealId = newTargetMeal.id;
      }

      // 5. Inserir os alimentos na refeição de destino
      const itemsToInsert = sourceItems.map((it: any) => ({
        meal_id: targetMealId,
        user_id: userId,
        name: it.name,
        grams: it.grams,
        calories: it.calories,
        protein_g: it.protein_g,
        carbs_g: it.carbs_g,
        fat_g: it.fat_g,
      }));

      const { error: insErr } = await supabase.from("meal_items").insert(itemsToInsert);
      if (insErr) {
        return { success: false, error: `Erro ao copiar alimentos: ${insErr.message}` };
      }

      // 6. Calcular totais da refeição duplicada
      const mealKcal = itemsToInsert.reduce((acc: number, it: any) => acc + (it.calories || 0), 0);
      const mealP = Math.round(itemsToInsert.reduce((acc: number, it: any) => acc + (it.protein_g || 0), 0) * 10) / 10;
      const mealC = Math.round(itemsToInsert.reduce((acc: number, it: any) => acc + (it.carbs_g || 0), 0) * 10) / 10;
      const mealF = Math.round(itemsToInsert.reduce((acc: number, it: any) => acc + (it.fat_g || 0), 0) * 10) / 10;

      // 7. Calcular totais do dia de destino
      const { data: dayMeals } = await supabase
        .from("meals")
        .select("id")
        .eq("user_id", userId)
        .eq("meal_date", targetDate);

      const dayMealIds = (dayMeals || []).map((m: any) => m.id);
      let dayKcal = 0;
      let dayP = 0;
      let dayC = 0;
      let dayF = 0;

      if (dayMealIds.length > 0) {
        const { data: allItems } = await supabase
          .from("meal_items")
          .select("calories, protein_g, carbs_g, fat_g")
          .in("meal_id", dayMealIds);

        (allItems || []).forEach((it: any) => {
          dayKcal += Number(it.calories || 0);
          dayP += Number(it.protein_g || 0);
          dayC += Number(it.carbs_g || 0);
          dayF += Number(it.fat_g || 0);
        });
      }
      dayP = Math.round(dayP * 10) / 10;
      dayC = Math.round(dayC * 10) / 10;
      dayF = Math.round(dayF * 10) / 10;

      // Meta do usuário
      const { data: userGoal } = await supabase
        .from("goals")
        .select("calories, protein_g, carbs_g, fat_g")
        .eq("user_id", userId)
        .maybeSingle();

      const goalKcal = userGoal?.calories || 2000;
      const goalP = userGoal?.protein_g || 140;
      const proteinPercent = Math.round((dayP / goalP) * 100);
      const kcalPercent = Math.round((dayKcal / goalKcal) * 100);

      const isTargetToday = targetDate === getLocalDate();
      const targetDateLabel = isTargetToday ? "hoje" : targetDate.split("-").reverse().join("/");

      let replyMsg = `🔄 **${matchedMeal.meal_type} de ${sourceDateLabel} duplicado para ${targetDateLabel}!**\n\n`;
      itemsToInsert.forEach((ri: any) => {
        replyMsg += `• **${ri.name}** (${ri.grams}g): ${ri.calories} kcal | ${ri.protein_g}g P | ${ri.carbs_g}g C | ${ri.fat_g}g G\n`;
      });

      replyMsg += `\n📊 **Total da Refeição:** ${mealKcal} kcal | ${mealP}g P | ${mealC}g C | ${mealF}g G\n`;
      replyMsg += `🎯 **Progresso de ${isTargetToday ? "Hoje" : targetDateLabel}:** ${Math.round(dayKcal)}/${goalKcal} kcal (${kcalPercent}%) • ${dayP}/${goalP}g Proteína (${proteinPercent}%)\n`;
      if (proteinPercent >= 100) {
        replyMsg += `🔥 Parabéns! Você bateu a meta de proteínas do dia! 🚀`;
      } else {
        const remainingP = Math.max(0, Math.round(goalP - dayP));
        replyMsg += `Faltam ${remainingP}g de proteína para completar sua meta diária.`;
      }

      return {
        success: true,
        sourceMeal: matchedMeal.meal_type,
        sourceDate,
        targetMeal: targetMealType,
        targetDate,
        items: itemsToInsert,
        mealTotals: { calories: mealKcal, protein_g: mealP, carbs_g: mealC, fat_g: mealF },
        dayTotals: { calories: Math.round(dayKcal), protein_g: dayP, carbs_g: dayC, fat_g: dayF },
        goals: { calories: goalKcal, protein_g: goalP },
        message: replyMsg,
      };
    }

    // 7. AÇÃO: BUSCAR ALIMENTO NA BIBLIOTECA ("Hermes, quantas calorias tem 150g de patinho?")
    if (data.action === "search_food") {
      const query = String(data.payload.query || data.payload.food || "").trim();
      const grams = Number(data.payload.grams || 100);

      if (!query) {
        return { success: false, error: "Nome do alimento não informado para consulta." };
      }

      const resolved = await resolveFoodItemWithLibrary(supabase, userId, query, grams);

      const replyMsg =
        `🔍 **${resolved.name}** (${resolved.grams}g):\n` +
        `• Calorias: **${resolved.calories} kcal**\n` +
        `• Proteínas: **${resolved.protein_g}g**\n` +
        `• Carboidratos: **${resolved.carbs_g}g**\n` +
        `• Gorduras: **${resolved.fat_g}g**\n` +
        `*(Fonte dos dados: ${resolved.source})*`;

      return {
        success: true,
        food: resolved,
        message: replyMsg,
      };
    }

    // 8. AÇÃO: ATUALIZAR QUANTIDADE DE UM ALIMENTO ("Hermes, na banana eram 150g e não 100g")
    if (data.action === "update_meal_item") {
      const foodQuery = String(data.payload.food_name || data.payload.query || data.payload.food || "").trim();
      const newGrams = Number(data.payload.grams || data.payload.new_grams || 0);
      const targetDate = data.payload.meal_date ? String(data.payload.meal_date) : getLocalDate();
      const mealTypeFilter = data.payload.meal_type ? String(data.payload.meal_type).trim() : null;

      if (!foodQuery || newGrams <= 0) {
        return { success: false, error: "Informe o nome do alimento e a nova quantidade em gramas." };
      }

      // 1. Buscar refeições do dia
      let mealQuery = supabase
        .from("meals")
        .select("id, meal_type")
        .eq("user_id", userId)
        .eq("meal_date", targetDate);

      if (mealTypeFilter) {
        if (mealTypeFilter === "Lanche da tarde" || mealTypeFilter === "Lanche") {
          mealQuery = mealQuery.in("meal_type", ["Lanche da tarde", "Lanche"]);
        } else {
          mealQuery = mealQuery.eq("meal_type", mealTypeFilter);
        }
      }

      const { data: userMeals } = await mealQuery;
      const mealIds = (userMeals || []).map((m) => m.id);

      if (mealIds.length === 0) {
        return { success: false, error: `Nenhuma refeição encontrada para hoje (${targetDate}).` };
      }

      // 2. Buscar o item de refeição correspondente
      const { data: matchingItems } = await supabase
        .from("meal_items")
        .select("id, meal_id, name, grams, calories, protein_g, carbs_g, fat_g")
        .in("meal_id", mealIds)
        .ilike("name", `%${foodQuery}%`)
        .order("created_at", { ascending: false });

      if (!matchingItems || matchingItems.length === 0) {
        return { success: false, error: `Não encontrei nenhum alimento chamado "${foodQuery}" registrado hoje no seu app.` };
      }

      const itemToUpdate = matchingItems[0];
      const oldGrams = Number(itemToUpdate.grams) || 100;
      const ratio = newGrams / oldGrams;

      const updatedKcal = Math.round(Number(itemToUpdate.calories || 0) * ratio);
      const updatedP = Math.round(Number(itemToUpdate.protein_g || 0) * ratio * 10) / 10;
      const updatedC = Math.round(Number(itemToUpdate.carbs_g || 0) * ratio * 10) / 10;
      const updatedF = Math.round(Number(itemToUpdate.fat_g || 0) * ratio * 10) / 10;

      const { error: updErr } = await supabase
        .from("meal_items")
        .update({
          grams: newGrams,
          calories: updatedKcal,
          protein_g: updatedP,
          carbs_g: updatedC,
          fat_g: updatedF,
        })
        .eq("id", itemToUpdate.id);

      if (updErr) {
        return { success: false, error: `Erro ao atualizar alimento: ${updErr.message}` };
      }

      // 3. Recalcular totais do dia
      const { data: allTodayMeals } = await supabase
        .from("meals")
        .select("id")
        .eq("user_id", userId)
        .eq("meal_date", targetDate);
      const allMIds = (allTodayMeals || []).map((m) => m.id);

      let dayKcal = 0;
      let dayP = 0;

      if (allMIds.length > 0) {
        const { data: dayItems } = await supabase
          .from("meal_items")
          .select("calories, protein_g")
          .in("meal_id", allMIds);

        (dayItems || []).forEach((item) => {
          dayKcal += Number(item.calories || 0);
          dayP += Number(item.protein_g || 0);
        });
      }

      const { data: userGoal } = await supabase
        .from("goals")
        .select("calories, protein_g")
        .eq("user_id", userId)
        .maybeSingle();

      const goalKcal = userGoal?.calories || 2000;
      const goalP = userGoal?.protein_g || 140;

      return {
        success: true,
        foodName: itemToUpdate.name,
        newGrams,
        updatedMacros: { calories: updatedKcal, protein_g: updatedP, carbs_g: updatedC, fat_g: updatedF },
        dayTotals: { calories: Math.round(dayKcal), protein_g: Math.round(dayP * 10) / 10 },
        message: `✏️ **${itemToUpdate.name}** atualizado para **${newGrams}g** com sucesso!\n\n` +
          `• Novos valores: ${updatedKcal} kcal | ${updatedP}g P | ${updatedC}g C | ${updatedF}g G\n` +
          `🎯 Total de hoje recalculado: ${Math.round(dayKcal)}/${goalKcal} kcal • ${Math.round(dayP * 10) / 10}/${goalP}g Proteína.`,
      };
    }

    // 9. AÇÃO: APAGAR UM ALIMENTO ("Hermes, apaga a banana que registrei")
    if (data.action === "delete_meal_item") {
      const foodQuery = String(data.payload.food_name || data.payload.query || data.payload.food || "").trim();
      const targetDate = data.payload.meal_date ? String(data.payload.meal_date) : getLocalDate();
      const mealTypeFilter = data.payload.meal_type ? String(data.payload.meal_type).trim() : null;

      if (!foodQuery) {
        return { success: false, error: "Informe o nome do alimento que deseja apagar." };
      }

      let mealQuery = supabase
        .from("meals")
        .select("id, meal_type")
        .eq("user_id", userId)
        .eq("meal_date", targetDate);

      if (mealTypeFilter) {
        if (mealTypeFilter === "Lanche da tarde" || mealTypeFilter === "Lanche") {
          mealQuery = mealQuery.in("meal_type", ["Lanche da tarde", "Lanche"]);
        } else {
          mealQuery = mealQuery.eq("meal_type", mealTypeFilter);
        }
      }

      const { data: userMeals } = await mealQuery;
      const mealIds = (userMeals || []).map((m) => m.id);

      if (mealIds.length === 0) {
        return { success: false, error: `Nenhuma refeição encontrada para hoje (${targetDate}).` };
      }

      const { data: matchingItems } = await supabase
        .from("meal_items")
        .select("id, meal_id, name, grams, calories, protein_g")
        .in("meal_id", mealIds)
        .ilike("name", `%${foodQuery}%`)
        .order("created_at", { ascending: false });

      if (!matchingItems || matchingItems.length === 0) {
        return { success: false, error: `Não encontrei nenhum alimento chamado "${foodQuery}" nas suas refeições de hoje.` };
      }

      const itemToDelete = matchingItems[0];
      const parentMeal = (userMeals || []).find((m) => m.id === itemToDelete.meal_id);
      const mealName = parentMeal?.meal_type || "sua refeição";

      const { error: delErr } = await supabase
        .from("meal_items")
        .delete()
        .eq("id", itemToDelete.id);

      if (delErr) {
        return { success: false, error: `Erro ao apagar alimento: ${delErr.message}` };
      }

      // Se a refeição ficou sem nenhum item, apaga a refeição também
      const { data: remainingInMeal } = await supabase
        .from("meal_items")
        .select("id")
        .eq("meal_id", itemToDelete.meal_id);

      if (!remainingInMeal || remainingInMeal.length === 0) {
        await supabase.from("meals").delete().eq("id", itemToDelete.meal_id);
      }

      // Recalcular totais do dia
      const { data: allTodayMeals } = await supabase
        .from("meals")
        .select("id")
        .eq("user_id", userId)
        .eq("meal_date", targetDate);
      const allMIds = (allTodayMeals || []).map((m) => m.id);

      let dayKcal = 0;
      let dayP = 0;

      if (allMIds.length > 0) {
        const { data: dayItems } = await supabase
          .from("meal_items")
          .select("calories, protein_g")
          .in("meal_id", allMIds);

        (dayItems || []).forEach((item) => {
          dayKcal += Number(item.calories || 0);
          dayP += Number(item.protein_g || 0);
        });
      }

      return {
        success: true,
        deletedFood: itemToDelete.name,
        mealType: mealName,
        dayTotals: { calories: Math.round(dayKcal), protein_g: Math.round(dayP * 10) / 10 },
        message: `🗑️ **${itemToDelete.name}** removido de **${mealName}** com sucesso!\n\n` +
          `📉 Calorias e macros foram deduzidos da sua meta diária no FitWell Hub. Total de hoje: ${Math.round(dayKcal)} kcal.`,
      };
    }

    // 10. AÇÃO: APAGAR UMA REFEIÇÃO INTEIRA ("Hermes, apaga o meu lanche da tarde")
    if (data.action === "delete_meal") {
      const rawText = data.payload.raw_text ? String(data.payload.raw_text).trim() : "";
      const rawMealType = String(data.payload.meal_type || data.payload.type || "").trim() || (rawText ? inferMealTypeFromTimeOrText(rawText) : "");
      let targetDate = data.payload.meal_date || data.payload.date ? String(data.payload.meal_date || data.payload.date) : "";
      if (!targetDate && rawText) {
        targetDate = inferDateFromRelativeText(rawText) || "";
      }
      if (!targetDate) {
        targetDate = getLocalDate();
      }

      if (!rawMealType) {
        return { success: false, error: "Informe qual refeição deseja excluir (ex: 'Lanche da tarde', 'Almoço')." };
      }

      let typesToMatch = [rawMealType];
      if (rawMealType.toLowerCase().includes("lanche")) {
        typesToMatch = ["Lanche da tarde", "Lanche", "Lanche da manhã"];
      }

      const { data: mealsToDelete } = await supabase
        .from("meals")
        .select("id, meal_type")
        .eq("user_id", userId)
        .eq("meal_date", targetDate)
        .in("meal_type", typesToMatch);

      const isToday = targetDate === getLocalDate();
      const dateDesc = isToday ? "hoje" : targetDate.split("-").reverse().join("/");

      if (!mealsToDelete || mealsToDelete.length === 0) {
        return { success: false, error: `Nenhuma refeição "${rawMealType}" encontrada para ${dateDesc} (${targetDate}).` };
      }

      const mealIds = mealsToDelete.map((m) => m.id);
      await supabase.from("meal_items").delete().in("meal_id", mealIds);
      await supabase.from("meals").delete().in("id", mealIds);

      return {
        success: true,
        deletedMeal: mealsToDelete[0].meal_type,
        message: `🗑️ Refeição **${mealsToDelete[0].meal_type}** e todos os seus alimentos foram excluídos com sucesso do seu diário (${isToday ? "de hoje" : `data: ${dateDesc}`})!`,
      };
    }

    // 11. AÇÃO: AJUSTAR OU CORRIGIR CONSUMO DE ÁGUA ("Hermes, ajusta minha água para 2000ml" ou "soma mais 300ml de água")
    if (data.action === "adjust_water") {
      const targetDate = data.payload.log_date || data.payload.date ? String(data.payload.log_date || data.payload.date) : getLocalDate();
      const waterMl = Number(data.payload.water_ml || data.payload.ml || 0);
      const mode = (data.payload.mode || "set") as "set" | "add" | "subtract";

      if (waterMl === 0 && mode !== "set") {
        return { success: false, error: "Informe a quantidade de água em ml." };
      }

      if (mode === "set") {
        await supabase.from("water_logs").delete().eq("user_id", userId).eq("log_date", targetDate);
        if (waterMl > 0) {
          await supabase.from("water_logs").insert({
            user_id: userId,
            log_date: targetDate,
            ml: Math.round(waterMl),
          });
        }
      } else if (mode === "add") {
        await supabase.from("water_logs").insert({
          user_id: userId,
          log_date: targetDate,
          ml: Math.round(waterMl),
        });
      } else if (mode === "subtract") {
        await supabase.from("water_logs").insert({
          user_id: userId,
          log_date: targetDate,
          ml: -Math.round(Math.abs(waterMl)),
        });
      }

      const { data: todayWater } = await supabase
        .from("water_logs")
        .select("ml")
        .eq("user_id", userId)
        .eq("log_date", targetDate);
      const totalWater = Math.max(0, (todayWater || []).reduce((acc, w) => acc + (w.ml || 0), 0));

      return {
        success: true,
        total_water_today: totalWater,
        message: `💧 Meta de água atualizada com sucesso!\n\nTotal acumulado de hoje: **${totalWater}ml** hidratados. Continue firme! 🥤`,
      };
    }

    // 12. AÇÃO: DESFAZER CONCLUSÃO DE TREINO ("Hermes, desfaz o treino de hoje")
    if (data.action === "undo_workout") {
      const routineName = String(data.payload.routine_name || data.payload.workout || "").trim();
      const bounds = todayBoundsSaoPaulo();

      let sessionQuery = supabase
        .from("workout_sessions")
        .select("id, name, completed_at")
        .eq("user_id", userId)
        .gte("completed_at", bounds.start)
        .lte("completed_at", bounds.end)
        .order("completed_at", { ascending: false });

      if (routineName) {
        sessionQuery = sessionQuery.ilike("name", `%${routineName}%`);
      }

      const { data: sessions } = await sessionQuery;

      if (!sessions || sessions.length === 0) {
        return { success: false, error: "Nenhuma sessão de treino concluída encontrada para hoje." };
      }

      const sessionToUndo = sessions[0];
      await supabase.from("workout_session_sets").delete().eq("session_id", sessionToUndo.id);
      await supabase.from("workout_sessions").delete().eq("id", sessionToUndo.id);

      return {
        success: true,
        undoneWorkout: sessionToUndo.name,
        message: `↩️ Conclusão do treino **"${sessionToUndo.name}"** desfeita com sucesso! Os registros de séries de hoje foram removidos.`,
      };
    }

    // 13. AÇÃO: CONSULTAR DIÁRIO DO DIA / LISTAR REFEIÇÕES ("get_day", "list_meals")
    if (data.action === "get_day" || data.action === "list_meals") {
      const rawText = data.payload.raw_text ? String(data.payload.raw_text).trim() : "";
      let targetDate = data.payload.date || data.payload.meal_date ? String(data.payload.date || data.payload.meal_date) : "";
      if (!targetDate && rawText) {
        targetDate = inferDateFromRelativeText(rawText) || "";
      }
      if (!targetDate) {
        targetDate = getLocalDate();
      }

      // 1. Buscar refeições do dia
      const { data: meals } = await supabase
        .from("meals")
        .select("id, meal_type, created_at")
        .eq("user_id", userId)
        .eq("meal_date", targetDate)
        .order("created_at", { ascending: true });

      const mealIds = (meals || []).map((m) => m.id);
      let items: any[] = [];
      if (mealIds.length > 0) {
        const { data: mealItems } = await supabase
          .from("meal_items")
          .select("id, meal_id, name, grams, calories, protein_g, carbs_g, fat_g, created_at")
          .in("meal_id", mealIds)
          .order("created_at", { ascending: true });
        items = mealItems || [];
      }

      // Agrupar itens por refeição
      const structuredMeals = (meals || []).map((m) => {
        const mItems = items.filter((it) => it.meal_id === m.id);
        const mealCalories = mItems.reduce((acc, it) => acc + (it.calories || 0), 0);
        const mealProtein = Math.round(mItems.reduce((acc, it) => acc + (it.protein_g || 0), 0) * 10) / 10;
        const mealCarbs = Math.round(mItems.reduce((acc, it) => acc + (it.carbs_g || 0), 0) * 10) / 10;
        const mealFat = Math.round(mItems.reduce((acc, it) => acc + (it.fat_g || 0), 0) * 10) / 10;

        return {
          id: m.id,
          meal_type: m.meal_type,
          calories: mealCalories,
          protein_g: mealProtein,
          carbs_g: mealCarbs,
          fat_g: mealFat,
          items: mItems.map((it) => ({
            id: it.id,
            name: it.name,
            grams: it.grams,
            calories: it.calories,
            protein_g: it.protein_g,
            carbs_g: it.carbs_g,
            fat_g: it.fat_g,
          })),
        };
      });

      // 2. Buscar água do dia
      const { data: waterEntries } = await supabase
        .from("water_logs")
        .select("ml")
        .eq("user_id", userId)
        .eq("log_date", targetDate);
      const totalWaterMl = (waterEntries || []).reduce((acc, w) => acc + (w.ml || 0), 0);

      // 3. Totais consumidos no dia
      const totalCalories = items.reduce((acc, it) => acc + (it.calories || 0), 0);
      const totalProtein = Math.round(items.reduce((acc, it) => acc + (it.protein_g || 0), 0) * 10) / 10;
      const totalCarbs = Math.round(items.reduce((acc, it) => acc + (it.carbs_g || 0), 0) * 10) / 10;
      const totalFat = Math.round(items.reduce((acc, it) => acc + (it.fat_g || 0), 0) * 10) / 10;

      // 4. Metas do usuário
      const { data: userGoals } = await supabase
        .from("goals")
        .select("calories, protein_g, carbs_g, fat_g, water_ml")
        .eq("user_id", userId)
        .maybeSingle();

      const goals = {
        calories: Number(userGoals?.calories || 2000),
        protein_g: Number(userGoals?.protein_g || 140),
        carbs_g: Number(userGoals?.carbs_g || 220),
        fat_g: Number(userGoals?.fat_g || 65),
        water_ml: Number(userGoals?.water_ml || 2500),
      };

      const remaining = {
        calories: Math.max(0, goals.calories - totalCalories),
        protein_g: Math.max(0, Math.round((goals.protein_g - totalProtein) * 10) / 10),
        carbs_g: Math.max(0, Math.round((goals.carbs_g - totalCarbs) * 10) / 10),
        fat_g: Math.max(0, Math.round((goals.fat_g - totalFat) * 10) / 10),
        water_ml: Math.max(0, goals.water_ml - totalWaterMl),
      };

      // 5. Treinos concluídos na data (convertido para limites de São Paulo UTC-3)
      const [ty, tm, td] = targetDate.split("-").map(Number);
      const targetStartMs = Date.UTC(ty, tm - 1, td, 3, 0, 0, 0); // 00:00 SP = 03:00 UTC
      const targetBounds = {
        start: new Date(targetStartMs).toISOString(),
        end: new Date(targetStartMs + 86400000 - 1).toISOString(),
      };

      const { data: workouts } = await supabase
        .from("workout_sessions")
        .select("id, name, completed_at, notes")
        .eq("user_id", userId)
        .gte("completed_at", targetBounds.start)
        .lte("completed_at", targetBounds.end)
        .order("completed_at", { ascending: false });

      const workoutIds = (workouts || []).map((w) => w.id);
      const sessionSetsMap: Record<string, any[]> = {};
      if (workoutIds.length > 0) {
        const { data: setsData } = await supabase
          .from("workout_session_sets")
          .select("session_id, exercise_name, set_number, reps, weight_kg, completed")
          .in("session_id", workoutIds)
          .order("set_number", { ascending: true });

        (setsData || []).forEach((st) => {
          if (!sessionSetsMap[st.session_id]) sessionSetsMap[st.session_id] = [];
          sessionSetsMap[st.session_id].push(st);
        });
      }

      const structuredWorkouts = (workouts || []).map((w) => {
        const sSets = sessionSetsMap[w.id] || [];
        const exMap = new Map<string, any[]>();
        sSets.forEach((st) => {
          if (!exMap.has(st.exercise_name)) exMap.set(st.exercise_name, []);
          exMap.get(st.exercise_name)!.push(st);
        });

        let totalVol = 0;
        const exercises = Array.from(exMap.entries()).map(([exName, stList]) => {
          const isCardio = isCardioExercise(exName);
          let maxW = 0;
          let exVol = 0;
          stList.forEach((st) => {
            const weight = Number(st.weight_kg) || 0;
            const reps = Number(st.reps) || 0;
            if (weight > maxW) maxW = weight;
            if (!isCardio && st.completed) exVol += weight * reps;
          });
          totalVol += exVol;

          let setsSummary = "";
          if (isCardio) {
            const totalMins = stList.reduce((acc, st) => acc + (Number(st.reps) || 0), 0);
            const topSpeed = Math.max(...stList.map((st) => Number(st.weight_kg) || 0), 0);
            setsSummary = `${totalMins} min${topSpeed > 0 ? ` @ ${topSpeed} km/h` : ""}`;
          } else {
            const summaryParts = stList.map((st) => `${st.reps}x ${Number(st.weight_kg) || 0}kg`);
            setsSummary = summaryParts.join(", ");
          }

          return {
            name: exName,
            is_cardio: isCardio,
            sets_count: stList.length,
            max_weight_kg: maxW,
            total_volume_kg: exVol,
            sets_summary: setsSummary,
            sets: stList.map((st) => ({
              set_number: st.set_number,
              reps: st.reps,
              weight_kg: Number(st.weight_kg) || 0,
              completed: st.completed,
            })),
          };
        });

        const completedTimeBrt = w.completed_at
          ? new Date(w.completed_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
          : null;

        return {
          id: w.id,
          name: w.name,
          completed_at: w.completed_at,
          completed_time_brt: completedTimeBrt,
          notes: w.notes || null,
          total_volume_kg: totalVol,
          exercises_count: exercises.length,
          exercises,
        };
      });

      // 6. Texto formatado
      const isToday = targetDate === getLocalDate();
      const isYesterday = targetDate === getLocalDateMinusDays(1);
      const dateTitle = isToday ? "Hoje" : isYesterday ? "Ontem" : targetDate.split("-").reverse().join("/");
      let summaryText = `📅 **Diário de ${dateTitle} (${targetDate})**\n\n`;

      if (structuredMeals.length === 0) {
        summaryText += `🍽️ **Refeições:** Nenhuma refeição cadastrada para ${dateTitle.toLowerCase()}.\n\n`;
      } else {
        summaryText += `🍽️ **Refeições (${structuredMeals.length}):**\n`;
        structuredMeals.forEach((m) => {
          summaryText += `• **${m.meal_type}** (${m.calories} kcal | ${m.protein_g}g P | ${m.carbs_g}g C | ${m.fat_g}g G):\n`;
          if (m.items.length === 0) {
            summaryText += `  *(sem itens)*\n`;
          } else {
            m.items.forEach((it) => {
              summaryText += `  - ${it.name} (${it.grams}g): ${it.calories} kcal, ${it.protein_g}g P, ${it.carbs_g}g C, ${it.fat_g}g G\n`;
            });
          }
        });
        summaryText += `\n`;
      }

      summaryText += `💧 **Água:** ${totalWaterMl.toLocaleString("pt-BR")} ml / Meta: ${goals.water_ml.toLocaleString("pt-BR")} ml (Faltam ${remaining.water_ml.toLocaleString("pt-BR")} ml)\n\n`;

      summaryText += `📊 **Totais vs Metas:**\n`;
      summaryText += `• Calorias: ${totalCalories} / ${goals.calories} kcal (Restam: ${remaining.calories} kcal)\n`;
      summaryText += `• Proteínas: ${totalProtein}g / ${goals.protein_g}g (Restam: ${remaining.protein_g}g)\n`;
      summaryText += `• Carboidratos: ${totalCarbs}g / ${goals.carbs_g}g (Restam: ${remaining.carbs_g}g)\n`;
      summaryText += `• Gorduras: ${totalFat}g / ${goals.fat_g}g (Restam: ${remaining.fat_g}g)\n\n`;

      // 5.5 Passos do dia
      const { data: stepLog } = await supabase
        .from("daily_steps_logs")
        .select("steps, active_calories")
        .eq("user_id", userId)
        .eq("log_date", targetDate)
        .maybeSingle();

      const daySteps = stepLog?.steps ? Number(stepLog.steps) : 0;
      const dayActiveCal = stepLog?.active_calories
        ? Number(stepLog.active_calories)
        : (daySteps > 0 ? estimateActiveCaloriesFromSteps(daySteps) : 0);
      const dayDistMeters = Math.round(daySteps * 0.75);
      const dayDistKm = daySteps > 0
        ? ((dayDistMeters) / 1000).toFixed(1).replace(".", ",")
        : "0,0";

      if (daySteps > 0) {
        summaryText += `👟 **Passos:** ${daySteps.toLocaleString("pt-BR")} passos (~${dayActiveCal} kcal ativas | ~${dayDistKm} km)\n\n`;
      }

      if (structuredWorkouts.length > 0) {
        summaryText += `🏋️‍♂️ **Treinos Concluídos (${structuredWorkouts.length}):**\n`;
        structuredWorkouts.forEach((w) => {
          const timeTag = w.completed_time_brt ? ` às ${w.completed_time_brt}` : "";
          summaryText += `• **${w.name}**${timeTag}:\n`;
          if (w.notes) summaryText += `  *Anotações: ${w.notes}*\n`;
          if (w.exercises.length === 0) {
            summaryText += `  *(sem detalhes de exercícios)*\n`;
          } else {
            w.exercises.forEach((ex) => {
              const icon = ex.is_cardio ? "🏃" : "💪";
              summaryText += `  ${icon} **${ex.name}**: ${ex.sets_summary}\n`;
            });
            if (w.total_volume_kg > 0) {
              summaryText += `  📊 Volume Total: **${w.total_volume_kg.toLocaleString("pt-BR")} kg**\n`;
            }
          }
        });
      } else {
        summaryText += `🏋️‍♂️ Nenhum treino concluído para ${dateTitle.toLowerCase()}.\n`;
      }

      return {
        success: true,
        date: targetDate,
        meals: structuredMeals,
        water_ml: totalWaterMl,
        steps: daySteps,
        active_calories: dayActiveCal,
        distance_meters: dayDistMeters,
        totals: {
          calories: totalCalories,
          protein_g: totalProtein,
          carbs_g: totalCarbs,
          fat_g: totalFat,
          water_ml: totalWaterMl,
        },
        goals,
        remaining,
        workouts: structuredWorkouts,
        summaryText,
        message: summaryText,
      };
    }

    // 14. AÇÃO: REGISTRAR MEDIDAS CORPORAIS ("Hermes, anota minhas medidas: cintura 82cm, braço 39cm")
    if (data.action === "log_measurement") {
      const targetDate = data.payload.log_date || data.payload.date ? String(data.payload.log_date || data.payload.date) : getLocalDate();
      const rawText = data.payload.raw_text ? String(data.payload.raw_text).trim() : "";

      const rawItems = Array.isArray(data.payload.items)
        ? data.payload.items
        : Array.isArray(data.payload.measurements)
        ? data.payload.measurements
        : [];

      const itemsToProcess: Array<{ label: string; value_cm: number }> = [];

      // A) Se enviou lista estruturada de medidas em "items" ou "measurements"
      if (rawItems.length > 0) {
        for (const item of rawItems) {
          const val = Number(String(item.value_cm || item.value || "").replace(",", "."));
          if (item.label && val > 0) {
            const normalized = normalizeMeasurementLabel(String(item.label));
            for (const n of normalized) {
              itemsToProcess.push({ label: n, value_cm: Math.round(val * 10) / 10 });
            }
          }
        }
      }

      // B) Se enviou apenas uma medida simples { label: "cintura", value_cm: 82 }
      if (itemsToProcess.length === 0 && (data.payload.label || data.payload.name)) {
        const val = Number(String(data.payload.value_cm || data.payload.value || data.payload.cm || "").replace(",", "."));
        const rawLabel = String(data.payload.label || data.payload.name);
        if (rawLabel && val > 0) {
          const normalized = normalizeMeasurementLabel(rawLabel);
          for (const n of normalized) {
            itemsToProcess.push({ label: n, value_cm: Math.round(val * 10) / 10 });
          }
        }
      }

      // C) Fallback: Se não veio estruturado, parsear do raw_text
      if (itemsToProcess.length === 0 && rawText) {
        const parsed = parseMeasurementsFromText(rawText);
        itemsToProcess.push(...parsed);
      }

      if (itemsToProcess.length === 0) {
        return {
          success: false,
          error: "Nenhuma medida corporal identificada. Envie no formato items: [{ label: 'Cintura', value_cm: 82 }] ou measurements: [{ label: 'Cintura', value_cm: 82 }].",
        };
      }

      // Evita duplicatas na mesma requisição
      const uniqueItemsMap = new Map<string, number>();
      for (const it of itemsToProcess) {
        uniqueItemsMap.set(it.label, it.value_cm);
      }

      const insertedSummary: Array<{ label: string; value_cm: number; diffStr: string; updated: boolean }> = [];

      for (const [label, value_cm] of uniqueItemsMap.entries()) {
        // Busca medida anterior desse label em datas anteriores para calcular evolução real
        const { data: prevList } = await supabase
          .from("body_measurements")
          .select("value_cm, log_date")
          .eq("user_id", userId)
          .eq("label", label)
          .neq("log_date", targetDate)
          .order("log_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        const prev = prevList?.[0];
        let diffStr = "";
        if (prev) {
          const diff = Math.round((value_cm - Number(prev.value_cm)) * 10) / 10;
          if (Math.abs(diff) >= 0.1) {
            const signal = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
            diffStr = ` (${signal} cm vs ${prev.value_cm} cm em ${prev.log_date})`;
          } else {
            diffStr = ` (estável)`;
          }
        }

        // Verifica se já existe registro desse mesmo label na mesma data para ATUALIZAR em vez de duplicar
        const { data: existingEntry } = await supabase
          .from("body_measurements")
          .select("id")
          .eq("user_id", userId)
          .eq("log_date", targetDate)
          .eq("label", label)
          .limit(1);

        let isUpdate = false;
        if (existingEntry && existingEntry.length > 0) {
          isUpdate = true;
          await supabase
            .from("body_measurements")
            .update({ value_cm })
            .eq("id", existingEntry[0].id);
        } else {
          await supabase.from("body_measurements").insert({
            user_id: userId,
            log_date: targetDate,
            label,
            value_cm,
          });
        }

        insertedSummary.push({ label, value_cm, diffStr, updated: isUpdate });
      }

      let msg = `📏 **Medidas Corporais Registradas com Sucesso!**\n📅 Data: **${targetDate}**\n\n`;
      insertedSummary.forEach((it) => {
        const tag = it.updated ? " *(atualizado)*" : "";
        msg += `• **${it.label}**: ${it.value_cm.toFixed(1)} cm${it.diffStr}${tag}\n`;
      });
      msg += `\nSuas medidas foram salvas no FitWell Hub e já estão visíveis na tela de Medidas Corporais! 📊`;

      return {
        success: true,
        date: targetDate,
        count: insertedSummary.length,
        measurements: insertedSummary,
        message: msg,
      };
    }

    // 15. AÇÃO: CONSULTAR MEDIDAS CORPORAIS ("Hermes, quais foram minhas últimas medidas?")
    if (data.action === "get_measurements") {
      const labelFilter = data.payload.label ? String(data.payload.label).trim() : null;
      const sinceDate = data.payload.since ? String(data.payload.since).trim() : null;

      let query = supabase
        .from("body_measurements")
        .select("id, log_date, label, value_cm, created_at")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (sinceDate) {
        query = query.gte("log_date", sinceDate);
      }

      const { data: rows } = await query.limit(200);

      if (!rows || rows.length === 0) {
        return {
          success: true,
          measurements: [],
          byDate: {},
          message: "📏 Nenhuma medida corporal encontrada no FitWell Hub para o período solicitado.",
        };
      }

      // Agrupa por label para calcular evolução
      const groups = new Map<string, Array<{ log_date: string; value_cm: number }>>();
      // Agrupa por data para retorno estruturado por data e label
      const byDate: Record<string, Record<string, number>> = {};

      for (const r of rows) {
        if (!groups.has(r.label)) {
          groups.set(r.label, []);
        }
        groups.get(r.label)!.push({ log_date: r.log_date, value_cm: Number(r.value_cm) });

        if (!byDate[r.log_date]) {
          byDate[r.log_date] = {};
        }
        byDate[r.log_date][r.label] = Number(r.value_cm);
      }

      const results: Array<{
        label: string;
        current_cm: number;
        current_date: string;
        prev_cm: number | null;
        prev_date: string | null;
        diff_cm: number | null;
      }> = [];

      for (const [label, history] of groups.entries()) {
        if (labelFilter && !label.toLowerCase().includes(labelFilter.toLowerCase())) {
          continue;
        }
        const current = history[0];
        const prev = history[1] || null;
        const diff_cm = prev ? Math.round((current.value_cm - prev.value_cm) * 10) / 10 : null;

        results.push({
          label,
          current_cm: current.value_cm,
          current_date: current.log_date,
          prev_cm: prev?.value_cm || null,
          prev_date: prev?.log_date || null,
          diff_cm,
        });
      }

      if (results.length === 0) {
        return {
          success: true,
          measurements: [],
          byDate: {},
          message: `📏 Nenhuma medida encontrada para o filtro "${labelFilter}".`,
        };
      }

      let msg = `📏 **Suas Medidas Corporais:${sinceDate ? ` (desde ${sinceDate})` : ""}**\n\n`;
      results.forEach((it) => {
        let diffText = "";
        if (it.diff_cm !== null) {
          const sig = it.diff_cm > 0 ? `+${it.diff_cm.toFixed(1)}` : it.diff_cm.toFixed(1);
          diffText = ` (${sig} cm)`;
        }
        msg += `• **${it.label}**: ${it.current_cm.toFixed(1)} cm (em ${it.current_date})${diffText}\n`;
      });
      msg += `\nUse o app FitWell Hub para ver os gráficos de evolução! 📈`;

      return {
        success: true,
        measurements: results,
        byDate,
        message: msg,
      };
    }

    // 16. AÇÃO: REGISTRAR PESO ("Hermes, bati 78.5kg na balança")
    if (data.action === "log_weight") {
      const targetDate = data.payload.log_date || data.payload.date ? String(data.payload.log_date || data.payload.date) : getLocalDate();
      let weightVal = Number(String(data.payload.weight_kg || data.payload.weight || data.payload.valor || data.payload.kg || "").replace(",", "."));

      if ((!weightVal || isNaN(weightVal)) && data.payload.raw_text) {
        const match = /(?:peso|pesei|pesando|balan[çc]a|bati|deu)?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:kg|quilos)?/i.exec(String(data.payload.raw_text));
        if (match && match[1]) {
          weightVal = parseFloat(match[1].replace(",", "."));
        }
      }

      if (!weightVal || isNaN(weightVal) || weightVal <= 20 || weightVal >= 350) {
        return {
          success: false,
          error: "Peso inválido. Informe o peso em kg (ex: weight_kg: 78.5).",
        };
      }

      weightVal = Math.round(weightVal * 10) / 10;

      // Busca pesagem anterior em data diferente para calcular variação real
      const { data: prevWeights } = await supabase
        .from("body_weights")
        .select("weight_kg, log_date")
        .eq("user_id", userId)
        .neq("log_date", targetDate)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      const prev = prevWeights?.[0];
      let diffStr = "";
      if (prev) {
        const diff = Math.round((weightVal - Number(prev.weight_kg)) * 10) / 10;
        if (Math.abs(diff) >= 0.1) {
          const sig = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
          diffStr = `\n• Variação: **${sig} kg** em relação à pesagem anterior (${Number(prev.weight_kg).toFixed(1)} kg em ${prev.log_date})`;
        } else {
          diffStr = `\n• Variação: **estável** em relação à pesagem anterior (${prev.weight_kg} kg)`;
        }
      }

      // Se já existir registro do mesmo log_date, ATUALIZA em vez de duplicar
      const { data: existingWeight } = await supabase
        .from("body_weights")
        .select("id")
        .eq("user_id", userId)
        .eq("log_date", targetDate)
        .limit(1);

      let isUpdate = false;
      if (existingWeight && existingWeight.length > 0) {
        isUpdate = true;
        await supabase
          .from("body_weights")
          .update({ weight_kg: weightVal })
          .eq("id", existingWeight[0].id);
      } else {
        await supabase.from("body_weights").insert({
          user_id: userId,
          log_date: targetDate,
          weight_kg: weightVal,
        });
      }

      // Atualiza timestamp do perfil
      await supabase
        .from("profiles")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      const tag = isUpdate ? " *(atualizado para hoje)*" : "";
      const msg = `⚖️ **Peso Registrado com Sucesso!**${tag}\n\n• Peso atual: **${weightVal.toFixed(1)} kg** (em ${targetDate})${diffStr}\n\nSeu perfil e metas metabólicas no FitWell Hub foram sincronizados! 🚀`;

      return {
        success: true,
        weight_kg: weightVal,
        date: targetDate,
        updated: isUpdate,
        previous_weight_kg: prev ? Number(prev.weight_kg) : null,
        message: msg,
      };
    }

    // 17. AÇÃO: CONSULTAR HISTÓRICO DE PESO ("Hermes, quanto estou pesando?")
    if (data.action === "get_weight") {
      const limit = Math.min(100, Math.max(1, Number(data.payload.limit) || 15));
      const sinceDate = data.payload.since ? String(data.payload.since).trim() : null;

      let query = supabase
        .from("body_weights")
        .select("id, log_date, weight_kg, created_at")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (sinceDate) {
        query = query.gte("log_date", sinceDate);
      }

      const { data: weights } = await query.limit(limit);

      if (!weights || weights.length === 0) {
        return {
          success: true,
          weights: [],
          message: "⚖️ Nenhuma pesagem encontrada no FitWell Hub para o período solicitado.",
        };
      }

      const latest = weights[0];
      const prev = weights[1] || null;

      // Busca primeira pesagem registrada para total acumulado
      const { data: firstWeightRows } = await supabase
        .from("body_weights")
        .select("weight_kg, log_date")
        .eq("user_id", userId)
        .order("log_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1);

      const first = firstWeightRows?.[0] || null;

      // Monta lista com variações individuais
      const historyWithDiff = weights.map((w, idx) => {
        const nextInList = weights[idx + 1];
        const diff = nextInList ? Math.round((Number(w.weight_kg) - Number(nextInList.weight_kg)) * 10) / 10 : null;
        return {
          log_date: w.log_date,
          weight_kg: Number(w.weight_kg),
          diff_vs_previous: diff,
        };
      });

      let msg = `⚖️ **Seu Histórico de Peso:${sinceDate ? ` (desde ${sinceDate})` : ""}**\n\n• Peso atual: **${Number(latest.weight_kg).toFixed(1)} kg** (em ${latest.log_date})\n`;
      if (prev) {
        const diff = Math.round((Number(latest.weight_kg) - Number(prev.weight_kg)) * 10) / 10;
        const sig = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
        msg += `• Pesagem anterior: **${Number(prev.weight_kg).toFixed(1)} kg** (${prev.log_date}) -> **${sig} kg**\n`;
      }
      if (first && first.log_date !== latest.log_date) {
        const totalDiff = Math.round((Number(latest.weight_kg) - Number(first.weight_kg)) * 10) / 10;
        const totalSig = totalDiff > 0 ? `+${totalDiff.toFixed(1)}` : totalDiff.toFixed(1);
        msg += `• Evolução total desde o início (${first.log_date}): **${totalSig} kg**\n`;
      }

      return {
        success: true,
        current_weight_kg: Number(latest.weight_kg),
        current_date: latest.log_date,
        history: historyWithDiff,
        message: msg,
      };
    }

    // 18. AÇÃO: REGISTRAR PASSOS ("Hermes, dei 8500 passos hoje")
    if (data.action === "log_steps") {
      const rawSteps = data.payload.steps ?? data.payload.count;
      const stepsNum = Math.round(Number(rawSteps));
      if (isNaN(stepsNum) || stepsNum < 0) {
        return {
          success: false,
          error: "Quantidade de passos inválida. Informe um valor numérico positivo (ex: 8500).",
        };
      }

      const targetDate = data.payload.date ? String(data.payload.date) : getLocalDate();

      // Peso recente para calcular gasto calórico ativo
      const { data: wRows } = await supabase
        .from("body_weights")
        .select("weight_kg")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .limit(1);
      const weightKg = wRows?.[0]?.weight_kg ? Number(wRows[0].weight_kg) : 75;

      const activeCalories =
        data.payload.active_calories != null
          ? Math.round(Number(data.payload.active_calories))
          : estimateActiveCaloriesFromSteps(stepsNum, weightKg);

      const distanceMeters =
        data.payload.distance_meters != null
          ? Math.round(Number(data.payload.distance_meters))
          : Math.round(stepsNum * 0.75);

      const { error: upsertErr } = await supabase.from("daily_steps_logs").upsert(
        {
          user_id: userId,
          log_date: targetDate,
          steps: stepsNum,
          active_calories: activeCalories,
          source: "telegram_hermes",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,log_date" }
      );

      if (upsertErr) {
        console.error("[Hermes] Erro ao salvar daily_steps_logs:", upsertErr);
        return { success: false, error: "Falha ao gravar os passos no banco de dados." };
      }

      const distKm = (distanceMeters / 1000).toFixed(1).replace(".", ",");
      const msg =
        `👟 **Passos Registrados com Sucesso!**\n\n` +
        `• Passos: **${stepsNum.toLocaleString("pt-BR")}** (${targetDate === getLocalDate() ? "Hoje" : targetDate})\n` +
        `• Calorias ativas estimadas: **~${activeCalories} kcal**\n` +
        `• Distância aproximada: **~${distKm} km**\n\n` +
        `O card de passos do FitWell Hub foi atualizado! 🎯`;

      return {
        success: true,
        steps: stepsNum,
        active_calories: activeCalories,
        distance_meters: distanceMeters,
        date: targetDate,
        message: msg,
      };
    }

    // 19. AÇÃO: CONSULTAR PASSOS ("Hermes, quantos passos dei hoje?")
    if (data.action === "get_steps") {
      const targetDate = data.payload.date ? String(data.payload.date) : getLocalDate();

      const { data: stepLog } = await supabase
        .from("daily_steps_logs")
        .select("steps, active_calories, source, updated_at")
        .eq("user_id", userId)
        .eq("log_date", targetDate)
        .maybeSingle();

      if (!stepLog || stepLog.steps == null) {
        return {
          success: true,
          date: targetDate,
          steps: 0,
          active_calories: 0,
          distance_meters: 0,
          message: `👟 Nenhum passo registrado no FitWell Hub para ${targetDate === getLocalDate() ? "hoje" : targetDate}.`,
        };
      }

      const stepsNum = Number(stepLog.steps);
      const activeCal = Number(stepLog.active_calories || 0);
      const distanceMeters = Math.round(stepsNum * 0.75);
      const distKm = (distanceMeters / 1000).toFixed(1).replace(".", ",");

      const msg =
        `👟 **Passos de ${targetDate === getLocalDate() ? "Hoje" : targetDate}:**\n\n` +
        `• Total: **${stepsNum.toLocaleString("pt-BR")} passos**\n` +
        `• Gasto ativo: **~${activeCal} kcal**\n` +
        `• Distância: **~${distKm} km**\n` +
        `• Origem: ${stepLog.source === "telegram_hermes" ? "Hermes (Telegram)" : stepLog.source === "google_fit" ? "Samsung Watch / Google Fit" : "Manual"}`;

      return {
        success: true,
        date: targetDate,
        steps: stepsNum,
        active_calories: activeCal,
        distance_meters: distanceMeters,
        source: stepLog.source,
        message: msg,
      };
    }

    // 20. AÇÃO: CONSULTAR PERFIL, METABOLISMO (TMB / TDEE) E METAS ("get_profile")
    if (data.action === "get_profile") {
      // 1. Perfil
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, sex, height_cm, birth_date")
        .eq("id", userId)
        .single();

      // 2. Último peso
      const { data: weightRows } = await supabase
        .from("body_weights")
        .select("weight_kg, log_date")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .limit(1);

      const latestWeight = weightRows?.[0] ? Number(weightRows[0].weight_kg) : null;
      const height = profile?.height_cm ? Number(profile.height_cm) : null;
      const sex = profile?.sex as "male" | "female" | null;
      const birthDate = profile?.birth_date || null;
      const age = birthDate ? calculateAge(birthDate) : null;

      // 3. Cálculo TMB (Mifflin-St Jeor)
      let bmr: number | null = null;
      if (latestWeight && height && age && sex) {
        if (sex === "male") {
          bmr = Math.round(10 * latestWeight + 6.25 * height - 5 * age + 5);
        } else {
          bmr = Math.round(10 * latestWeight + 6.25 * height - 5 * age - 161);
        }
      }

      // 4. Sessões de treino nos últimos 28 dias
      const twentyEightDaysAgo = getLocalDateMinusDays(28);
      const { data: recentWorkouts } = await supabase
        .from("workout_sessions")
        .select("id")
        .eq("user_id", userId)
        .gte("completed_at", twentyEightDaysAgo + "T00:00:00");

      const totalWorkouts = recentWorkouts?.length || 0;
      const sessionsPerWeek = Math.round((totalWorkouts / 4) * 10) / 10;

      let activityFactor = 1.2;
      let activityLabel = "Sedentário (< 1 treino/sem)";
      if (sessionsPerWeek >= 1 && sessionsPerWeek < 3) {
        activityFactor = 1.375;
        activityLabel = "Levemente Ativo (1 a 2,9 treinos/sem)";
      } else if (sessionsPerWeek >= 3 && sessionsPerWeek < 5) {
        activityFactor = 1.55;
        activityLabel = "Moderadamente Ativo (3 a 4,9 treinos/sem)";
      } else if (sessionsPerWeek >= 5) {
        activityFactor = 1.725;
        activityLabel = "Muito Ativo (≥ 5 treinos/sem)";
      }

      const tdee = bmr ? Math.round(bmr * activityFactor) : null;

      // 5. Metas
      const { data: userGoals } = await supabase
        .from("goals")
        .select("calories, protein_g, carbs_g, fat_g, water_ml, goal_auto")
        .eq("user_id", userId)
        .maybeSingle();

      let msg = `👤 **Perfil & Metabolismo no FitWell Hub:**\n\n`;
      msg += `• Nome: ${profile?.full_name || "Usuário"}\n`;
      msg += `• Sexo: ${sex === "male" ? "Masculino" : sex === "female" ? "Feminino" : "Não informado"}\n`;
      msg += `• Idade: ${age ? `${age} anos` : "Não informada"} ${birthDate ? `(${birthDate})` : ""}\n`;
      msg += `• Altura: ${height ? `${height} cm` : "Não informada"}\n`;
      msg += `• Peso atual: ${latestWeight ? `${latestWeight} kg` : "Não informado"}\n\n`;

      if (bmr && tdee) {
        msg += `🔥 **Taxa Metabólica Basal (TMB - Mifflin-St Jeor):** ~${bmr} kcal/dia\n`;
        msg += `⚡ **Fator de Atividade:** ${activityFactor.toFixed(3)} (${activityLabel})\n`;
        msg += `🏋️‍♂️ **Frequência de treinos:** ${totalWorkouts} treinos nos últimos 28 dias (~${sessionsPerWeek} treinos/semana)\n`;
        msg += `🎯 **Gasto Energético Diário (TDEE):** ~${tdee} kcal/dia\n\n`;
      }

      if (userGoals) {
        msg += `🥗 **Metas Diárias Atuais:**\n`;
        msg += `• Calorias: ${userGoals.calories} kcal ${userGoals.goal_auto ? "(Auto-ajustável pelo TDEE)" : "(Personalizada)"}\n`;
        msg += `• Proteínas: ${userGoals.protein_g}g | Carbos: ${userGoals.carbs_g}g | Gorduras: ${userGoals.fat_g}g\n`;
        msg += `• Água: ${userGoals.water_ml} ml\n`;
      }

      return {
        success: true,
        profile: {
          full_name: profile?.full_name || null,
          display_name: profile?.full_name || null,
          sex,
          height_cm: height,
          birth_date: birthDate,
          age,
          weight_kg: latestWeight,
        },
        metabolism: {
          bmr,
          activity_factor: activityFactor,
          activity_label: activityLabel,
          sessions_per_week: sessionsPerWeek,
          total_workouts_last_28_days: totalWorkouts,
          tdee,
        },
        goals: userGoals || null,
        message: msg,
      };
    }

    // 21. AÇÃO: CONSULTAR BIOIMPEDÂNCIA ("Hermes, como está minha bioimpedância?")
    if (data.action === "get_bioimpedance") {
      const limit = Math.min(100, Math.max(1, Number(data.payload.limit) || 10));
      const sinceDate = data.payload.since ? String(data.payload.since).trim() : null;

      let query = supabase
        .from("bioimpedance_logs")
        .select("id, log_date, weight_kg, body_fat_pct, muscle_mass_kg, bone_mass_kg, body_water_pct, visceral_fat, bmr_machine, metabolic_age, notes, created_at")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (sinceDate) {
        query = query.gte("log_date", sinceDate);
      }

      const { data: logs, error: logsErr } = await query.limit(limit);

      if (logsErr) {
        console.error("[Hermes] Erro ao buscar bioimpedance_logs:", logsErr);
        return { success: false, error: `Erro ao consultar bioimpedância: ${logsErr.message}` };
      }

      if (!logs || logs.length === 0) {
        return {
          success: true,
          current: null,
          history: [],
          message: "🔬 Nenhum registro de bioimpedância encontrado no FitWell Hub.",
        };
      }

      const formatLogItem = (item: any) => {
        const weight = item.weight_kg != null ? Number(item.weight_kg) : null;
        const muscleKg = item.muscle_mass_kg != null ? Number(item.muscle_mass_kg) : null;
        const fatPct = item.body_fat_pct != null ? Number(item.body_fat_pct) : null;
        const musclePct = weight && muscleKg ? Math.round((muscleKg / weight) * 1000) / 10 : null;
        const waterPct = item.body_water_pct != null ? Number(item.body_water_pct) : null;
        const boneKg = item.bone_mass_kg != null ? Number(item.bone_mass_kg) : null;
        const visceral = item.visceral_fat != null ? Number(item.visceral_fat) : null;
        const bmr = item.bmr_machine != null ? Number(item.bmr_machine) : null;
        const metabolicAge = item.metabolic_age != null ? Number(item.metabolic_age) : null;

        return {
          id: item.id,
          log_date: item.log_date,
          weight_kg: weight,
          body_fat_pct: fatPct,
          muscle_mass_kg: muscleKg,
          muscle_mass_pct: musclePct,
          visceral_fat: visceral,
          metabolic_age: metabolicAge,
          body_water_pct: waterPct,
          bone_mass_kg: boneKg,
          bmr_machine: bmr,
          notes: item.notes || null,
        };
      };

      const history = logs.map(formatLogItem);
      const current = history[0];
      const prev = history[1] || null;

      let msg = `🔬 **Bioimpedância no FitWell Hub:**\n📅 Data: **${current.log_date}**\n\n`;
      if (current.weight_kg != null) msg += `• Peso: **${current.weight_kg.toFixed(1)} kg**\n`;
      if (current.body_fat_pct != null) {
        let diffFat = "";
        if (prev?.body_fat_pct != null) {
          const d = Math.round((current.body_fat_pct - prev.body_fat_pct) * 10) / 10;
          if (Math.abs(d) >= 0.1) {
            const sig = d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
            diffFat = ` (${sig}% vs ${prev.log_date})`;
          }
        }
        msg += `• Gordura Corporal: **${current.body_fat_pct.toFixed(1)}%**${diffFat}\n`;
      }
      if (current.muscle_mass_kg != null) {
        let diffMus = "";
        if (prev?.muscle_mass_kg != null) {
          const d = Math.round((current.muscle_mass_kg - prev.muscle_mass_kg) * 10) / 10;
          if (Math.abs(d) >= 0.1) {
            const sig = d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
            diffMus = ` (${sig} kg vs ${prev.log_date})`;
          }
        }
        const pctInfo = current.muscle_mass_pct != null ? ` (~${current.muscle_mass_pct.toFixed(1)}%)` : "";
        msg += `• Massa Muscular: **${current.muscle_mass_kg.toFixed(1)} kg**${pctInfo}${diffMus}\n`;
      }
      if (current.visceral_fat != null) msg += `• Gordura Visceral: **Nível ${current.visceral_fat}**\n`;
      if (current.metabolic_age != null) msg += `• Idade Metabólica: **${current.metabolic_age} anos**\n`;
      if (current.body_water_pct != null) msg += `• Água Corporal: **${current.body_water_pct.toFixed(1)}%**\n`;
      if (current.bone_mass_kg != null) msg += `• Massa Óssea: **${current.bone_mass_kg.toFixed(1)} kg**\n`;
      if (current.bmr_machine != null) msg += `• TMB (Máquina): **~${current.bmr_machine} kcal**\n`;
      if (current.notes) msg += `• Notas: *${current.notes}*\n`;

      return {
        success: true,
        current,
        history,
        message: msg,
      };
    }

    // 22. AÇÃO: REGISTRAR BIOIMPEDÂNCIA ("Hermes, anota meu exame de bioimpedância")
    if (data.action === "log_bioimpedance") {
      const targetDate = data.payload.log_date || data.payload.date ? String(data.payload.log_date || data.payload.date) : getLocalDate();

      const parseNum = (v: any) => {
        if (v == null || v === "") return null;
        const n = Number(String(v).replace(",", "."));
        return isNaN(n) ? null : n;
      };

      let weightVal = parseNum(data.payload.weight_kg ?? data.payload.weight ?? data.payload.kg);
      let fatVal = parseNum(data.payload.body_fat_pct ?? data.payload.fat_pct ?? data.payload.body_fat ?? data.payload.gordura);
      let muscleVal = parseNum(data.payload.muscle_mass_kg ?? data.payload.muscle_kg ?? data.payload.muscle ?? data.payload.massa_muscular);
      const musclePctVal = parseNum(data.payload.muscle_mass_pct ?? data.payload.muscle_pct);
      let boneVal = parseNum(data.payload.bone_mass_kg ?? data.payload.bone_kg ?? data.payload.bone ?? data.payload.massa_ossea);
      let waterVal = parseNum(data.payload.body_water_pct ?? data.payload.water_pct ?? data.payload.water ?? data.payload.agua);
      let visceralVal = parseNum(data.payload.visceral_fat ?? data.payload.visceral ?? data.payload.gordura_visceral);
      let bmrVal = parseNum(data.payload.bmr_machine ?? data.payload.bmr ?? data.payload.tmb);
      let ageVal = parseNum(data.payload.metabolic_age ?? data.payload.idade_metabolica);
      let notesVal = data.payload.notes ? String(data.payload.notes).trim() : null;

      // Parsing de texto livre se fornecido
      const rawText = data.payload.raw_text ? String(data.payload.raw_text) : "";
      if (rawText) {
        if (weightVal == null) {
          const matchWeight = /(?:peso|pesei|pesando|balan[çc]a)?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:kg|quilos)?/i.exec(rawText);
          if (matchWeight && matchWeight[1]) weightVal = parseFloat(matchWeight[1].replace(",", "."));
        }
        if (fatVal == null) {
          const matchFat = /(?:gordura|bf|fat|gordura corporal)\s*(?:de|em)?\s*([0-9]+(?:[.,][0-9]+)?)\s*%/i.exec(rawText);
          if (matchFat && matchFat[1]) fatVal = parseFloat(matchFat[1].replace(",", "."));
        }
        if (muscleVal == null) {
          const matchMus = /(?:m[úu]sculo|massa muscular)\s*(?:de|em)?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:kg|quilos)/i.exec(rawText);
          if (matchMus && matchMus[1]) muscleVal = parseFloat(matchMus[1].replace(",", "."));
        }
        if (visceralVal == null) {
          const matchVis = /(?:visceral|gordura visceral)\s*(?:de|em|n[íi]vel)?\s*([0-9]+)/i.exec(rawText);
          if (matchVis && matchVis[1]) visceralVal = parseInt(matchVis[1], 10);
        }
        if (ageVal == null) {
          const matchAge = /(?:idade metab[óo]lica)\s*(?:de|em)?\s*([0-9]+)\s*(?:anos)?/i.exec(rawText);
          if (matchAge && matchAge[1]) ageVal = parseInt(matchAge[1], 10);
        }
      }

      // Se forneceu apenas porcentagem de massa muscular e o peso corporal, calcula kg
      if (muscleVal == null && musclePctVal != null && weightVal != null) {
        muscleVal = Math.round((musclePctVal / 100) * weightVal * 10) / 10;
      }

      // Arredondamentos
      if (weightVal != null) weightVal = Math.round(weightVal * 10) / 10;
      if (fatVal != null) fatVal = Math.round(fatVal * 10) / 10;
      if (muscleVal != null) muscleVal = Math.round(muscleVal * 10) / 10;
      if (boneVal != null) boneVal = Math.round(boneVal * 10) / 10;
      if (waterVal != null) waterVal = Math.round(waterVal * 10) / 10;
      if (visceralVal != null) visceralVal = Math.round(visceralVal);
      if (bmrVal != null) bmrVal = Math.round(bmrVal);
      if (ageVal != null) ageVal = Math.round(ageVal);

      // Validação de sanidade
      if (weightVal == null && fatVal == null && muscleVal == null && visceralVal == null && waterVal == null && ageVal == null) {
        return {
          success: false,
          error: "Nenhum dado válido de bioimpedância informado. Envie pelo menos peso, % de gordura ou massa muscular.",
        };
      }

      // Busca bioimpedância anterior em outra data para calcular variações reais
      const { data: prevList } = await supabase
        .from("bioimpedance_logs")
        .select("log_date, weight_kg, body_fat_pct, muscle_mass_kg, visceral_fat, metabolic_age")
        .eq("user_id", userId)
        .neq("log_date", targetDate)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      const prev = prevList?.[0] || null;

      // Verifica se já existe registro na mesma data para atualizar em vez de duplicar
      const { data: existing } = await supabase
        .from("bioimpedance_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("log_date", targetDate)
        .limit(1);

      let isUpdate = false;
      let recordId = "";

      if (existing && existing.length > 0) {
        isUpdate = true;
        recordId = existing[0].id;
        const updatePayload: Record<string, any> = {};
        if (weightVal != null) updatePayload.weight_kg = weightVal;
        if (fatVal != null) updatePayload.body_fat_pct = fatVal;
        if (muscleVal != null) updatePayload.muscle_mass_kg = muscleVal;
        if (boneVal != null) updatePayload.bone_mass_kg = boneVal;
        if (waterVal != null) updatePayload.body_water_pct = waterVal;
        if (visceralVal != null) updatePayload.visceral_fat = visceralVal;
        if (bmrVal != null) updatePayload.bmr_machine = bmrVal;
        if (ageVal != null) updatePayload.metabolic_age = ageVal;
        if (notesVal != null) updatePayload.notes = notesVal;

        const { error: updErr } = await supabase
          .from("bioimpedance_logs")
          .update(updatePayload)
          .eq("id", recordId);

        if (updErr) {
          console.error("[Hermes] Erro ao atualizar bioimpedance_logs:", updErr);
          return { success: false, error: `Falha ao atualizar bioimpedância: ${updErr.message}` };
        }
      } else {
        const { data: insData, error: insErr } = await supabase
          .from("bioimpedance_logs")
          .insert({
            user_id: userId,
            log_date: targetDate,
            weight_kg: weightVal,
            body_fat_pct: fatVal,
            muscle_mass_kg: muscleVal,
            bone_mass_kg: boneVal,
            body_water_pct: waterVal,
            visceral_fat: visceralVal,
            bmr_machine: bmrVal,
            metabolic_age: ageVal,
            notes: notesVal,
          })
          .select("id")
          .single();

        if (insErr) {
          console.error("[Hermes] Erro ao inserir bioimpedance_logs:", insErr);
          return { success: false, error: `Falha ao gravar bioimpedância: ${insErr.message}` };
        }
        recordId = insData?.id || "";
      }

      // Sincroniza peso em body_weights se informado (regra do FitWell Hub)
      if (weightVal != null) {
        const { data: existingWeight } = await supabase
          .from("body_weights")
          .select("id")
          .eq("user_id", userId)
          .eq("log_date", targetDate)
          .limit(1);

        if (existingWeight && existingWeight.length > 0) {
          await supabase
            .from("body_weights")
            .update({ weight_kg: weightVal })
            .eq("id", existingWeight[0].id);
        } else {
          await supabase.from("body_weights").insert({
            user_id: userId,
            log_date: targetDate,
            weight_kg: weightVal,
          });
        }

        await supabase
          .from("profiles")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", userId);
      }

      // Monta mensagem de retorno com variações
      const tag = isUpdate ? " *(atualizado)*" : "";
      let msg = `🔬 **Bioimpedância Registrada com Sucesso!**${tag}\n📅 Data: **${targetDate}**\n\n`;

      if (weightVal != null) {
        let diffStr = "";
        if (prev?.weight_kg != null) {
          const d = Math.round((weightVal - Number(prev.weight_kg)) * 10) / 10;
          if (Math.abs(d) >= 0.1) {
            const sig = d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
            diffStr = ` (${sig} kg vs ${prev.log_date})`;
          }
        }
        msg += `• Peso: **${weightVal.toFixed(1)} kg**${diffStr}\n`;
      }

      if (fatVal != null) {
        let diffStr = "";
        if (prev?.body_fat_pct != null) {
          const d = Math.round((fatVal - Number(prev.body_fat_pct)) * 10) / 10;
          if (Math.abs(d) >= 0.1) {
            const sig = d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
            diffStr = ` (${sig}% vs ${prev.log_date})`;
          }
        }
        msg += `• Gordura Corporal: **${fatVal.toFixed(1)}%**${diffStr}\n`;
      }

      if (muscleVal != null) {
        let diffStr = "";
        if (prev?.muscle_mass_kg != null) {
          const d = Math.round((muscleVal - Number(prev.muscle_mass_kg)) * 10) / 10;
          if (Math.abs(d) >= 0.1) {
            const sig = d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
            diffStr = ` (${sig} kg vs ${prev.log_date})`;
          }
        }
        const pctInfo = weightVal ? ` (~${((muscleVal / weightVal) * 100).toFixed(1)}%)` : "";
        msg += `• Massa Muscular: **${muscleVal.toFixed(1)} kg**${pctInfo}${diffStr}\n`;
      }

      if (visceralVal != null) msg += `• Gordura Visceral: **Nível ${visceralVal}**\n`;
      if (ageVal != null) msg += `• Idade Metabólica: **${ageVal} anos**\n`;
      if (waterVal != null) msg += `• Água Corporal: **${waterVal.toFixed(1)}%**\n`;
      if (boneVal != null) msg += `• Massa Óssea: **${boneVal.toFixed(1)} kg**\n`;
      if (bmrVal != null) msg += `• TMB (Máquina): **~${bmrVal} kcal**\n`;
      if (notesVal) msg += `• Notas: *${notesVal}*\n`;

      msg += `\nSeu exame foi salvo e já está visível na tela Meu Corpo do FitWell Hub! 📊`;

      return {
        success: true,
        id: recordId,
        date: targetDate,
        updated: isUpdate,
        data: {
          weight_kg: weightVal,
          body_fat_pct: fatVal,
          muscle_mass_kg: muscleVal,
          muscle_mass_pct: weightVal && muscleVal ? Math.round((muscleVal / weightVal) * 1000) / 10 : null,
          bone_mass_kg: boneVal,
          body_water_pct: waterVal,
          visceral_fat: visceralVal,
          bmr_machine: bmrVal,
          metabolic_age: ageVal,
          notes: notesVal,
        },
        message: msg,
      };
    }

    // 23. AÇÃO: CONSULTAR DETALHES DE SESSÕES DE TREINO ("Hermes, quais foram as cargas do meu treino de hoje?")
    if (data.action === "get_workout_session") {
      const routineNameQuery = data.payload.routine_name || data.payload.workout || data.payload.name
        ? String(data.payload.routine_name || data.payload.workout || data.payload.name).trim()
        : null;
      const targetDate = data.payload.date ? String(data.payload.date).trim() : null;
      const sessionId = data.payload.session_id ? String(data.payload.session_id).trim() : null;
      const limit = Math.min(20, Math.max(1, Number(data.payload.limit) || 1));

      let query = supabase
        .from("workout_sessions")
        .select("id, name, completed_at, notes")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false });

      if (sessionId) {
        query = query.eq("id", sessionId);
      } else if (targetDate) {
        const [ty, tm, td] = targetDate.split("-").map(Number);
        const startMs = Date.UTC(ty, tm - 1, td, 3, 0, 0, 0);
        query = query
          .gte("completed_at", new Date(startMs).toISOString())
          .lte("completed_at", new Date(startMs + 86400000 - 1).toISOString());
      }

      if (routineNameQuery) {
        const clean = routineNameQuery.toLowerCase().replace(/^treino\s+/i, "").trim();
        query = query.or(`name.ilike.%${clean}%,name.ilike.%${routineNameQuery}%`);
      }

      const { data: sessions, error: sessErr } = await query.limit(limit);

      if (sessErr) {
        console.error("[Hermes] Erro ao buscar workout_sessions:", sessErr);
        return { success: false, error: `Erro ao consultar sessões de treino: ${sessErr.message}` };
      }

      if (!sessions || sessions.length === 0) {
        const filterMsg = targetDate ? ` em ${targetDate}` : routineNameQuery ? ` para "${routineNameQuery}"` : "";
        return {
          success: true,
          sessions: [],
          current: null,
          message: `🏋️‍♂️ Nenhuma sessão de treino encontrada${filterMsg}.`,
        };
      }

      const sessionIds = sessions.map((s) => s.id);
      const { data: setsData } = await supabase
        .from("workout_session_sets")
        .select("session_id, exercise_name, set_number, reps, weight_kg, completed")
        .in("session_id", sessionIds)
        .order("set_number", { ascending: true });

      const setsBySession: Record<string, any[]> = {};
      (setsData || []).forEach((st) => {
        if (!setsBySession[st.session_id]) setsBySession[st.session_id] = [];
        setsBySession[st.session_id].push(st);
      });

      const structuredSessions = sessions.map((s) => {
        const sSets = setsBySession[s.id] || [];
        const exMap = new Map<string, any[]>();
        sSets.forEach((st) => {
          if (!exMap.has(st.exercise_name)) exMap.set(st.exercise_name, []);
          exMap.get(st.exercise_name)!.push(st);
        });

        let totalVol = 0;
        const exercises = Array.from(exMap.entries()).map(([exName, stList]) => {
          const isCardio = isCardioExercise(exName);
          let maxW = 0;
          let exVol = 0;
          stList.forEach((st) => {
            const weight = Number(st.weight_kg) || 0;
            const reps = Number(st.reps) || 0;
            if (weight > maxW) maxW = weight;
            if (!isCardio && st.completed) exVol += weight * reps;
          });
          totalVol += exVol;

          let setsSummary = "";
          if (isCardio) {
            const totalMins = stList.reduce((acc, st) => acc + (Number(st.reps) || 0), 0);
            const topSpeed = Math.max(...stList.map((st) => Number(st.weight_kg) || 0), 0);
            setsSummary = `${totalMins} min${topSpeed > 0 ? ` @ ${topSpeed} km/h` : ""}`;
          } else {
            const parts = stList.map((st) => `${st.reps}x ${Number(st.weight_kg) || 0}kg`);
            setsSummary = parts.join(", ");
          }

          return {
            name: exName,
            is_cardio: isCardio,
            sets_count: stList.length,
            max_weight_kg: maxW,
            total_volume_kg: exVol,
            sets_summary: setsSummary,
            sets: stList.map((st) => ({
              set_number: st.set_number,
              reps: st.reps,
              weight_kg: Number(st.weight_kg) || 0,
              completed: st.completed,
            })),
          };
        });

        const completedDate = s.completed_at ? s.completed_at.slice(0, 10) : null;
        const completedTimeBrt = s.completed_at
          ? new Date(s.completed_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
          : null;

        return {
          id: s.id,
          name: s.name,
          completed_at: s.completed_at,
          completed_date: completedDate,
          completed_time_brt: completedTimeBrt,
          notes: s.notes || null,
          total_volume_kg: totalVol,
          exercises_count: exercises.length,
          exercises,
        };
      });

      let msg = `🏋️‍♂️ **Detalhes de Treino Realizado:**\n\n`;
      structuredSessions.forEach((s) => {
        const timeTag = s.completed_time_brt ? ` às ${s.completed_time_brt}` : "";
        msg += `📋 **${s.name}** (${s.completed_date}${timeTag})\n`;
        if (s.notes) msg += `*Anotações: ${s.notes}*\n`;
        if (s.exercises.length === 0) {
          msg += `*(sem exercícios detalhados)*\n\n`;
        } else {
          s.exercises.forEach((ex) => {
            const icon = ex.is_cardio ? "🏃" : "💪";
            msg += `• ${icon} **${ex.name}**: ${ex.sets_summary}\n`;
          });
          if (s.total_volume_kg > 0) {
            msg += `📊 Volume Total: **${s.total_volume_kg.toLocaleString("pt-BR")} kg**\n`;
          }
          msg += `\n`;
        }
      });

      return {
        success: true,
        count: structuredSessions.length,
        current: structuredSessions[0] || null,
        sessions: structuredSessions,
        message: msg.trim(),
      };
    }

    return { success: false, error: "Ação não reconhecida." };
  });
