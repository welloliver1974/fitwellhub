import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getLocalDate, todayBoundsSaoPaulo } from "@/lib/utils";
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
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Client Supabase admin/service ou com chave de publicação para chamadas do webhook
function getSupabaseServiceClient() {
  const url =
    process.env.SUPABASE_URL || "https://haavrgglnfbchiygspqw.supabase.co";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_Ad2aSiOJKf_53pnMCLhc6A_JkX1vvJ2";

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
    "search_food",
    "update_meal_item",
    "delete_meal_item",
    "delete_meal",
    "adjust_water",
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
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();

      const { data: workouts } = await supabase
        .from("workouts")
        .select("id, name")
        .eq("user_id", userId)
        .order("name");

      return {
        success: true,
        userName: profile?.display_name || "Atleta",
        workouts: (workouts || []).map((w) => w.name),
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
      let mealType = data.payload.meal_type as "Café da manhã" | "Almoço" | "Jantar" | "Lanche" | undefined;
      const targetDate = data.payload.meal_date ? String(data.payload.meal_date) : getLocalDate();
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
                    "Você é um nutricionista esportivo. Analise o relato falado do usuário e identifique: consumo de água (em ml), tipo da refeição (Café da manhã, Almoço, Jantar, Lanche) e cada alimento com sua porção em gramas estimada. Retorne APENAS via chamada da função record_voice_intake.",
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
                    description: "Extrai água, refeição e lista de alimentos de um relato",
                    parameters: {
                      type: "object",
                      properties: {
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

        return {
          success: true,
          water_ml: waterMl,
          total_water_today: totalWaterToday,
          message: `💧 **+${waterMl}ml de água** registrados com sucesso no FitWell Hub!\n\nTotal de hoje: **${totalWaterToday}ml** hidratados. Continue assim! 🥤`,
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
      let replyMsg = `🍽️ **${finalMealType} registrado no FitWell Hub!**\n\n`;
      resolvedItems.forEach((ri) => {
        replyMsg += `• **${ri.name}** (${ri.grams}g): ${ri.calories} kcal | ${ri.protein_g}g P | ${ri.carbs_g}g C | ${ri.fat_g}g G\n`;
      });

      if (waterMl > 0) {
        replyMsg += `💧 **+${waterMl}ml de água** (${totalWaterToday}ml acumulados hoje)\n`;
      }

      replyMsg += `\n📊 **Total da Refeição:** ${mealKcal} kcal | ${mealP}g P | ${mealC}g C | ${mealF}g G\n`;
      replyMsg += `🎯 **Progresso de Hoje:** ${Math.round(dayKcal)}/${goalKcal} kcal (${kcalPercent}%) • ${dayP}/${goalP}g Proteína (${proteinPercent}%)\n`;
      if (proteinPercent >= 100) {
        replyMsg += `🔥 Parabéns! Você bateu a meta de proteínas do dia! 🚀`;
      } else {
        const remainingP = Math.max(0, Math.round(goalP - dayP));
        replyMsg += `Faltam ${remainingP}g de proteína para completar sua meta diária.`;
      }

      return {
        success: true,
        mealType: finalMealType,
        items: resolvedItems,
        mealTotals: { calories: mealKcal, protein_g: mealP, carbs_g: mealC, fat_g: mealF },
        dayTotals: { calories: Math.round(dayKcal), protein_g: dayP, carbs_g: dayC, fat_g: dayF },
        water_ml: waterMl,
        total_water_today: totalWaterToday,
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
      const rawMealType = String(data.payload.meal_type || data.payload.type || "").trim();
      const targetDate = data.payload.meal_date ? String(data.payload.meal_date) : getLocalDate();

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

      if (!mealsToDelete || mealsToDelete.length === 0) {
        return { success: false, error: `Nenhuma refeição "${rawMealType}" encontrada para hoje (${targetDate}).` };
      }

      const mealIds = mealsToDelete.map((m) => m.id);
      await supabase.from("meal_items").delete().in("meal_id", mealIds);
      await supabase.from("meals").delete().in("id", mealIds);

      return {
        success: true,
        deletedMeal: mealsToDelete[0].meal_type,
        message: `🗑️ Refeição **${mealsToDelete[0].meal_type}** e todos os seus alimentos foram excluídos com sucesso do seu diário de hoje!`,
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

    return { success: false, error: "Ação não reconhecida." };
  });
