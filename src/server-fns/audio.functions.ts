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
import { getLocalDate } from "@/lib/utils";

const voiceMealSchema = z.object({
  text: z.string().trim().min(2).max(1000),
  meal_date: z.string().optional(),
  meal_type: z.enum(["Café da manhã", "Almoço", "Jantar", "Lanche"]).optional(),
});

const audioTranscriptionSchema = z.object({
  audioBase64: z.string().min(50),
  mimeType: z.string().default("audio/webm"),
});

const voiceMealTool = {
  type: "function",
  function: {
    name: "record_voice_intake",
    description: "Extrai alimentos, refeições (uma ou mais) e/ou consumo de água de um relato falado em português",
    parameters: {
      type: "object",
      properties: {
        water_ml: {
          type: "number",
          description: "Quantidade total de água consumida relatada em mililitros (ex: 500 para 500ml, 300 para um copo, 1000 para 1 litro). Retorne 0 se não foi mencionada água.",
        },
        meals: {
          type: "array",
          description: "Lista de refeições identificadas (uma ou mais). Se o usuário citou café e almoço, separe em objetos distintos.",
          items: {
            type: "object",
            properties: {
              meal_type: {
                type: "string",
                enum: ["Café da manhã", "Almoço", "Jantar", "Lanche"],
                description: "Tipo de refeição inferido pelo contexto ou horário",
              },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Nome canônico do alimento em português" },
                    grams: { type: "number", description: "Quantidade estimada em gramas" },
                    calories: { type: "number", description: "Calorias estimadas (kcal)" },
                    protein_g: { type: "number", description: "Proteína em gramas" },
                    carbs_g: { type: "number", description: "Carboidratos em gramas" },
                    fat_g: { type: "number", description: "Gorduras em gramas" },
                  },
                  required: ["name", "calories", "protein_g", "carbs_g", "fat_g"],
                },
              },
            },
            required: ["meal_type", "items"],
          },
        },
      },
      additionalProperties: false,
    },
  },
};

/**
 * Transcreve áudio base64 usando a API do Groq Whisper.
 */
