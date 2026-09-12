import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getLocalDate, getLocalDateMinusDays } from "@/lib/utils";
import {
  callAiChatCompletion,
  fetchAiSettings,
  getTextModel,
  resolveAiApiKey,
  resolveAiProvider,
} from "@/server-fns/ai-settings.functions";

const coachInputSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
  routine: z.any().optional(), // Rotina atualmente visível na tela
  userName: z.string().optional(),
  clientProvider: z.string().optional(),
  clientApiKey: z.string().optional(),
  clientModel: z.string().optional(),
  clientBaseUrl: z.string().optional(),
});

function calculateAge(birthDateStr: string): number {
  const birthDate = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export interface WorkoutCoachResponse {
  reply: string;
  providerUsed: string;
  userStats: {
    displayName: string;
    weight: number | null;
    height: number | null;
    age: number | null;
    sex: string | null;
    bmr: number | null;
    tdee: number | null;
    todayKcal: number;
    targetKcal: number;
    todayProtein: number;
    targetProtein: number;
    todayCarbs: number;
    targetCarbs: number;
    todayFat: number;
    targetFat: number;
    todayWater: number;
  };
}

export const consultWorkoutCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => coachInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<WorkoutCoachResponse> => {
    const { supabase, userId } = context;
    const today = getLocalDate();
    const twentyEightDaysAgo = getLocalDateMinusDays(28);

    // 1. Coletar dados 360 do usuário em paralelo
    const [
      { data: profile },
      { data: weights },
      { data: goals },
      { data: todayMeals },
      { data: waterLogs },
      { data: workouts28d },
      { data: recentSessions },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, sex, height_cm, birth_date")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("body_weights")
        .select("weight_kg, log_date")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .limit(3),
      supabase
        .from("goals")
        .select("calories, protein_g, carbs_g, fat_g, protein_factor")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("meals")
        .select("id")
        .eq("user_id", userId)
        .eq("meal_date", today),
      supabase
        .from("water_logs")
        .select("ml")
        .eq("user_id", userId)
        .eq("log_date", today),
      supabase
        .from("workout_sessions")
        .select("id")
        .eq("user_id", userId)
        .gte("completed_at", twentyEightDaysAgo + "T00:00:00"),
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
        .limit(3),
    ]);

    // 2. Extrair dados nutricionais de hoje
    let todayKcal = 0;
    let todayProtein = 0;
    let todayCarbs = 0;
    let todayFat = 0;

    const mealIds = (todayMeals ?? []).map((m: any) => m.id);
    if (mealIds.length > 0) {
      const { data: items } = await supabase
        .from("meal_items")
        .select("calories, protein_g, carbs_g, fat_g")
        .in("meal_id", mealIds);

      (items ?? []).forEach((item: any) => {
        todayKcal += Number(item.calories || 0);
        todayProtein += Number(item.protein_g || 0);
        todayCarbs += Number(item.carbs_g || 0);
        todayFat += Number(item.fat_g || 0);
      });
    }

    // 3. Hidratação de hoje
    const todayWater = (waterLogs ?? []).reduce(
      (sum: number, w: any) => sum + Number(w.ml || 0),
      0
    );

    // 4. Parâmetros antropométricos e metabólicos (TMB + TDEE)
    const claims = (context as any).claims;
    const rawName =
      data.userName?.trim() ||
      profile?.display_name?.trim() ||
      claims?.user_metadata?.full_name ||
      claims?.user_metadata?.display_name ||
      claims?.user_metadata?.name ||
      "Well";
    const displayName = rawName.trim().split(" ")[0];
    const height = profile?.height_cm ? Number(profile.height_cm) : null;
    const age = profile?.birth_date ? calculateAge(profile.birth_date) : null;
    const sex = profile?.sex || null;
    const latestWeight =
      weights && weights.length > 0 ? Number(weights[0].weight_kg) : null;

    let bmr: number | null = null;
    let tdee: number | null = null;

    if (latestWeight && height && age) {
      if (sex === "female") {
        bmr = Math.round(10 * latestWeight + 6.25 * height - 5 * age - 161);
      } else {
        // default male / unspecified
        bmr = Math.round(10 * latestWeight + 6.25 * height - 5 * age + 5);
      }

      const totalWorkouts = workouts28d?.length ?? 0;
      const sessionsPerWeek = totalWorkouts / 4;
      let activityFactor = 1.2;
      if (sessionsPerWeek >= 1 && sessionsPerWeek < 3) {
        activityFactor = 1.375;
      } else if (sessionsPerWeek >= 3 && sessionsPerWeek < 5) {
        activityFactor = 1.55;
      } else if (sessionsPerWeek >= 5) {
        activityFactor = 1.725;
      }
      tdee = Math.round(bmr * activityFactor);
    }

    // 5. Formatar sessões de treino recentes
    let recentWorkoutsSummary = "Nenhum treino registrado recentemente.";
    if (recentSessions && recentSessions.length > 0) {
      const lines = recentSessions.map((s: any) => {
        const dateStr = s.completed_at
          ? s.completed_at.slice(0, 10)
          : "recente";
        const sets = s.workout_session_sets ?? [];
        const exercisesMap = new Map<string, Array<{ reps: number; weight_kg: number }>>();
        for (const set of sets) {
          if (!exercisesMap.has(set.exercise_name)) {
            exercisesMap.set(set.exercise_name, []);
          }
          exercisesMap.get(set.exercise_name)!.push({
            reps: Number(set.reps || 0),
            weight_kg: Number(set.weight_kg || 0),
          });
        }
        const exSummary = Array.from(exercisesMap.entries())
          .map(([name, setList]) => {
            const topSet = setList.reduce(
              (max, cur) => (cur.weight_kg > max.weight_kg ? cur : max),
              setList[0] || { reps: 0, weight_kg: 0 }
            );
            return `${name} (${setList.length} séries, max ${topSet.weight_kg}kg x ${topSet.reps}reps)`;
          })
          .slice(0, 5)
          .join("; ");

        return `• ${s.name} (${dateStr}): ${exSummary || "sem detalhes de séries"}`;
      });
      recentWorkoutsSummary = lines.join("\n");
    }

    // 6. Formatar o treino ativo em tela (se fornecido)
    let screenRoutineSummary = "Nenhuma rotina gerada na tela no momento.";
    if (data.routine) {
      const r = data.routine;
      const splitName = r.split || r.splitName || "Personalizado";
      const wList = r.workouts || [];
      const wDetails = wList
        .map((w: any) => {
          const exList = (w.exercises || [])
            .map(
              (e: any) =>
                `  - ${e.name} (${e.sets || 3}x${e.reps || "8-12"}, descanso ${e.rest_seconds || 90}s${e.rir !== undefined ? `, RIR ${e.rir}` : ""}${e.notes ? ` [${e.notes}]` : ""})`
            )
            .join("\n");
          return `Treino ${w.letter || ""} - ${w.name} (${w.focus || ""}):\n${exList}`;
        })
        .join("\n\n");

      screenRoutineSummary = `Divisão: ${splitName}\nFoco Geral: ${r.focusNotes || r.reasoning || "Hipertrofia & Força"}\n\n${wDetails}`;
    }

    // 7. Contexto consolidado
    const targetKcal = goals?.calories ?? 2000;
    const targetProtein = goals?.protein_g ?? 140;
    const targetCarbs = goals?.carbs_g ?? 220;
    const targetFat = goals?.fat_g ?? 65;

    const systemPrompt = `Você é o Coach FitWell, um renomado Treinador de Força & Fisiologista do Exercício de Elite.
Você está conversando diretamente com ${displayName}, seu aluno/atleta dentro do aplicativo FitWell.

SUA PERSONALIDADE:
- Extremamente humanizado, empático, motivador e cientificamente embasado (referências como Schoenfeld, Israetel, Brad, Helms).
- Converse como um treinador pessoal experiente e parceiro conversando por áudio ou mensagem: tom natural, caloroso e seguro.
- NUNCA use clichês robóticos como "Como uma IA", "Sou um modelo de linguagem", "Certamente, meu caro", "Olá humano", "Como assistente virtual".
- Fale em primeira pessoa ("Analisei aqui", "Recomendo que você...", "Na minha visão").
- Chame o usuário pelo primeiro nome (${displayName}).

DADOS REAIS EM TEMPO REAL DO SEU ALUNO (${displayName}) QUE VOCÊ DEVE USAR NA CONVERSA:
• Fisiologia:
  - Idade: ${age ? `${age} anos` : "não informada"}
  - Sexo: ${sex === "female" ? "Feminino" : sex === "male" ? "Masculino" : "Não informado"}
  - Altura: ${height ? `${height} cm` : "não informada"}
  - Peso Atual: ${latestWeight ? `${latestWeight} kg` : "não informado"}
  - Taxa Metabólica Basal (TMB): ${bmr ? `${bmr} kcal/dia` : "não calculada"}
  - Gasto Energético Total Diário (TDEE): ${tdee ? `${tdee} kcal/dia` : "não calculado"}
  - Frequência Recente de Treinos: ${workouts28d?.length ?? 0} treinos nos últimos 28 dias (~${((workouts28d?.length ?? 0) / 4).toFixed(1)}x/semana).

• Nutrição & Hidratação de Hoje:
  - Calorias: ${Math.round(todayKcal)} kcal consumidas de uma meta de ${targetKcal} kcal (${Math.round((todayKcal / targetKcal) * 100)}%)
  - Proteínas: ${Math.round(todayProtein)}g consumidas de uma meta de ${targetProtein}g
  - Carboidratos: ${Math.round(todayCarbs)}g consumidos de uma meta de ${targetCarbs}g
  - Gorduras: ${Math.round(todayFat)}g consumidas de uma meta de ${targetFat}g
  - Água bebida hoje: ${Math.round(todayWater)} ml (meta recomendada: ~${latestWeight ? Math.round(latestWeight * 35) : 2500} ml)

• Histórico Recente de Treinos & Cargas Registradas:
${recentWorkoutsSummary}

• ROTINA QUE ELE ESTÁ VISUALIZANDO NA TELA NESTE EXATO MOMENTO:
${screenRoutineSummary}

DIRETRIZES DE RESPOSTA:
1. Conecte os pontos: se ele perguntar sobre o treino ou hipertrofia, relacione com a ingestão energética de hoje, a água e a capacidade de recuperação dele.
2. COMPLETUDE OBRIGATÓRIA: Conclua SEMPRE todos os pontos abordados. NUNCA pare no meio de uma frase, tabela ou raciocínio. Sempre finalize com um parágrafo conclusivo e uma chamada para ação direta e motivadora.
3. Se ele pedir para trocar um exercício, dê uma sugestão biomecanicamente compatível (mesmo vetor de força e ênfase muscular) e explique por que a troca funciona bem.
4. Se ele tiver dúvidas sobre séries, descanso ou ordem dos exercícios, explique a lógica de fadiga do sistema nervoso central e hipertrofia em comprimento muscular alongado de forma simples e direta.
5. Mantenha as respostas concisas, escaneáveis e agradáveis (use parágrafos curtos, listas com marcadores se houver exercícios, negrito nos pontos-chave).`;

    // 8. Resolver provedor e credenciais de IA (mesclando banco e dados locais enviados)
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
    let apiKey = resolveAiApiKey(settings, provider);
    if (!apiKey && provider === "groq") {
      apiKey = process.env.GROQ_API_KEY ?? null;
    }
    const model = getTextModel(provider, settings);

    if (!apiKey && provider !== "omniroute") {
      return {
        reply: `Fala, ${displayName}! Sua chave do provedor ${provider.toUpperCase()} não foi encontrada. Vá na aba Configurações de IA (/app/ia), insira sua chave e clique em "Salvar Configurações" para ativarmos nossa conversa.`,
        providerUsed: `${provider} (sem chave)`,
        userStats: {
          displayName,
          weight: latestWeight,
          height,
          age,
          sex,
          bmr,
          tdee,
          todayKcal: Math.round(todayKcal),
          targetKcal,
          todayProtein: Math.round(todayProtein),
          targetProtein,
          todayCarbs: Math.round(todayCarbs),
          targetCarbs,
          todayFat: Math.round(todayFat),
          targetFat,
          todayWater: Math.round(todayWater),
        },
      };
    }

    // 9. Montar histórico de mensagens para a IA
    const apiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    (data.history || []).slice(-6).forEach((h) => {
      apiMessages.push({
        role: h.role as "user" | "assistant",
        content: h.content,
      });
    });

    apiMessages.push({
      role: "user",
      content: data.message,
    });

    let reply = "";
    try {
      const response = await callAiChatCompletion({
        provider,
        apiKey: apiKey || "",
        model,
        messages: apiMessages,
        temperature: 0.7,
        maxTokens: 2000,
        baseUrl: settings.custom_base_url || settings.omniroute_base_url,
      });

      const rawContent = response?.choices?.[0]?.message?.content;
      if (typeof rawContent === "string" && rawContent.trim()) {
        reply = rawContent.trim();
        if (response?.choices?.[0]?.finish_reason === "length") {
          reply += "\n\n*(Pausa tática: me mande 'continua' se quiser que eu aprofunde ainda mais algum detalhe!)*";
        }
      } else if (response?.error?.message) {
        throw new Error(response.error.message);
      } else {
        throw new Error("Resposta da IA sem texto legível.");
      }
    } catch (err: any) {
      console.error("[WorkoutCoach] Erro ao chamar IA:", err);
      const errMsg = err?.message || String(err);
      reply = `Fala, ${displayName}! Tive um retorno inesperado ao conectar com a IA (${provider} - ${model}): "${errMsg}".\n\nPor favor, confira o modelo e a chave na aba /app/ia no botão "Testar Conexão e Modelo 🧪".`;
    }

    return {
      reply,
      providerUsed: `${provider} (${model})`,
      userStats: {
        displayName,
        weight: latestWeight,
        height,
        age,
        sex,
        bmr,
        tdee,
        todayKcal: Math.round(todayKcal),
        targetKcal,
        todayProtein: Math.round(todayProtein),
        targetProtein,
        todayCarbs: Math.round(todayCarbs),
        targetCarbs,
        todayFat: Math.round(todayFat),
        targetFat,
        todayWater: Math.round(todayWater),
      },
    };
  });
