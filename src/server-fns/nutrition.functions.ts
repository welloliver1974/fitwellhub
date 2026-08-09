import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  callAiChatCompletion,
  fetchAiSettings,
  getTextModel,
  getVisionModel,
  resolveAiApiKey,
  resolveAiProvider,
  resolveVisionProvider,
} from "@/server-fns/ai-settings.functions";
import { buildCoachPlan, inferCoachObjective } from "@/lib/coach-plan";
import { normalizeLabelMacros } from "@/lib/food-utils";

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
    const photoProvider = resolveVisionProvider(settings);
    const apiKey = resolveAiApiKey(settings, photoProvider);
    if (!apiKey) throw new Error("Configure uma chave de IA nas configuracoes.");
    const photoModel = getVisionModel(photoProvider, settings);

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

// Leitura da tabela "Informacao Nutricional" de uma embalagem pela foto.
// name aceita null (produto sem nome visivel); os macros numericos sao
// obrigatorios para o safeParse, normalizados depois em normalizeLabelMacros.
export const labelSchema = z.object({
  name: z.string().nullable().optional(),
  serving_g: z.number(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});

const labelParamsSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Nome do produto visivel na embalagem, ou null" },
    serving_g: { type: "number", description: "Porcao declarada em gramas (ex.: Porcao de 30g)" },
    calories: { type: "number", description: "kcal POR PORCAO" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
  },
  required: ["name", "serving_g", "calories", "protein_g", "carbs_g", "fat_g"],
  additionalProperties: false,
};

