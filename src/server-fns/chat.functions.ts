import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  callAiChatCompletion,
  fetchAiSettings,
  getTextModel,
  resolveAiApiKey,
  resolveAiProvider,
} from "@/server-fns/ai-settings.functions";

const inputSchema = z.object({
  message: z.string().trim().max(2000).optional().default(""),
  images: z.array(z.string()).optional(),
});

interface UserContext {
  ctxText: string;
  recentHistory: any[];
}

/**
 * Fetches relevant user information (goals, meals, water, weights, recent chat messages, body measurements, workout sessions) from Supabase.
 * Formats daily calorie totals, body measurements evolution, weight history, and recent workout sessions details.
 */
export async function fetchUserContext(
  supabase: any,
  userId: string,
  today: string,
  weekAgo: string
): Promise<UserContext> {
  const [
    { data: goals },
    { data: meals },
    { data: water },
    { data: weights },
    { data: history },
    { data: measurements },
    { data: workoutsData },
    ] = await Promise.all([
    supabase.from("goals").select("calories,protein_g,carbs_g,fat_g").eq("user_id", userId).maybeSingle(),
    supabase.from("meals").select("id,meal_date").eq("user_id", userId).gte("meal_date", weekAgo),
    supabase.from("water_logs").select("ml,log_date").eq("user_id", userId).gte("log_date", weekAgo),
    supabase.from("body_weights").select("weight_kg,log_date").eq("user_id", userId).order("log_date", { ascending: false }).limit(5),
    supabase.from("chat_messages").select("role,content").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    supabase.from("body_measurements").select("log_date, label, value_cm").eq("user_id", userId).order("log_date", { ascending: false }).limit(15),
    supabase
      .from("workout_sessions")
      .select(`
        id, 
        name, 
        completed_at,
        workout_session_sets (
          exercise_name, 
          reps, 
          weight_kg
        )
      `)
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(5),
  ]);

  // 1. Format Nutrition daily totals
  const ids = (meals ?? []).map((m: any) => m.id);
  const dailyTotals: Record<string, { kcal: number; p: number; c: number; f: number }> = {};
  if (ids.length) {
    const { data: items } = await supabase.from("meal_items").select("meal_id,calories,protein_g,carbs_g,fat_g").in("meal_id", ids);
    (items ?? []).forEach((i: any) => {
      const d = (meals ?? []).find((m: any) => m.id === i.meal_id)?.meal_date;
      if (!d) return;
      const cur = dailyTotals[d] ?? { kcal: 0, p: 0, c: 0, f: 0 };
      cur.kcal += Number(i.calories || 0); 
      cur.p += Number(i.protein_g || 0); 
      cur.c += Number(i.carbs_g || 0); 
      cur.f += Number(i.fat_g || 0);
      dailyTotals[d] = cur;
    });
  }

  const dailyTotalsText = Object.entries(dailyTotals)
    .map(([d, t]) => `${d}: ${Math.round(t.kcal)}kcal (P:${Math.round(t.p)}g, C:${Math.round(t.c)}g, G:${Math.round(t.f)}g)`)
    .join(", ");

  // 2. Format Body Weight history
  let weightsText = "Sem registros de peso recentes.";
  if (weights && weights.length > 0) {
    weightsText = weights.map((w: any) => `- ${w.weight_kg}kg em ${w.log_date}`).join("\n");
  }

  // 3. Format Body Measurements evolution
  let measurementsText = "Sem registros de medidas recentes.";
  if (measurements && measurements.length > 0) {
    const sortedMeasurements = [...measurements].reverse();
    const groups = new Map<string, any[]>();
    for (const m of sortedMeasurements) {
      if (!groups.has(m.label)) groups.set(m.label, []);
      groups.get(m.label)!.push(m);
    }
    
    const lines = [];
    for (const [label, entries] of groups.entries()) {
      if (entries.length === 1) {
        const item = entries[0];
        lines.push(`- ${label}: ${item.value_cm}cm (em ${item.log_date})`);
      } else {
        const first = entries[0];
        const last = entries[entries.length - 1];
        const diff = last.value_cm - first.value_cm;
        const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
        lines.push(`- ${label}: de ${first.value_cm}cm em ${first.log_date} para ${last.value_cm}cm em ${last.log_date} (Evolução: ${diffStr}cm)`);
      }
    }
    measurementsText = lines.join("\n");
  }

  // 4. Format Workout Sessions history
  let workoutsText = "Sem treinos concluídos recentemente.";
  if (workoutsData && workoutsData.length > 0) {
    const lines = [];
    for (const w of workoutsData) {
      const dateStr = w.completed_at ? new Date(w.completed_at).toISOString().slice(0, 10) : today;
      const sets = w.workout_session_sets ?? [];
      const exercisesMap = new Map<string, Array<{ reps: number; weight_kg: number }>>();
      for (const s of sets) {
        if (!exercisesMap.has(s.exercise_name)) exercisesMap.set(s.exercise_name, []);
        exercisesMap.get(s.exercise_name)!.push({ reps: Number(s.reps || 0), weight_kg: Number(s.weight_kg || 0) });
      }
      
      const exLines: string[] = [];
      for (const [exName, exSets] of exercisesMap.entries()) {
        const setsSummary = exSets.map(s => `${s.reps}reps c/ ${s.weight_kg}kg`).join(", ");
        exLines.push(`  * ${exName}: ${setsSummary}`);
      }
      
      lines.push(`- ${w.name} em ${dateStr}:\n${exLines.join("\n")}`);
    }
    workoutsText = lines.join("\n");
  }

  // 5. Generate integrated context string
  const ctxText = `Hoje: ${today}
Metas Diárias: Calórias: ${goals?.calories ?? 2000}kcal, Proteínas: ${goals?.protein_g ?? 140}g, Carboidratos: ${goals?.carbs_g ?? 220}g, Gorduras: ${goals?.fat_g ?? 65}g

Últimos 7 dias de nutrição:
${dailyTotalsText || "Nenhuma refeição registrada."}

Histórico recente de peso:
${weightsText}

Evolução de medidas corporais:
${measurementsText}

Últimos 5 treinos realizados:
${workoutsText}`;

  const recentHistory = (history ?? []).reverse();

  return { ctxText, recentHistory };
}