export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => audioTranscriptionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await fetchAiSettings(supabase, userId);
    const groqKey = settings.groq_api_key || resolveAiApiKey(settings, "groq");

    if (!groqKey) {
      throw new Error("Chave da API da Groq necessária para transcrição de áudio via Whisper.");
    }

    // Converte base64 para Buffer/Blob para envio via FormData
    const buffer = Buffer.from(data.audioBase64.replace(/^data:audio\/\w+;base64,/, ""), "base64");
    const blob = new Blob([buffer], { type: data.mimeType });
    const formData = new FormData();
    formData.append("file", blob, `audio.${data.mimeType.split("/")[1] || "webm"}`);
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "pt");
    formData.append("response_format", "json");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro no Whisper Groq: ${errText}`);
    }

    const json = await res.json();
    return { text: json.text as string };
  });

/**
 * Processa a transcrição ou ditado de texto, extrai refeições e/ou água com IA e registra no Supabase.
 */
export const parseAndRecordVoiceMeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => voiceMealSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = data.meal_date || getLocalDate();

    const settings = await fetchAiSettings(supabase, userId);
    const provider = resolveAiProvider(settings);
    const apiKey = resolveAiApiKey(settings, provider);
    if (!apiKey) throw new Error("Configure uma chave de IA nas configuracoes.");

    const res = await callAiChatCompletion({
      provider,
      apiKey,
      model: getTextModel(provider, settings),
      baseUrl: settings.omniroute_base_url,
      messages: [
        {
          role: "system",
          content:
            "Você é um nutricionista esportivo. Analise o relato falado do usuário e identifique se há consumo de água (em ml) e/ou refeições (uma ou mais). Para cada refeição, identifique os alimentos, estimando a porção em gramas e os macros com base na tabela TACO. Retorne APENAS via chamada da função record_voice_intake.",
        },
        {
          role: "user",
          content: `Relato de voz: "${data.text}". Data: ${today}. ${
            data.meal_type ? `Tipo preferido se for refeição única: ${data.meal_type}` : ""
          }`,
        },
      ],
      tools: [voiceMealTool],
      toolChoice: { type: "function", function: { name: "record_voice_intake" } },
    });

    const json = res as any;
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("A IA não conseguiu interpretar o relato falado.");

    const parsedArgs = JSON.parse(call.function.arguments) as {
      water_ml?: number;
      meals?: Array<{
        meal_type: "Café da manhã" | "Almoço" | "Jantar" | "Lanche";
        items: Array<{
          name: string;
          grams?: number;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
        }>;
      }>;
      // Retrocompatibilidade se a IA mandar formato legados
      meal_type?: "Café da manhã" | "Almoço" | "Jantar" | "Lanche";
      items?: Array<{
        name: string;
        grams?: number;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
      }>;
    };

    // 1) Registro de Água
    let loggedWaterMl = 0;
    if (parsedArgs.water_ml && parsedArgs.water_ml > 0) {
      loggedWaterMl = Math.round(Number(parsedArgs.water_ml));
      const { error: waterErr } = await supabase.from("water_logs").insert({
        user_id: userId,
        log_date: today,
        ml: loggedWaterMl,
      });
      if (waterErr) console.error("Erro ao registrar água por voz:", waterErr.message);
    }

    // Normaliza array de refeições
    const rawMeals = parsedArgs.meals || (parsedArgs.items ? [{ meal_type: parsedArgs.meal_type || data.meal_type || "Almoço", items: parsedArgs.items }] : []);

    let totalKcal = 0;
    let totalP = 0;
    let totalC = 0;
    let totalF = 0;
    const processedMeals: Array<{ meal_type: string; items_count: number; calories: number }> = [];

    // 2) Insere cada refeição e seus itens
    for (const m of rawMeals) {
      if (!m.items || m.items.length === 0) continue;

      const mealType = m.meal_type || data.meal_type || "Almoço";

      const { data: existingMeal } = await supabase
        .from("meals")
        .select("id")
        .eq("user_id", userId)
        .eq("meal_date", today)
        .eq("meal_type", mealType)
        .maybeSingle();

      let mealId = existingMeal?.id;

      if (!mealId) {
        const { data: newMeal, error: mealErr } = await supabase
          .from("meals")
          .insert({
            user_id: userId,
            meal_date: today,
            meal_type: mealType,
          })
          .select("id")
          .single();

        if (mealErr || !newMeal) throw new Error(mealErr?.message || "Erro ao criar refeicao");
        mealId = newMeal.id;
      }

      const itemsToInsert = m.items.map((i) => ({
        meal_id: mealId,
        name: i.name,
        grams: i.grams ?? 100,
        calories: Math.round(Number(i.calories || 0)),
        protein_g: Math.round(Number(i.protein_g || 0) * 10) / 10,
        carbs_g: Math.round(Number(i.carbs_g || 0) * 10) / 10,
        fat_g: Math.round(Number(i.fat_g || 0) * 10) / 10,
      }));

      const { error: itemsErr } = await supabase.from("meal_items").insert(itemsToInsert);
      if (itemsErr) throw new Error(itemsErr.message);

      const mKcal = itemsToInsert.reduce((a, i) => a + i.calories, 0);
      totalKcal += mKcal;
      totalP += itemsToInsert.reduce((a, i) => a + i.protein_g, 0);
      totalC += itemsToInsert.reduce((a, i) => a + i.carbs_g, 0);
      totalF += itemsToInsert.reduce((a, i) => a + i.fat_g, 0);

      processedMeals.push({
        meal_type: mealType,
        items_count: itemsToInsert.length,
        calories: mKcal,
      });
    }

    if (loggedWaterMl === 0 && processedMeals.length === 0) {
      throw new Error("Nenhum alimento ou quantidade de água válida foi identificada no relato.");
    }

    return {
      success: true,
      water_ml: loggedWaterMl,
      meals: processedMeals,
      meal_type: processedMeals[0]?.meal_type || data.meal_type || "Almoço",
      totals: {
        calories: totalKcal,
        protein_g: Math.round(totalP * 10) / 10,
        carbs_g: Math.round(totalC * 10) / 10,
        fat_g: Math.round(totalF * 10) / 10,
      },
    };
  });

