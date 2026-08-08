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
import { buildCoachPlan } from "@/lib/coach-plan";

const inputSchema = z.object({
  query: z.string().trim().min(1).max(200),
  grams: z.number().min(1).max(5000).default(100),
});

const macroSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Nome canonico do alimento em portugues" },
    calories: { type: "number", description: "kcal por porcao informada" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
  },
  required: ["name", "calories", "protein_g", "carbs_g", "fat_g"],
  additionalProperties: false,
};

export const lookupNutrition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const grams = data.grams;
    const { supabase, userId } = context;

    try {
      const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
        data.query,
      )}&search_simple=1&action=process&json=1&page_size=1`;
      const offRes = await fetch(offUrl, { signal: AbortSignal.timeout(5000) });
      if (offRes.ok) {
        const body = await offRes.json();
        const p = body.products?.[0]?.nutriments;
        if (p?.["energy-kcal_100g"]) {
          const ratio = grams / 100;
          return {
            name: body.products[0].product_name || data.query,
            calories: Math.round(p["energy-kcal_100g"] * ratio),
            protein_g: Math.round((p["proteins_100g"] ?? 0) * ratio * 10) / 10,
            carbs_g: Math.round((p["carbohydrates_100g"] ?? 0) * ratio * 10) / 10,
            fat_g: Math.round((p["fat_100g"] ?? 0) * ratio * 10) / 10,
          };
        }
      }
    } catch {
      // fallback to IA
    }

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
            "Voce e um nutricionista. Estime macros (kcal, proteina, carboidrato, gordura) de alimentos brasileiros. Use a tabela TACO como referencia mental. Sempre arredonde para 1 casa decimal. Retorne APENAS via tool call.",
        },
        {
          role: "user",
          content: `Alimento: "${data.query}". Porcao: ${grams}g. Estime os macros para essa porcao exata.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "report_macros",
            description: "Reporta macros nutricionais estimados",
            parameters: macroSchema,
          },
        },
      ],
      toolChoice: { type: "function", function: { name: "report_macros" } },
    });

    const json = res as any;
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("Resposta invalida da IA");
    const args = JSON.parse(call.function.arguments);
    return args as {
      name: string;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    };
  });

const photoSchema = z.object({
  imageBase64: z.string().min(50),
});

export const analyzePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => photoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await fetchAiSettings(supabase, userId);
    // Foto do prato: provedor/modelo de visao dedicados (se configurados na tela IA);
    // senao, segue o provedor padrao + qwen2.5-vl, independente do modelo de texto do Coach.
    const photoProvider: "openrouter" | "omniroute" | "nvidia" =
      settings.photo_provider ??
      (settings.provider === "omniroute"
        ? "omniroute"
        : settings.provider === "nvidia"
          ? "nvidia"
          : "openrouter");
    const apiKey = resolveAiApiKey(settings, photoProvider);
    if (!apiKey) throw new Error("Configure uma chave de IA nas configuracoes.");

    const savedPhotoModel = settings.photo_model?.trim();
    const photoModel =
      photoProvider === "nvidia" && savedPhotoModel === "nvidia/llama-3.2-90b-vision-instruct"
        ? "meta/llama-3.2-90b-vision-instruct"
        : savedPhotoModel ||
          (photoProvider === "nvidia"
            ? "meta/llama-3.2-90b-vision-instruct"
            : "qwen/qwen2.5-vl-72b-instruct");

    const res = await callAiChatCompletion({
      provider: photoProvider,
      apiKey,
      model: photoModel,
      baseUrl: photoProvider === "omniroute" ? settings.omniroute_base_url : undefined,
      maxTokens: 512,
      messages: [
        {
          role: "system",
          content:
            'Voce e nutricionista. Identifique cada alimento visivel na foto do prato, estime gramas e macros (kcal, proteina, carboidrato, gordura) por item. Use a tabela TACO como referencia. Retorne APENAS um JSON valido (sem markdown, sem explicacao) no formato: {"items":[{"name":"...","grams":N,"calories":N,"protein_g":N,"carbs_g":N,"fat_g":N}]}',
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analise este prato e estime macros por item. Retorne apenas o JSON." },
            { type: "image_url", image_url: { url: data.imageBase64 } },
          ],
        },
      ],
    });

    const json = res as any;
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("Resposta vazia da IA");

    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("IA nao retornou um JSON valido");

    const args = JSON.parse(match[0]);
    if (!args.items || !Array.isArray(args.items)) throw new Error("Formato de resposta inesperado");

    return args as {
      items: Array<{
        name: string;
        grams: number;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
      }>;
    };
  });

const coachSchema = z.object({
  summary: z.string().max(8000),
  objective: z.enum(["Emagrecimento", "Hipertrofia", "Recomposicao corporal", "Manutencao"]).optional(),
  goals: z
    .object({
      calories: z.number().nonnegative().optional(),
      protein_g: z.number().nonnegative().optional(),
      carbs_g: z.number().nonnegative().optional(),
      fat_g: z.number().nonnegative().optional(),
    })
    .optional(),
  stats: z
    .object({
      mealCount: z.number().int().nonnegative().optional(),
      workoutCount: z.number().int().nonnegative().optional(),
      weightCount: z.number().int().nonnegative().optional(),
      waterCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export const coachAdvice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => coachSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
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
            "Voce e um coach pessoal e planejador de treino e nutricao. Analise os dados da ultima semana do usuario e retorne 3-5 insights curtos, praticos e motivadores em portugues. Sempre conecte os achados a um plano da proxima semana, com foco em treino, nutricao e acompanhamento. Use markdown simples (negrito e listas). Seja direto, sem clichês.",
        },
        { role: "user", content: data.summary },
      ],
    });

    const json = res as any;
    const text = (json.choices?.[0]?.message?.content as string) ?? "";
    const workoutCount = data.stats?.workoutCount ?? 0;
    const mealCount = data.stats?.mealCount ?? 0;
    const weightCount = data.stats?.weightCount ?? 0;
    const waterCount = data.stats?.waterCount ?? 0;
    const score = workoutCount + mealCount + weightCount + waterCount;

    const confidence = score >= 12 ? "alta" : score >= 6 ? "media" : "baixa";
    const nextAction =
      workoutCount === 0
        ? "Registre pelo menos um treino na proxima semana para melhorar a leitura do Coach."
        : mealCount === 0
          ? "Registre refeicoes com mais frequencia para cruzar melhor treino e nutricao."
          : weightCount === 0
            ? "Adicione ao menos um peso recente para o Coach comparar com sua evolucao."
            : "Mantenha a rotina atual e volte a analisar a semana na proxima atualizacao.";

    const sources = [
      `${mealCount} refeicoes na semana`,
      `${workoutCount} treinos na semana`,
      `${weightCount} registros de peso`,
      `${waterCount} registros de agua`,
    ];

    return {
      text,
      snapshot: {
        confidence,
        nextAction,
        sources,
      },
      plan: buildCoachPlan(data.stats ?? {}, data.goals ?? {}, data.objective),
    };
  });
