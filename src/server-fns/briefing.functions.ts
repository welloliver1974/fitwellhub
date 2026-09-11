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
import { fetchUserContext } from "@/server-fns/chat.functions";
import { getLocalDate, getLocalDateMinusDays } from "@/lib/utils";
import {
  generateDeterministicBriefing,
  getPeriodOfDay,
  type BriefingResult,
  type DayPeriod,
} from "@/lib/briefing-utils";

const briefingSchema = z.object({
  period: z.enum(["manha", "tarde", "noite"]).optional(),
  workoutName: z.string().nullable().optional(),
  hasWorkoutToday: z.boolean().optional(),
  caloriesConsumed: z.number().optional(),
  caloriesGoal: z.number().optional(),
  proteinConsumed: z.number().optional(),
  proteinGoal: z.number().optional(),
  waterMl: z.number().optional(),
  waterGoal: z.number().optional(),
});

export const getDailyBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => briefingSchema.parse(data))
  .handler(async ({ data, context }): Promise<BriefingResult> => {
    const { supabase, userId } = context;
    const today = getLocalDate();
    const weekAgo = getLocalDateMinusDays(7);
    const period: DayPeriod = data.period || getPeriodOfDay();

    // 1. Obter nome do usuário via claims do token de auth
    const fullName: string = (context.claims as any)?.user_metadata?.full_name || (context.claims as any)?.email || "Guerreiro";
    const userName = fullName.split(" ")[0];

    const deterministic = generateDeterministicBriefing({
      period,
      userName,
      workoutName: data.workoutName,
      hasWorkoutToday: data.hasWorkoutToday,
      caloriesConsumed: data.caloriesConsumed,
      caloriesGoal: data.caloriesGoal,
      proteinConsumed: data.proteinConsumed,
      proteinGoal: data.proteinGoal,
      waterMl: data.waterMl,
      waterGoal: data.waterGoal,
    });

    // 2. Tentar gerar com IA se provedor e chave estiverem configurados
    try {
      const settings = await fetchAiSettings(supabase, userId);
      const provider = resolveAiProvider(settings);
      const apiKey = resolveAiApiKey(settings, provider);

      if (!apiKey) {
        return deterministic;
      }

      const model = getTextModel(provider, settings);
      const userContext = await fetchUserContext(supabase, userId, today, weekAgo);

      const systemPrompt = `Você é o Coach IA do aplicativo FitWell Hub.
Sua missão é dar um Daily Briefing curto, acolhedor e direto ao ponto para o usuário (${userName}) no período da: ${period}.
Dados do dia:
- Calorias hoje: ${data.caloriesConsumed ?? 0} de ${data.caloriesGoal ?? 2000} kcal
- Proteínas hoje: ${data.proteinConsumed ?? 0}g de ${data.proteinGoal ?? 140}g
- Água hoje: ${data.waterMl ?? 0}ml de ${data.waterGoal ?? 2500}ml
- Treino planejado: ${data.workoutName || "Nenhum específico"}
- Treino concluído hoje: ${data.hasWorkoutToday ? "Sim" : "Não"}

INSTRUÇÃO DE FORMATO:
Responda EXCLUSIVAMENTE em formato JSON com as chaves:
{
  "title": "Frase curta de saudação com emoji (ex: Bom dia, Well! 🌅)",
  "message": "Máximo de 2 frases objetivas e motivadoras orientando a próxima ação prática no app.",
  "actionText": "Texto do botão (ex: Ver treino de hoje | Registrar ceia | Ver metas)",
  "actionLink": "Rota do app (ex: /app/treinos | /app/nutricao | /app/chat)"
}`;

      const response = await callAiChatCompletion({
        provider,
        apiKey,
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Gere meu daily briefing agora." },
        ],
        temperature: 0.6,
        maxTokens: 250,
        baseUrl: provider === "omniroute" ? settings.omniroute_base_url : undefined,
      });

      const content = response.choices?.[0]?.message?.content?.trim() || "";
      // Limpeza de possíveis blocos de markdown ```json ... ```
      const cleanedJson = content.replace(/^```json/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleanedJson);

      if (parsed && parsed.title && parsed.message) {
        return {
          period,
          title: parsed.title,
          message: parsed.message,
          actionText: parsed.actionText || deterministic.actionText,
          actionLink: parsed.actionLink || deterministic.actionLink,
        };
      }
    } catch (err) {
      console.warn("Daily briefing via IA falhou, usando deterministic fallback:", err);
    }

    return deterministic;
  });
