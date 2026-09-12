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
import {
  sanitizeGeneratedRoutine,
  getDeterministicRoutineFallback,
  type GeneratedRoutine,
} from "@/lib/workout-ai-utils";

const generatorInputSchema = z.object({
  mode: z.enum(["optimize", "new"]).default("optimize"),
  goal: z.enum(["hipertrofia", "forca", "definicao", "saude"]).default("hipertrofia"),
  frequency: z.number().min(2).max(6).default(4),
  splitType: z.string().optional(),
  equipment: z.enum(["academia", "condominio", "casa"]).default("academia"),
  focusRestrictions: z.string().optional(),
  clientProvider: z.string().optional(),
  clientApiKey: z.string().optional(),
  clientModel: z.string().optional(),
  clientBaseUrl: z.string().optional(),
});

export interface WorkoutGeneratorResult {
  routine: GeneratedRoutine;
  currentWorkoutsSummary: string[];
  diagnosis: string;
  providerUsed: string;
}

export const generateAiWorkoutRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generatorInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<WorkoutGeneratorResult> => {
    const { supabase, userId } = context;

    // 1. Coletar dados reais do usuário (treinos atuais, exercícios e histórico)
    const { data: currentWorkouts } = await supabase
      .from("workouts")
      .select("id, name, workout_date")
      .eq("user_id", userId)
      .order("name");

    const workoutIds = (currentWorkouts ?? []).map((w: any) => w.id);
    let exercisesByWorkout: Record<string, string[]> = {};

    if (workoutIds.length > 0) {
      const { data: exs } = await supabase
        .from("exercises")
        .select("workout_id, name, position")
        .in("workout_id", workoutIds)
        .order("position");

      (exs ?? []).forEach((e: any) => {
        if (!exercisesByWorkout[e.workout_id]) {
          exercisesByWorkout[e.workout_id] = [];
        }
        exercisesByWorkout[e.workout_id].push(e.name);
      });
    }

    // Coletar histórico recente de sessões (últimas 8)
    const { data: recentSessions } = await supabase
      .from("workout_sessions")
      .select("id, name, completed_at")
      .order("completed_at", { ascending: false })
      .limit(8);

    // Amostra do catálogo de exercícios para a IA preferir nomes conhecidos
    const { data: catalogSample } = await supabase
      .from("exercise_catalog")
      .select("name")
      .limit(60);

    const catalogNames = (catalogSample ?? []).map((c: any) => c.name).join(", ");

    // Montar resumo textual do que o usuário já faz
    const currentWorkoutsSummary = (currentWorkouts ?? []).map((w: any) => {
      const exs = exercisesByWorkout[w.id] ?? [];
      return `${w.name}: ${exs.length > 0 ? exs.join(", ") : "Sem exercícios cadastrados"}`;
    });

    const recentSessionsSummary = (recentSessions ?? []).map(
      (s: any) => `${s.name} (${new Date(s.completed_at).toLocaleDateString("pt-BR")})`
    );

    // 2. Resolver provedor e credenciais de IA (mesclando banco e dados enviados pelo cliente)
    const dbSettings = await fetchAiSettings(supabase, userId);
    const chosenProvider = (data.clientProvider as any) || resolveAiProvider(dbSettings);

    const settings = {
      ...dbSettings,
      provider: chosenProvider,
      groq_api_key: (chosenProvider === "groq" && data.clientApiKey) ? data.clientApiKey : dbSettings.groq_api_key,
      openrouter_api_key: ((chosenProvider === "openrouter" || chosenProvider === "nvidia") && data.clientApiKey) ? data.clientApiKey : dbSettings.openrouter_api_key,
      omniroute_api_key: (chosenProvider === "omniroute" && data.clientApiKey) ? data.clientApiKey : dbSettings.omniroute_api_key,
      groq_model: (chosenProvider === "groq" && data.clientModel) ? data.clientModel : dbSettings.groq_model,
      openrouter_model: (chosenProvider === "openrouter" && data.clientModel) ? data.clientModel : dbSettings.openrouter_model,
      nvidia_model: (chosenProvider === "nvidia" && data.clientModel) ? data.clientModel : dbSettings.nvidia_model,
      custom_model: (chosenProvider === "omniroute" && data.clientModel) ? data.clientModel : dbSettings.custom_model,
      custom_base_url: (chosenProvider === "omniroute" && data.clientBaseUrl) ? data.clientBaseUrl : dbSettings.custom_base_url,
    };

    const provider = resolveAiProvider(settings);
    const apiKey = resolveAiApiKey(provider, settings);
    const model = getTextModel(settings, provider);

    // 3. Montar diagnóstico
    let diagnosis = "";
    if (currentWorkoutsSummary.length > 0) {
      diagnosis = `Detectados ${currentWorkoutsSummary.length} treinos ativos (${currentWorkoutsSummary.length} divisões). Histórico com ${recentSessionsSummary.length} sessões recentes registradas.`;
    } else {
      diagnosis = "Nenhum treino anterior encontrado. A IA montará uma estrutura ideal do zero baseada no seu objetivo.";
    }

    if (!apiKey && provider !== "omniroute") {
      // Sem chave configurada: retornar rotina determinística padrão rica e fundamentada
      return {
        routine: getDeterministicRoutineFallback(),
        currentWorkoutsSummary,
        diagnosis: `${diagnosis} (Modo Offline: gerado pelo motor biomecânico padrão).`,
        providerUsed: "fallback_determinístico",
      };
    }

    // 4. Prompt estruturado com instruções fisiológicas
    const systemPrompt = `Você é um treinador esportivo de elite e fisiologista do exercício especializado em hipertrofia e força.
Sua missão é gerar ou otimizar a divisão de treinos do usuário.

REGRAS OBRIGATÓRIAS:
1. Responda EXCLUSIVAMENTE em formato JSON puro, sem textos adicionais antes ou depois, seguindo esta estrutura exata:
{
  "title": "Nome da Rotina Otimizada",
  "description": "Breve explicação do porquê dessa divisão",
  "split_type": "BCDA",
  "weekly_frequency": 4,
  "workouts": [
    {
      "letter": "B",
      "name": "Treino B - Costas e Bíceps",
      "focus": "Foco do treino",
      "exercises": [
        {
          "name": "Puxada Frontal",
          "sets": 4,
          "reps_range": "8-10",
          "rest_seconds": 75,
          "muscle_group": "Costas",
          "notes": "Dica de execução rápida"
        }
      ]
    }
  ],
  "coach_tips": [
    "Dica 1 de periodização e progressão",
    "Dica 2 de recuperação e cadência"
  ]
}

DIRETRIZES DE TREINO:
- Mantenha entre 4 e 6 exercícios por sessão (volume ideal para máxima intensidade sem perda de qualidade).
- Compostos pesados primeiro (descanso 75-90s).
- Isoladores e máquinas no final (descanso 45-60s).
- Se o modo for "optimize", PRESERVE os exercícios principais que o usuário já faz no histórico, aprimorando repetições, ordem e preenchendo eventuais lacunas musculares.
- Prefira nomes padronizados presentes no catálogo: ${catalogNames || "Supino, Puxada, Agachamento, Leg Press, Elevação Lateral, Rosca Direta, Tríceps Pulley"}.`;

    const userPrompt = `MODO: ${data.mode === "optimize" ? "Otimizar Meus Treinos Atuais" : "Criar Nova Divisão Sob Medida"}
OBJETIVO: ${data.goal}
FREQUÊNCIA DESEJADA: ${data.frequency} dias por semana
EQUIPAMENTO: ${data.equipment}
FOCO / RESTRIÇÕES DO USUÁRIO: ${data.focusRestrictions || "Nenhuma restrição informada."}

TREINOS ATUAIS CADASTRADOS:
${currentWorkoutsSummary.length > 0 ? currentWorkoutsSummary.join("\n") : "Nenhum treino prévio."}

ÚLTIMAS SESSÕES REALIZADAS:
${recentSessionsSummary.length > 0 ? recentSessionsSummary.join("\n") : "Sem sessões recentes."}

Gere o JSON da rotina completa agora.`;

    try {
      const response = await callAiChatCompletion({
        provider,
        apiKey,
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 3000,
        baseUrl: settings.omniroute_base_url,
      });

      const rawText = response?.choices?.[0]?.message?.content || "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const sanitized = sanitizeGeneratedRoutine(parsed);
        return {
          routine: sanitized,
          currentWorkoutsSummary,
          diagnosis,
          providerUsed: `${provider} (${model})`,
        };
      } else {
        throw new Error("Resposta da IA não continha JSON válido.");
      }
    } catch (err: any) {
      console.error("Erro ao chamar IA de treino, acionando fallback determinístico:", err?.message || err);
      return {
        routine: getDeterministicRoutineFallback(),
        currentWorkoutsSummary,
        diagnosis: `${diagnosis} (Falha na conexão com ${provider}: gerado pelo motor biomecânico padrão).`,
        providerUsed: "fallback_determinístico",
      };
    }
  });
