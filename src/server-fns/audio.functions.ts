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
    name: "record_voice_meal",
    description: "Extrai alimentos e macros nutricionais de uma descrição falada de refeição em português",
    parameters: {
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
 * Processa a transcrição ou ditado de texto da refeição, extrai alimentos com IA e registra no Supabase.
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
            "Você é um nutricionista esportivo. Analise o relato falado/ditado do usuário e identifique cada alimento, estimando a porção em gramas e os macros (kcal, proteína, carboidrato, gordura) com base na tabela TACO. Retorne APENAS via chamada da função record_voice_meal.",
        },
        {
          role: "user",
          content: `Relato de alimentação: "${data.text}". Data: ${today}. ${
            data.meal_type ? `Tipo preferido: ${data.meal_type}` : ""
          }`,
        },
      ],
      tools: [voiceMealTool],
      toolChoice: { type: "function", function: { name: "record_voice_meal" } },
    });

    const json = res as any;
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("A IA não conseguiu interpretar os alimentos relatados.");

    const parsed = JSON.parse(call.function.arguments) as {
      meal_type: "Café da manhã" | "Almoço" | "Jantar" | "Lanche";
      items: Array<{
        name: string;
        grams?: number;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
      }>;
    };

    const finalMealType = data.meal_type || parsed.meal_type || "Almoço";

    // 1) Reaproveita a refeição existente do tipo ou cria uma nova
    const { data: existingMeal } = await supabase
      .from("meals")
      .select("id")
      .eq("user_id", userId)
      .eq("meal_date", today)
      .eq("meal_type", finalMealType)
      .maybeSingle();

    let mealId = existingMeal?.id;

    if (!mealId) {
      const { data: newMeal, error: mealErr } = await supabase
        .from("meals")
        .insert({
          user_id: userId,
          meal_date: today,
          meal_type: finalMealType,
        })
        .select("id")
        .single();

      if (mealErr || !newMeal) throw new Error(mealErr?.message || "Erro ao criar refeicao");
      mealId = newMeal.id;
    }

    // 2) Insere os itens
    const itemsToInsert = parsed.items.map((i) => ({
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

    const totalKcal = itemsToInsert.reduce((a, i) => a + i.calories, 0);
    const totalP = itemsToInsert.reduce((a, i) => a + i.protein_g, 0);
    const totalC = itemsToInsert.reduce((a, i) => a + i.carbs_g, 0);
    const totalF = itemsToInsert.reduce((a, i) => a + i.fat_g, 0);

    return {
      success: true,
      meal_type: finalMealType,
      items: itemsToInsert,
      totals: {
        calories: totalKcal,
        protein_g: Math.round(totalP * 10) / 10,
        carbs_g: Math.round(totalC * 10) / 10,
        fat_g: Math.round(totalF * 10) / 10,
      },
    };
  });