export const analyzeLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => photoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await fetchAiSettings(supabase, userId);
    const photoProvider = resolveVisionProvider(settings);
    const apiKey = resolveAiApiKey(settings, photoProvider);
    if (!apiKey) throw new Error("Configure uma chave de IA nas configuracoes.");
    const photoModel = getVisionModel(photoProvider, settings);

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
            "Voce e um nutricionista. Leia a tabela 'Informacao Nutricional' da embalagem na foto. name = nome visivel do produto (ou null se nao houver). serving_g = porcao declarada em gramas (ex.: 'Porcao de 30g'). calories/protein_g/carbs_g/fat_g = valores POR PORCAO. Se a tabela so mostrar valores por 100g, use serving_g=100 e os valores por 100g. Se algum campo nao estiver visivel, use null. Retorne APENAS a tool call.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Leia a tabela nutricional desta embalagem." },
            { type: "image_url", image_url: { url: data.imageBase64 } },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "report_label",
            description: "Reporta os macros lidos da tabela nutricional da embalagem",
            parameters: labelParamsSchema,
          },
        },
      ],
      toolChoice: { type: "function", function: { name: "report_label" } },
    });

    const json = res as any;
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("IA nao retornou a leitura do rotulo (refaca a foto)");
    const parsed = labelSchema.safeParse(JSON.parse(call.function.arguments));
    if (!parsed.success) throw new Error("Leitura do rotulo em formato inesperado (refaca a foto)");
    return normalizeLabelMacros(parsed.data);
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
      protein_factor: z.number().nonnegative().optional(),
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

    const objectiveContext = data.objective
      ? `O objetivo atual do usuario e: **${data.objective}**.`
      : "Infira o objetivo do usuario com base nas metas caloricas e estrategia de proteina.";

    const fallbackObjective = data.objective ?? inferCoachObjective(data.goals);
    const fallbackPlan = buildCoachPlan(data.stats ?? {}, data.goals, data.objective);

    const coachPlanTool = {
      type: "function",
      function: {
        name: "report_coach_analysis",
        description: "Reporta a analise completa da semana e o plano personalizado para a proxima semana.",
        parameters: {
          type: "object",
          properties: {
            insightText: {
              type: "string",
              description: "3 a 5 insights curtos, praticos e motivadores em markdown sobre a semana passada.",
            },
            focus: {
              type: "string",
              description: "Foco principal da proxima semana em ate 6 palavras.",
            },
            todaySummary: {
              type: "string",
              description: "Resumo em 1 frase acionavel do que fazer hoje.",
            },
            trainingGoal: {
              type: "string",
              description: "Meta curta e pratica para os treinos da semana.",
            },
            nutritionGoal: {
              type: "string",
              description: "Meta curta e pratica para a nutricao da semana.",
            },
            trackingGoal: {
              type: "string",
              description: "Meta curta e pratica para o acompanhamento (pesagem, agua).",
            },
            nextAction: {
              type: "string",
              description: "Proxima acao mais importante do usuario.",
            },
            checklist: {
              type: "array",
              items: { type: "string" },
              description: "Lista com exatamente 3 itens acionaveis de checklist para a semana.",
            },
            calorieAdjustment: {
              type: "object",
              description: "Recomendacao proativa de ajuste de calorias/metas baseada na tendencia de peso das ultimas 2 a 4 semanas. Se a mudanca de peso estiver estagnada ou inadequada para o objetivo, recomende ajuste.",
              properties: {
                recommendedAction: {
                  type: "string",
                  enum: ["manter", "reduzir_calorias", "aumentar_calorias", "aumentar_proteina"],
                  description: "Acao recomendada",
                },
                calorieDelta: {
                  type: "number",
                  description: "Delta calorico sugerido em kcal (ex: -150 para reduzir 150 kcal, +200 para aumentar, ou 0 para manter)",
                },
                reasoning: {
                  type: "string",
                  description: "Explicacao sucinta e motivadora da razao do ajuste sugerido baseado na evolucao do peso.",
                },
              },
              required: ["recommendedAction", "calorieDelta", "reasoning"],
            },
          },
          required: [
            "insightText",
            "focus",
            "todaySummary",
            "trainingGoal",
            "nutritionGoal",
            "trackingGoal",
            "nextAction",
            "checklist",
          ],
          additionalProperties: false,
        },
      },
    };

    let text = "";
    let plan = fallbackPlan;

    try {
      const res = await callAiChatCompletion({
        provider,
        apiKey,
        model: getTextModel(provider, settings),
        baseUrl: settings.omniroute_base_url,
        messages: [
          {
            role: "system",
            content:
              `Voce e um coach pessoal e planejador de treino e nutricao. ${objectiveContext} Analise os dados de peso, consumo e treinos das ultimas 2 a 4 semanas do usuario. Se o peso estiver estagnado para emagrecimento, sugira reduzir 100-200 kcal. Se o peso cair rapido demais (>1kg/semana) ou estagnar no ganho, sugira aumentar 150-250 kcal. Se a evolucao estiver no ritmo perfeito, recomende manter. Gere a analise e o plano com report_coach_analysis.`,
          },
          { role: "user", content: data.summary },
        ],
        tools: [coachPlanTool],
        toolChoice: { type: "function", function: { name: "report_coach_analysis" } },
      });

      const json = res as any;
      const call = json.choices?.[0]?.message?.tool_calls?.[0];
      if (call?.function?.arguments) {
        const args = JSON.parse(call.function.arguments);
        text = args.insightText ?? "";
        plan = {
          title: "Plano da proxima semana",
          objective: fallbackObjective,
          focus: args.focus ?? fallbackPlan.focus,
          todaySummary: args.todaySummary ?? fallbackPlan.todaySummary,
          trainingGoal: args.trainingGoal ?? fallbackPlan.trainingGoal,
          nutritionGoal: args.nutritionGoal ?? fallbackPlan.nutritionGoal,
          trackingGoal: args.trackingGoal ?? fallbackPlan.trackingGoal,
          nextAction: args.nextAction ?? fallbackPlan.nextAction,
          checklist:
            Array.isArray(args.checklist) && args.checklist.length > 0
              ? args.checklist
              : fallbackPlan.checklist,
          calorieAdjustment: args.calorieAdjustment ?? undefined,
        };
      } else {

        text = (json.choices?.[0]?.message?.content as string) ?? "";
      }
    } catch {
      // Fallback determinístico se a chamada de IA com tools falhar
      text = "";
    }

    const workoutCount = data.stats?.workoutCount ?? 0;
    const mealCount = data.stats?.mealCount ?? 0;
    const weightCount = data.stats?.weightCount ?? 0;
    const waterCount = data.stats?.waterCount ?? 0;
    const score = workoutCount + mealCount + weightCount + waterCount;

    const confidence = score >= 12 ? "alta" : score >= 6 ? "media" : "baixa";
    const nextAction =
      plan.nextAction ||
      (workoutCount === 0
        ? "Registre pelo menos um treino na proxima semana para melhorar a leitura do Coach."
        : mealCount === 0
          ? "Registre refeicoes com mais frequencia para cruzar melhor treino e nutricao."
          : weightCount === 0
            ? "Adicione ao menos um peso recente para o Coach comparar com sua evolucao."
            : "Mantenha a rotina atual e volte a analisar a semana na proxima atualizacao.");

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
      plan,
    };
  });

