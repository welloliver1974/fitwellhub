import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  message: z.string().trim().max(2000).optional().default(""),
  images: z.array(z.string()).optional(),
});

export const sendChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada");
    const { supabase, userId } = context;

    // ... context gathering (identical to current) ...
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const [
      { data: goals },
      { data: meals },
      { data: water },
      { data: weights },
      { data: history },
    ] = await Promise.all([
      supabase.from("goals").select("calories,protein_g,carbs_g,fat_g").eq("user_id", userId).maybeSingle(),
      supabase.from("meals").select("id,meal_date").eq("user_id", userId).gte("meal_date", weekAgo),
      supabase.from("water_logs").select("ml,log_date").eq("user_id", userId).gte("log_date", weekAgo),
      supabase.from("body_weights").select("weight_kg,log_date").eq("user_id", userId).order("log_date", { ascending: false }).limit(5),
      supabase.from("chat_messages").select("role,content").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    ]);

    const ids = (meals ?? []).map((m) => m.id);
    const dailyTotals: Record<string, { kcal: number; p: number; c: number; f: number }> = {};
    if (ids.length) {
      const { data: items } = await supabase.from("meal_items").select("meal_id,calories,protein_g,carbs_g,fat_g").in("meal_id", ids);
      (items ?? []).forEach((i) => {
        const d = (meals ?? []).find(m => m.id === i.meal_id)?.meal_date;
        if (!d) return;
        const cur = dailyTotals[d] ?? { kcal: 0, p: 0, c: 0, f: 0 };
        cur.kcal += Number(i.calories || 0); cur.p += Number(i.protein_g || 0); cur.c += Number(i.carbs_g || 0); cur.f += Number(i.fat_g || 0);
        dailyTotals[d] = cur;
      });
    }

    const ctxText = `Hoje: ${today}\nMetas: ${goals?.calories ?? 2000}kcal, P${goals?.protein_g ?? 140}g, C${goals?.carbs_g ?? 220}g, G${goals?.fat_g ?? 65}g\nÚltimos 7 dias:\n${Object.entries(dailyTotals).map(([d, t]) => `${d}: ${Math.round(t.kcal)}kcal`).join(", ")}`;

    // Optimistic Save
    const dbMessage = data.images?.length ? `[${data.images.length} Imagens] ${data.message}` : data.message;
    await supabase.from("chat_messages").insert({ user_id: userId, role: "user", content: dbMessage });

    const recentHistory = (history ?? []).reverse();
    const modelToUse = data.images?.length ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile";

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
                    calories: { type: "number" },
                    protein_g: { type: "number" },
                    carbs_g: { type: "number" },
                    fat_g: { type: "number" },
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
                          reps: { type: "number" },
                          weight_kg: { type: "number" },
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
        Dados do usuário:\n${ctxText}` 
      },
      ...recentHistory.map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: userContent },
    ];

    const groqCall = async (msgs: any[]) => {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelToUse, messages: msgs, tools, tool_choice: "auto" }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    };

    let response = await groqCall(messages);
    let choice = response.choices[0];
    const createdWorkoutNames = new Set<string>();

    while (choice.message.tool_calls) {
      messages.push(choice.message);
      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        let result = "";

        if (toolCall.function.name === "record_meal") {
          const { data: meal } = await supabase.from("meals").insert({ user_id: userId, meal_type: args.meal_type, meal_date: today }).select().single();
          if (meal) {
            await supabase.from("meal_items").insert(args.items.map((it: any) => ({ ...it, meal_id: meal.id, user_id: userId })));
            result = "Refeição registrada com sucesso!";
          }
        } else if (toolCall.function.name === "record_workout") {
          if (createdWorkoutNames.has(args.name)) {
            result = "Treino já processado nesta solicitação.";
          } else {
            // Verificação adicional: ver se já existe um treino com esse nome HOJE para este usuário
            const { data: existing } = await supabase
              .from("workouts")
              .select("id")
              .eq("user_id", userId)
              .eq("name", args.name)
              .eq("workout_date", today)
              .maybeSingle();

            if (existing) {
              result = `O treino "${args.name}" já foi registrado hoje.`;
              createdWorkoutNames.add(args.name);
            } else {
              // 1. Criar o treino
              const { data: workout, error: wErr } = await supabase.from("workouts").insert({ user_id: userId, name: args.name, workout_date: today }).select().single();
              
              if (workout) {
                createdWorkoutNames.add(args.name);
                
                // 2. Criar todos os exercícios em massa
                const exercisesToInsert = args.exercises.map((ex: any, idx: number) => ({
                  user_id: userId,
                  workout_id: workout.id,
                  name: ex.name,
                  position: idx
                }));
                
                const { data: insertedExercises, error: exErr } = await supabase.from("exercises").insert(exercisesToInsert).select();
                
                if (insertedExercises && !exErr) {
                  // 3. Criar todas as séries em massa
                  const allSetsToInsert: any[] = [];
                  
                  args.exercises.forEach((exData: any, idx: number) => {
                    const exRecord = insertedExercises.find(e => e.name === exData.name && e.position === idx);
                    if (exRecord && exData.sets) {
                      exData.sets.forEach((s: any, sIdx: number) => {
                        allSetsToInsert.push({
                          ...s,
                          exercise_id: exRecord.id,
                          user_id: userId,
                          set_number: sIdx + 1
                        });
                      });
                    }
                  });
                  
                  if (allSetsToInsert.length > 0) {
                    await supabase.from("sets").insert(allSetsToInsert);
                  }
                  result = "Treino registrado com sucesso!";
                } else {
                  result = `Erro ao registrar exercícios: ${exErr?.message}`;
                }
              } else {
                result = `Erro ao registrar treino: ${wErr?.message}`;
              }
            }
          }
        }

        messages.push({ tool_call_id: toolCall.id, role: "tool", name: toolCall.function.name, content: result });
      }
      response = await groqCall(messages);
      choice = response.choices[0];
    }

    const reply = choice.message.content || "Registro concluído.";
    await supabase.from("chat_messages").insert({ user_id: userId, role: "assistant", content: reply });
    return { reply };
  });
