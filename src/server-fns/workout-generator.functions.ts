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

export const generateAiWorkoutRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generatorInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<WorkoutGeneratorResult> => {
    const { supabase, userId } = context;
    const today = getLocalDate();
    const twentyEightDaysAgo = getLocalDateMinusDays(28);

    // 1. Coletar dados reais 360 do usuário em paralelo
    const [
      { data: currentWorkouts },
      { data: recentSessions },
      { data: catalogSample },
      { data: profile },
      { data: weights },
      { data: goals },
      { data: todayMeals },
      { data: waterLogs },
      { data: workouts28d },
    ] = await Promise.all([
      supabase
        .from("workouts")
        .select("id, name, workout_date")
        .eq("user_id", userId)
        .order("name"),
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
        .limit(6),
      supabase
        .from("exercise_catalog")
        .select("name")
        .limit(60),
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
    ]);

    // Mapear exercícios atuais
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

    // Amostra do catálogo de exercícios
    const catalogNames = (catalogSample ?? []).map((c: any) => c.name).join(", ");

    // Montar resumo textual do que o usuário já faz
    const currentWorkoutsSummary = (currentWorkouts ?? []).map((w: any) => {
      const exs = exercisesByWorkout[w.id] ?? [];
      return `${w.name}: ${exs.length > 0 ? exs.join(", ") : "Sem exercícios cadastrados"}`;
    });

    // Montar resumo do histórico recente com cargas
    const recentSessionsSummary = (recentSessions ?? []).map((s: any) => {
      const dateStr = s.completed_at
        ? new Date(s.completed_at).toLocaleDateString("pt-BR")
        : "recente";
      const sets = s.workout_session_sets ?? [];
      const exMap = new Map<string, { reps: number; weight: number }>();
      for (const set of sets) {
        if (!exMap.has(set.exercise_name)) {
          exMap.set(set.exercise_name, { reps: Number(set.reps || 0), weight: Number(set.weight_kg || 0) });
        } else {
          const cur = exMap.get(set.exercise_name)!;
          if (Number(set.weight_kg || 0) > cur.weight) {
            cur.weight = Number(set.weight_kg || 0);
            cur.reps = Number(set.reps || 0);
          }
        }
      }
      const topExs = Array.from(exMap.entries())
        .slice(0, 4)
        .map(([name, data]) => `${name} (${data.weight}kg x ${data.reps}reps)`)
        .join("; ");
      return `${s.name} (${dateStr}): ${topExs || "sem cargas detalhadas"}`;
    });

    // 2. Extrair dados fisiológicos, antropométricos e metabólicos (TMB + TDEE)
    const claims = (context as any).claims;
    const rawName =
      profile?.display_name?.trim() ||
      claims?.user_metadata?.full_name ||
      claims?.user_metadata?.display_name ||
      claims?.user_metadata?.name ||
      "Atleta";
    const displayName = rawName.trim().split(" ")[0];
    const height = profile?.height_cm ? Number(profile.height_cm) : null;
    const age = profile?.birth_date ? calculateAge(profile.birth_date) : null;
    const sex = profile?.sex || null;
    const latestWeight = weights && weights.length > 0 ? Number(weights[0].weight_kg) : null;

    let bmr: number | null = null;
    let tdee: number | null = null;

    if (latestWeight && height && age) {
      if (sex === "female") {
        bmr = Math.round(10 * latestWeight + 6.25 * height - 5 * age - 161);
      } else {
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

    // Nutrição e hidratação
    let todayKcal = 0;
    let todayProtein = 0;
    const mealIds = (todayMeals ?? []).map((m: any) => m.id);
    if (mealIds.length > 0) {
      const { data: items } = await supabase
        .from("meal_items")
        .select("calories, protein_g")
        .in("meal_id", mealIds);
      (items ?? []).forEach((item: any) => {
        todayKcal += Number(item.calories || 0);
        todayProtein += Number(item.protein_g || 0);
      });
    }

    const todayWater = (waterLogs ?? []).reduce(
      (sum: number, w: any) => sum + Number(w.ml || 0),
      0
    );

    const targetKcal = goals?.calories ?? 2000;
    const targetProtein = goals?.protein_g ?? 140;

    let energyBalance = "Manutenção Energética / Recomposição Corporal";
    if (tdee) {
      const diff = targetKcal - tdee;
      if (diff <= -250) {
        energyBalance = `Déficit Calórico (~${Math.abs(Math.round(diff))} kcal abaixo do gasto diário: TDEE ${tdee} kcal vs Meta ${targetKcal} kcal) — Foco: Manter carga alta com menor volume de séries (12-14 séries/sessão) para preservar massa magra sem fadiga excessiva do SNC`;
      } else if (diff >= 200) {
        energyBalance = `Superávit Calórico (~+${Math.round(diff)} kcal acima do gasto diário: TDEE ${tdee} kcal vs Meta ${targetKcal} kcal) — Plena disponibilidade de glicogênio para suportar volume ideal de hipertrofia (15-18 séries/sessão) e sobrecarga progressiva`;
      }
    }

    // 3. Resolver provedor e credenciais de IA (mesclando banco e dados enviados pelo cliente)
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

    // Montar diagnóstico
    let diagnosis = "";
    if (currentWorkoutsSummary.length > 0) {
      diagnosis = `Detectados ${currentWorkoutsSummary.length} treinos ativos (${currentWorkoutsSummary.length} divisões). Histórico com ${recentSessionsSummary.length} sessões. Calibrado para ${displayName} (${latestWeight ? `${latestWeight}kg` : "peso atual"}, TMB ${bmr || 1800}kcal, TDEE ${tdee || 2400}kcal).`;
    } else {
      diagnosis = `Montando rotina sob medida para ${displayName} (${latestWeight ? `${latestWeight}kg` : "peso atual"}, TMB ${bmr || 1800}kcal, TDEE ${tdee || 2400}kcal).`;
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

    // 4. Prompt estruturado com instruções fisiológicas de elite
    const systemPrompt = `Você é um Mestre em Fisiologia do Exercício, Biomecânica Aplicada e Treinador de Força & Hipertrofia de Elite com mais de 15 anos de experiência prática em sala de musculação e total domínio da literatura científica contemporânea (Schoenfeld, Israetel, Beardsley, Renaissance Periodization).

Sua missão é prescrever ou otimizar uma rotina de treinos hiper-eficiente, segura e estritamente calibrada para a fisiologia, nutrição e capacidade de recuperação deste atleta específico.

FORMATO DE SAÍDA OBRIGATÓRIO:
Responda ESTRITAMENTE com um objeto JSON válido, sem texto introdutório, sem explicações antes ou depois, sem blocos de texto fora das chaves, seguindo esta estrutura exata:
{
  "title": "Nome da Rotina de Elite (ex: Divisão BCDA Otimizada de Alta Densidade)",
  "description": "Explicação fisiológica concisa (2-3 frases) conectando o estímulo ao balanço energético, recuperação neuromuscular e hipertrofia.",
  "split_type": "BCDA",
  "weekly_frequency": 4,
  "workouts": [
    {
      "letter": "B",
      "name": "Treino B - Costas, Bíceps e Trapézio",
      "focus": "Largura/Espessura de Dorsais e Flexores de Cotovelo",
      "exercises": [
        {
          "name": "Puxada Frontal Aberta",
          "sets": 4,
          "reps_range": "8-10",
          "rest_seconds": 90,
          "muscle_group": "Costas",
          "notes": "Pausa de 1s na contração máxima; controle a descida em 2 a 3s mantendo escápulas ativas."
        }
      ]
    }
  ],
  "coach_tips": [
    "Sobrecarga Progressiva Dupla: suba a carga em 1-2kg apenas após alcançar o teto de repetições em todas as séries com execução impecável.",
    "Gestão de Fadiga e Esforço: treine a maioria das séries a RIR 1-2 (1 a 2 repetições da falha), reservando a falha concêntrica apenas para a última série de isoladores.",
    "Hidratação e Nutrição: beba ao menos 500-750ml de água durante o treino e garanta sua ingestão proteica diária para apoiar a síntese proteica pós-estímulo."
  ]
}

PRINCÍPIOS FISIOLÓGICOS E BIOMECÂNICOS DE ELITE:
1. ORDEM DO ESFORÇO E FADIGA DO SNC:
   - Os exercícios compostos pesados e multiarticulares de maior demanda neural (ex: Supino, Agachamento, Leg Press, Puxada, Remada Curvada/Apoiada) DEVEM abrir a sessão quando o sistema neuromuscular está 100% descansado.
   - Exercícios isoladores em cabos e máquinas entram na segunda metade para estresse metabólico seguro sem risco de colapso de estabilizadores.
2. VOLUME EFETIVO E CALIBRAÇÃO METABÓLICA (ANTI-JUNK VOLUME):
   - Mantenha exatamente entre 4 e 6 exercícios por sessão (volume ideal entre 14 e 18 séries totais de trabalho por treino). Mais do que isso gera 'junk volume' e eleva o estresse sistêmico sem ganho muscular adicional.
   - Se o atleta estiver em Déficit Calórico, calibre o volume para a faixa inferior (12-14 séries) para proteger contra perda muscular e burnout do SNC.
   - Grupos grandes: 3 a 4 séries por exercício. Grupos pequenos (Bíceps, Tríceps, Deltoide Lateral/Posterior): 3 séries cirúrgicas.
3. CURVA DE RESISTÊNCIA E HIPERTROFIA MEDIADA POR ALONGAMENTO:
   - Combine movimentos que desafiam o músculo na posição alongada (ex: Supino com halteres, Puxada alta, Stiff/RDL, Tríceps na polia acima da cabeça) com exercícios de pico de contração (ex: Crossover, Remada baixa, Cadeira extensora).
4. DESCANSO ENTRE SÉRIES (RECUPERAÇÃO DE ATP-CP):
   - Compostos pesados: descanso de 75 a 120 segundos (recuperação completa de fosfagênios para sustentar carga alta).
   - Isoladores e máquinas: descanso de 45 a 60 segundos.
5. SINERGIA ENTRE DIAS E PREVENÇÃO DE OVERTRAINING:
   - Respeite a divisão do usuário. Se a sequência for B (Costas) -> C (Pernas) -> D (Ombros) -> A (Peito/Tríceps), garanta que deltoides anteriores e tríceps não fiquem exaustos na véspera do Treino A de Peito.
   - No modo 'optimize', PRESERVE os exercícios principais que o atleta já executa com boa adesão, refinando ordem, descansos e preenchendo lacunas de cabeças musculares desatendidas.
6. NOTAS DE EXECUÇÃO CIRÚRGICAS (CAMPO NOTES):
   - Cada exercício DEVE conter uma instrução prática de biomecânica (ex: ângulo do cotovelo, cadência excêntrica, alinhamento articular, prevenção de impulso).
7. NOMENCLATURA PADRONIZADA:
   - Prefira nomes em português padronizados presentes no catálogo da academia: ${catalogNames || "Supino Reto com Barra, Puxada Frontal, Leg Press 45, Cadeira Extensora, Elevação Lateral, Rosca Direta, Tríceps Pulley"}.`;

    const userPrompt = `DADOS BIOLÓGICOS, METABÓLICOS E NUTRICIONAIS DO ATLETA:
- Nome: ${displayName}
- Idade: ${age ? `${age} anos` : "Não informada"} | Sexo: ${sex === "female" ? "Feminino" : sex === "male" ? "Masculino" : "Não informado"} | Altura: ${height ? `${height} cm` : "Não informada"}
- Peso Atual: ${latestWeight ? `${latestWeight} kg` : "Não informado"}
- Taxa Metabólica Basal (TMB): ${bmr ? `${bmr} kcal/dia` : "Não calculada"}
- Gasto Energético Total Diário (TDEE): ${tdee ? `${tdee} kcal/dia` : "Não calculado"} (Média de ~${((workouts28d?.length ?? 0) / 4).toFixed(1)} treinos/semana nos últimos 28 dias)
- Balanço Energético Atual: ${energyBalance}
- Metas Diárias: ${targetKcal} kcal | ${targetProtein}g de proteína (${latestWeight ? (targetProtein / latestWeight).toFixed(1) : "2.0"} g/kg)
- Ingestão Registrada Hoje: ${Math.round(todayKcal)} kcal, ${Math.round(todayProtein)}g proteína, ${Math.round(todayWater)} ml de água

PREFERÊNCIAS DA ROTINA SOLICITADA:
- MODO: ${data.mode === "optimize" ? "Otimizar Meus Treinos Atuais (Refinar biomecânica, ordem e lacunas, preservando a base que já executo)" : "Criar Nova Divisão Sob Medida (Periodização completa do zero)"}
- OBJETIVO PRINCIPAL: ${data.goal.toUpperCase()}
- FREQUÊNCIA SEMANAL: ${data.frequency} dias por semana
- AMBIENTE / EQUIPAMENTOS: ${data.equipment.toUpperCase()}
- FOCO ESPECÍFICO / RESTRIÇÕES / LIMITAÇÕES: ${data.focusRestrictions || "Nenhuma restrição ou limitação física informada."}

TREINOS ATUAIS CADASTRADOS NO APP:
${currentWorkoutsSummary.length > 0 ? currentWorkoutsSummary.join("\n") : "Nenhum treino prévio cadastrado."}

HISTÓRICO RECENTE DE SESSÕES E CARGAS MÁXIMAS REGISTRADAS:
${recentSessionsSummary.length > 0 ? recentSessionsSummary.join("\n") : "Sem sessões recentes registradas."}

Prescreva agora a rotina de treinos completa de nível elite em formato JSON puro, levando em consideração todos esses dados biológicos e metabólicos do atleta.`;

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
        maxTokens: 3500,
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