/**
 * Saves a chat message to the Supabase database.
 */
export async function saveChatMessage(
  supabase: any,
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await supabase.from("chat_messages").insert({ user_id: userId, role, content });
}

/**
 * Calls the Groq Chat Completions API with the given configuration.
 */
async function callGroqAPI(
  apiKey: string,
  model: string,
  messages: any[],
  tools: any[]
): Promise<any> {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${apiKey}`, 
      "Content-Type": "application/json" 
    },
    body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json();
}

/**
 * Executes the record_meal tool: inserts a new meal and its constituent items.
 */
export async function executeRecordMeal(
  supabase: any,
  userId: string,
  today: string,
  args: { meal_type: string; items: Array<{ name: string; calories?: string; protein_g?: string; carbs_g?: string; fat_g?: string }> }
): Promise<string> {
  const { data: meal, error: mealErr } = await supabase
    .from("meals")
    .insert({ user_id: userId, meal_type: args.meal_type, meal_date: today })
    .select()
    .single();

  if (mealErr || !meal) {
    return `Erro ao registrar refeição: ${mealErr?.message || "Registro falhou"}`;
  }

  const mappedItems = args.items.map((it: any) => ({
    meal_id: meal.id,
    user_id: userId,
    name: it.name,
    calories: Number(it.calories || 0),
    protein_g: Number(it.protein_g || 0),
    carbs_g: Number(it.carbs_g || 0),
    fat_g: Number(it.fat_g || 0),
  }));

  const { error: itemsErr } = await supabase.from("meal_items").insert(mappedItems);
  if (itemsErr) {
    return `Erro ao salvar itens da refeição: ${itemsErr.message}`;
  }

  return "Refeição registrada com sucesso!";
}

/**
 * Executes the record_workout tool: inserts a new workout session and its corresponding sets.
 */
export async function executeRecordWorkout(
  supabase: any,
  userId: string,
  today: string,
  args: { name: string; exercises: Array<{ name: string; sets?: Array<{ reps: string; weight_kg: string }> }> },
  createdWorkoutNames: Set<string>
): Promise<string> {
  if (createdWorkoutNames.has(args.name)) {
    return "Treino já processado nesta solicitação.";
  }

  // Verificação adicional: ver se já existe uma sessão de treino com esse nome HOJE para este usuário
  const { data: existing } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("name", args.name)
    .gte("completed_at", today + "T00:00:00")
    .lte("completed_at", today + "T23:59:59")
    .maybeSingle();

  if (existing) {
    createdWorkoutNames.add(args.name);
    return `O treino "${args.name}" já foi registrado hoje.`;
  }

  // 1. Criar a sessão de treino
  const { data: session, error: sErr } = await supabase
    .from("workout_sessions")
    .insert({ 
      user_id: userId, 
      name: args.name, 
      completed_at: new Date().toISOString() 
    })
    .select()
    .single();
  
  if (!session || sErr) {
    return `Erro ao registrar sessão de treino: ${sErr?.message || "inserção falhou"}`;
  }

  createdWorkoutNames.add(args.name);
  
  // 2. Preparar todas as séries para inserção em massa
  const allSetsToInsert: any[] = [];
  
  args.exercises.forEach((exData: any) => {
    if (exData.sets) {
      exData.sets.forEach((s: any, sIdx: number) => {
        allSetsToInsert.push({
          session_id: session.id,
          user_id: userId,
          exercise_name: exData.name,
          set_number: sIdx + 1,
          reps: Number(s.reps || 0),
          weight_kg: Number(s.weight_kg || 0),
          completed: true
        });
      });
    }
  });
  
  if (allSetsToInsert.length > 0) {
    const { error: setsErr } = await supabase
      .from("workout_session_sets")
      .insert(allSetsToInsert);
    if (setsErr) {
      return `Erro ao registrar séries do treino: ${setsErr.message}`;
    }
    return "Treino registrado com sucesso!";
  }

  return "Treino registrado com sucesso (sem séries).";
}

export const sendChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await fetchAiSettings(supabase, userId);
    const provider = resolveAiProvider(settings);
    const apiKey = resolveAiApiKey(settings, provider);
    if (!apiKey) throw new Error("Configure uma chave de IA nas configuracoes.");

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    // 1. Fetch relevant user context and chat messages history
    const { ctxText, recentHistory } = await fetchUserContext(supabase, userId, today, weekAgo);

    // 2. Optimistic save of user's message
    const dbMessage = data.images?.length ? `[${data.images.length} Imagens] ${data.message}` : data.message;
    await saveChatMessage(supabase, userId, "user", dbMessage);

    const modelToUse = data.images?.length
      ? provider === "openrouter"
        ? "qwen/qwen2.5-vl-72b-instruct"
        : "meta-llama/llama-4-scout-17b-16e-instruct"
      : getTextModel(provider);

    const userContent: any[] = [{ type: "text", text: data.message || "Analise estas imagens." }];
    (data.images ?? []).forEach(img => {
      userContent.push({ type: "image_url", image_url: { url: img } });
    });

    const tools = [
      {
        type: "function",
        function: {
          name: "record_meal",
          description: "Registra uma refeição com múltiplos itens e macros.",
          parameters: {
            type: "object",
            properties: {
              meal_type: { type: "string", enum: ["Café da manhã", "Almoço", "Jantar", "Lanche"] },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    calories: { type: "string", description: "Quantidade de calorias do item como texto (ex: '250')" },
                    protein_g: { type: "string", description: "Proteínas em gramas como texto (ex: '20')" },
                    carbs_g: { type: "string", description: "Carboidratos em gramas como texto (ex: '30')" },
                    fat_g: { type: "string", description: "Gorduras em gramas como texto (ex: '10')" },
                  },
                  required: ["name", "calories"],
                },
              },
            },
            required: ["meal_type", "items"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "record_workout",
          description: "Registra um treino com exercícios e séries.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nome do treino (ex: Treino de Peito)" },
              exercises: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    sets: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          reps: { type: "string", description: "Número de repetições como texto (ex: '12')" },
                          weight_kg: { type: "string", description: "Carga em kg como texto (ex: '60')" },
                        },
                        required: ["reps", "weight_kg"],
                      },
                    },
                  },
                  required: ["name", "sets"],
                },
              },
            },
            required: ["name", "exercises"],
          },
        },
      },
    ];

    let messages: any[] = [
      { 
        role: "system", 
        content: `Você é um coach de nutrição e treino altamente analítico. Use português brasileiro. 
IMPORTANTE: Se o usuário enviar fotos, analise TODAS elas antes de chamar qualquer ferramenta.
- Se as fotos forem do mesmo treino ou refeição, use apenas UMA chamada de ferramenta consolidando todos os dados.
- Treinos têm exercícios, séries e repetições. NÃO calcule macros para treinos.
- Use APENAS as chamadas de ferramentas nativas. NÃO gere JSON manualmente.
- Seja preciso com nomes de exercícios e pesos.

DIRETRIZES DE EXPLICABILIDADE E TRANSPARÊNCIA:
- Suas análises, recomendações e sugestões devem ser explicitamente justificadas citando os dados de origem correspondentes.
- Cite datas de treinos, exercícios específicos, séries, cargas, datas e valores de peso, medidas corporais ou refeições do histórico quando fizer afirmações ou recomendações.
- Exemplo: "Identifiquei que no seu treino de Peito em 12/06 você realizou Supino com 60kg, o que é ótimo para o seu peso corporal atual de 80kg registrado no dia 15/06. Como sua cintura diminuiu 1.5cm desde o dia 01/06..."
- Evite conselhos genéricos; justifique tudo com os números e as datas presentes no contexto do usuário.

Dados do usuário:\n${ctxText}` + (process.env.COACH_ALWAYS_SUGGEST === "true" ? "\n+ Sempre informe ao usuário se ele pode aumentar a carga no próximo treino, mesmo que não haja histórico suficiente." : ""),
      },
      ...recentHistory.map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: userContent },
    ];

    // 3. Agent Loop (handling tools execution and subsequent model responses)
    let response = await callAiChatCompletion({
      provider,
      apiKey,
      model: modelToUse,
      messages,
      tools,
      baseUrl: settings.omniroute_base_url,
    });
    let choice = response.choices[0];
    const createdWorkoutNames = new Set<string>();

    while (choice.message.tool_calls) {
      messages.push(choice.message);
      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        let result = "";

        try {
          if (toolCall.function.name === "record_meal") {
            result = await executeRecordMeal(supabase, userId, today, args);
          } else if (toolCall.function.name === "record_workout") {
            result = await executeRecordWorkout(supabase, userId, today, args, createdWorkoutNames);
          } else {
            result = `Ferramenta desconhecida: ${toolCall.function.name}`;
          }
        } catch (err: any) {
          result = `Erro ao executar ferramenta: ${err?.message || err}`;
        }

        messages.push({ 
          tool_call_id: toolCall.id, 
          role: "tool", 
          name: toolCall.function.name, 
          content: result 
        });
      }
      response = await callAiChatCompletion({
        provider,
        apiKey,
        model: modelToUse,
        messages,
        tools,
        baseUrl: settings.omniroute_base_url,
      });
      choice = response.choices[0];
    }

    // 4. Save assistant reply and return
    const reply = choice.message.content || "Registro concluído.";
    await saveChatMessage(supabase, userId, "assistant", reply);
    return { reply };
  });