// ---------------------------------------------------------------------------
// Sugestão de refeição por macros restantes (Item 5.3)
// ---------------------------------------------------------------------------

const suggestMealInputSchema = z.object({
  remainingCalories: z.number().max(5000),
  remainingProtein: z.number().max(500),
  remainingCarbs: z.number().max(1000),
  remainingFat: z.number().max(500),
  preferredMealType: z.string().optional().default("Lanche"),
});

export const suggestMealOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      prepTime: z.string(),
      totals: z.object({
        calories: z.number(),
        protein_g: z.number(),
        carbs_g: z.number(),
        fat_g: z.number(),
      }),
      items: z.array(
        z.object({
          name: z.string(),
          grams: z.number(),
          calories: z.number(),
          protein_g: z.number(),
          carbs_g: z.number(),
          fat_g: z.number(),
        })
      ),
    })
  ),
});

export type SuggestedMealOption = z.infer<typeof suggestMealOutputSchema>["suggestions"][number];

const SUGGEST_MEAL_TOOL = {
  type: "function",
  function: {
    name: "report_suggested_meals",
    description:
      "Retorna exatamente 3 sugestões de refeição/lanche deliciosas e equilibradas que se encaixam no saldo de macros restantes.",
    parameters: {
      type: "object",
      required: ["suggestions"],
      properties: {
        suggestions: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            required: ["title", "description", "prepTime", "totals", "items"],
            properties: {
              title: { type: "string", description: "Nome atrativo da refeição" },
              description: { type: "string", description: "Breve resumo/modo de preparo simples (1 frase)" },
              prepTime: { type: "string", description: "Tempo estimado (ex: '5 min')" },
              totals: {
                type: "object",
                required: ["calories", "protein_g", "carbs_g", "fat_g"],
                properties: {
                  calories: { type: "number" },
                  protein_g: { type: "number" },
                  carbs_g: { type: "number" },
                  fat_g: { type: "number" },
                },
              },
              items: {
                type: "array",
                description: "Ingredientes com porção em gramas e macros individuais",
                items: {
                  type: "object",
                  required: ["name", "grams", "calories", "protein_g", "carbs_g", "fat_g"],
                  properties: {
                    name: { type: "string" },
                    grams: { type: "number" },
                    calories: { type: "number" },
                    protein_g: { type: "number" },
                    carbs_g: { type: "number" },
                    fat_g: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const suggestMealByRemainingMacros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => suggestMealInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const settings = await fetchAiSettings(supabase, userId);
    const provider = resolveAiProvider(settings);
    const apiKey = resolveAiApiKey(settings, provider);
    if (!apiKey) throw new Error("Configure uma chave de IA nas configurações.");

    const { remainingCalories, remainingProtein, remainingCarbs, remainingFat, preferredMealType } = data;

    const safeKcal = Math.max(50, Math.round(remainingCalories));
    const safeP = Math.max(0, Math.round(remainingProtein));
    const safeC = Math.max(0, Math.round(remainingCarbs));
    const safeF = Math.max(0, Math.round(remainingFat));

    const prompt = `Você é um nutricionista esportivo prático.
O usuário possui o seguinte saldo de macros restantes para o dia:
- Calorias restantes: ~${safeKcal} kcal
- Proteína restante: ~${safeP} g
- Carboidrato restante: ~${safeC} g
- Gordura restante: ~${safeF} g
- Tipo de refeição sugerido: ${preferredMealType}

Crie exatamente 3 opções de refeições/lanches brasileiras, fáceis de preparar, que se encaixem bem nesse orçamento de macros.
Cada opção deve ter o total de macros próximo ao saldo restante e listar os ingredientes individuais com gramas exatas.
Retorne usando a ferramenta report_suggested_meals.`;

    const res = await callAiChatCompletion({
      provider,
      apiKey,
      model: getTextModel(provider, settings),
      baseUrl: settings.omniroute_base_url,
      messages: [
        { role: "system", content: "Você é um nutricionista inteligente." },
        { role: "user", content: prompt },
      ],
      tools: [SUGGEST_MEAL_TOOL],
      toolChoice: { type: "function", function: { name: "report_suggested_meals" } },
      temperature: 0.7,
      maxTokens: 1000,
    });

    const json = res as any;
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      throw new Error("Não foi possível gerar sugestões de refeição.");
    }

    const args = JSON.parse(call.function.arguments);
    const parsed = suggestMealOutputSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error("Formato de sugestão inválido retornado pela IA.");
    }

    return parsed.data;
  });

