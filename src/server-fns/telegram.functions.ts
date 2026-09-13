import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getLocalDate } from "@/lib/utils";
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

const hermesActionSchema = z.object({
  secretKey: z.string().optional(),
  telegramChatId: z.union([z.string(), z.number()]),
  telegramUsername: z.string().optional(),
  action: z.enum(["pair", "complete_workout", "duplicate_workout", "create_workout", "log_voice", "status"]),
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

      // Busca todos os treinos do usuário para encontrar a melhor correspondência
      const { data: userWorkouts } = await supabase
        .from("workouts")
        .select("id, name")
        .eq("user_id", userId);

      if (!userWorkouts || userWorkouts.length === 0) {
        return {
          success: false,
          error: "Você não possui nenhuma ficha de treino cadastrada no FitWell Hub.",
        };
      }

      // Algoritmo de correspondência de nome (ex: "A" -> "Treino A", "peito" -> "Treino A - Peito")
      let matchedWorkout = userWorkouts.find(
        (w) => w.name.toLowerCase() === routineNameQuery.toLowerCase()
      );

      if (!matchedWorkout && routineNameQuery) {
        matchedWorkout = userWorkouts.find((w) =>
          w.name.toLowerCase().includes(routineNameQuery.toLowerCase())
        );
      }

      // Se o usuário só falou "A", procurar por "Treino A" ou começar com "A"
      if (!matchedWorkout && routineNameQuery.length === 1) {
        matchedWorkout = userWorkouts.find((w) =>
          new RegExp(`\\b${routineNameQuery}\\b`, "i").test(w.name)
        );
      }

      // Se ainda não encontrou e o usuário não especificou, tenta pegar o primeiro ou pedir desambiguação
      if (!matchedWorkout) {
        const availableNames = userWorkouts.map((w) => `• ${w.name}`).join("\n");
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

      // Busca os treinos do usuário para encontrar a ficha modelo
      const { data: userWorkouts } = await supabase
        .from("workouts")
        .select("id, name, notes")
        .eq("user_id", userId);

      if (!userWorkouts || userWorkouts.length === 0) {
        return {
          success: false,
          error: "Você não possui nenhuma ficha de treino cadastrada no FitWell Hub para duplicar.",
        };
      }

      // Procura correspondência do nome (ex: "A", "Treino A", "Costas")
      let sourceWorkout = userWorkouts.find(
        (w) => w.name.toLowerCase() === routineNameQuery.toLowerCase()
      );

      if (!sourceWorkout && routineNameQuery) {
        sourceWorkout = userWorkouts.find((w) =>
          w.name.toLowerCase().includes(routineNameQuery.toLowerCase())
        );
      }

      if (!sourceWorkout && routineNameQuery.length === 1) {
        sourceWorkout = userWorkouts.find((w) =>
          new RegExp(`\\b${routineNameQuery}\\b`, "i").test(w.name)
        );
      }

      if (!sourceWorkout) {
        const names = userWorkouts.map((w) => `• ${w.name}`).join("\n");
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

    return { success: false, error: "Ação não reconhecida." };
  });
