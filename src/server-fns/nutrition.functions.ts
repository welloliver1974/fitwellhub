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
    const photoProvider: "openrouter" | "omniroute" =
      settings.provider === "omniroute" ? "omniroute" : "openrouter";
    const apiKey = resolveAiApiKey(settings, photoProvider);
    if (!apiKey) throw new Error("Configure a chave do OpenRouter nas configuracoes.");

    const res = await callAiChatCompletion({
      provider: photoProvider,
      apiKey,
      model: "qwen/qwen2.5-vl-72b-instruct",
      baseUrl: settings.omniroute_base_url,
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

type CoachPlan = {
  title: string;
  objective: string;
  focus: string;
  todaySummary: string;
  trainingGoal: string;
  nutritionGoal: string;
  trackingGoal: string;
  nextAction: string;
  checklist: string[];
};

type CoachGoals = NonNullable<z.infer<typeof coachSchema>["goals"]>;
type CoachObjective = NonNullable<z.infer<typeof coachSchema>["objective"]>;

function inferCoachObjective(goals?: CoachGoals): CoachObjective {
  const calories = goals?.calories ?? 0;
  const protein = goals?.protein_g ?? 0;

  if (calories <= 1900 && protein >= 120) return "Emagrecimento";
  if (calories >= 2300 && protein >= 150) return "Hipertrofia";
  if (calories > 0 && calories < 2300) return "Recomposicao corporal";
  return "Manutencao";
}

function buildCoachPlan(
  stats: NonNullable<z.infer<typeof coachSchema>["stats"]>,
  goals?: CoachGoals,
  preferredObjective?: CoachObjective,
): CoachPlan {
  const workoutCount = stats.workoutCount ?? 0;
  const mealCount = stats.mealCount ?? 0;
  const weightCount = stats.weightCount ?? 0;
  const waterCount = stats.waterCount ?? 0;
  const objective = preferredObjective ?? inferCoachObjective(goals);

  const focus =
    objective === "Emagrecimento"
      ? workoutCount === 0
        ? "Criar rotina e aderencia"
        : "Aumentar gasto e manter consistencia"
      : objective === "Hipertrofia"
        ? workoutCount < 3
          ? "Fechar volume minimo da semana"
          : "Subir carga e preservar recuperacao"
        : objective === "Recomposicao corporal"
          ? "Equilibrar treino, comida e recuperacao"
          : "Manter consistencia e medir evolucao";

  const todaySummary =
    objective === "Emagrecimento"
      ? workoutCount === 0
        ? "Hoje, marque o primeiro treino da semana e registre a refeicao principal."
        : "Hoje, mantenha a comida sob controle e feche um treino se ainda nao treinou."
      : objective === "Hipertrofia"
        ? workoutCount === 0
          ? "Hoje, organize o treino e garanta uma refeicao com boa proteina."
          : "Hoje, foque em comer bem e registrar cargas do treino."
        : objective === "Recomposicao corporal"
          ? "Hoje, mantenha o treino e a alimentacao alinhados sem exageros."
          : "Hoje, registre o que comer e verifique se o treino da semana esta andando.";

  const trainingGoal =
    objective === "Emagrecimento"
      ? workoutCount === 0
        ? "Fazer 2 a 3 treinos para voltar ao ritmo e aumentar gasto semanal."
        : "Manter pelo menos 3 treinos com foco em consistencia e intensidade moderada."
      : objective === "Hipertrofia"
        ? workoutCount < 3
          ? "Fechar 3 a 4 treinos e anotar cargas e repeticoes em cada sessao."
          : "Buscar progressao em pelo menos 1 exercicio por treino."
        : objective === "Recomposicao corporal"
          ? "Fazer 3 treinos bem feitos e evitar semanas muito vazias."
          : "Manter 2 a 3 treinos consistentes e registrar performance.";

  const nutritionGoal =
    objective === "Emagrecimento"
      ? mealCount < 4
        ? "Registrar refeicoes todos os dias e vigiar a aderencia calorica."
        : "Priorizar saciedade, proteina e constancia no deficit."
      : objective === "Hipertrofia"
        ? mealCount < 4
          ? "Registrar todas as refeicoes para nao perder calorias nem proteina."
          : "Garantir superavit leve e bater a proteina alvo."
        : objective === "Recomposicao corporal"
          ? mealCount < 4
            ? "Manter registros para equilibrar calorias e proteina."
            : "Buscar proteina alta e calorias controladas."
          : "Manter o registro alimentar e comparar proteina, calorias e aderencia a meta.";

  const trackingGoal =
    objective === "Emagrecimento"
      ? weightCount === 0
        ? "Adicionar pelo menos 1 peso na semana para validar se o deficit esta funcionando."
        : "Monitorar peso e agua para entender o ritmo de perda."
      : objective === "Hipertrofia"
        ? weightCount === 0
          ? "Fazer 1 pesagem de controle para acompanhar ganho real."
          : "Acompanhar peso e agua para diferenciar ganho de massa de retenÃ§Ã£o."
        : waterCount < 4
          ? "Registrar agua com mais constancia para completar a leitura da recuperacao."
          : "Seguir monitorando peso e agua para confirmar a evolucao da semana.";

  const nextAction =
    objective === "Emagrecimento"
      ? workoutCount === 0
        ? "Abra a semana com 2 treinos marcados e uma meta simples de registro alimentar."
        : "Segure a constancia nos treinos e nao deixe as refeicoes principais sem registro."
      : objective === "Hipertrofia"
        ? workoutCount === 0
          ? "Planeje os treinos e garanta a primeira sessao com cargas definidas."
          : "Tente subir uma variavel de treino e manter a comida alinhada ao ganho."
        : objective === "Recomposicao corporal"
          ? "Mantenha o treino e a comida sob controle, com ajuste fino ao longo da semana."
          : workoutCount === 0
            ? "Abra a proxima semana com 1 treino marcado na agenda."
            : mealCount === 0
              ? "Registre a proxima refeicao inteira para o Coach ja comecar a planejar com base real."
              : weightCount === 0
                ? "Faca uma pesagem assim que puder e use esse numero como ponto de referencia."
                : "Continue a rotina atual e revise o plano no fim da semana para ajustar a progressao.";

  const checklist = [
    objective === "Emagrecimento"
      ? workoutCount === 0
        ? "Marcar 2 treinos e 1 caminhada longa na semana."
        : "Manter o deficit sob controle nas refeicoes principais."
      : objective === "Hipertrofia"
        ? workoutCount < 3
          ? "Fechar 3 treinos e anotar cargas."
          : "Garantir proteina suficiente em todas as refeicoes."
        : objective === "Recomposicao corporal"
          ? "Treinar sem falhar e nao deixar refeicoes longas sem registro."
          : workoutCount === 0
            ? "Marcar 2 treinos na agenda antes de quarta-feira."
            : "Fechar pelo menos 3 treinos na semana com carga anotada.",
    objective === "Emagrecimento"
      ? "Registrar todas as refeicoes principais da semana."
      : objective === "Hipertrofia"
        ? "Bater a meta de proteina todos os dias."
        : objective === "Recomposicao corporal"
          ? "Comparar o total de proteina e calorias com a meta."
          : mealCount < 4
            ? "Registrar todas as refeicoes principais da semana."
            : "Comparar o total de proteina e calorias com a meta.",
    objective === "Emagrecimento"
      ? weightCount === 0
        ? "Fazer 1 pesagem de referencia."
        : "Repetir a pesagem no mesmo horario para acompanhar tendencia."
      : objective === "Hipertrofia"
        ? weightCount === 0
          ? "Fazer 1 pesagem de referencia."
          : "Acompanhar peso uma vez por semana no mesmo horario."
        : weightCount === 0
          ? "Fazer 1 pesagem de referencia."
          : "Repetir a pesagem no mesmo horario para acompanhar tendencia.",
  ];

  return {
    title: "Plano da proxima semana",
    objective,
    focus,
    todaySummary,
    trainingGoal,
    nutritionGoal,
    trackingGoal,
    nextAction,
    checklist,
  };
}

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
