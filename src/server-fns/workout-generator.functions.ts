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

    // 4. Prompt estruturado com instruções fisiológicas de elite
    const systemPrompt = `Você é um Mestre em Fisiologia do Exercício, Biomecânica Aplicada e Treinador de Força & Hipertrofia de Elite com mais de 15 anos de experiência prática em sala de musculação e total domínio da literatura científica contemporânea (Schoenfeld, Israetel, Beardsley, Renaissance Periodization).

Sua missão é prescrever ou otimizar uma rotina de treinos hiper-eficiente, segura e baseada em evidências científicas.

FORMATO DE SAÍDA OBRIGATÓRIO:
Responda ESTRITAMENTE com um objeto JSON válido, sem texto introdutório, sem explicações antes ou depois, sem blocos de texto fora das chaves, seguindo esta estrutura exata:
{
  "title": "Nome da Rotina de Elite (ex: Divisão BCDA Otimizada de Alta Densidade)",
  "description": "Explicação fisiológica concisa (2-3 frases) sobre a sinergia dos estímulos, distribuição de volume e recuperação neuromuscular.",
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
    "Hidratação e Recuperação: consuma ao menos 500-750ml de água intra-treino para manter a volemia e o transporte de nutrientes."
  ]
}

PRINCÍPIOS FISIOLÓGICOS E BIOMECÂNICOS DE ELITE:
1. ORDEM DO ESFORÇO E FADIGA DO SNC:
   - Os exercícios compostos pesados e multiarticulares de maior demanda neural (ex: Supino, Agachamento, Leg Press, Puxada, Remada Curvada/Apoiada) DEVEM abrir a sessão quando o sistema neuromuscular está 100% descansado.
   - Exercícios isoladores em cabos e máquinas entram na segunda metade para estresse metabólico seguro sem risco de colapso de estabilizadores.
2. VOLUME EFETIVO E QUALIDADE (ANTI-JUNK VOLUME):
   - Mantenha exatamente entre 4 e 6 exercícios por sessão (volume ideal entre 14 e 18 séries totais de trabalho por treino). Mais do que isso gera 'junk volume' e eleva o estresse sistêmico sem ganho muscular adicional.
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

    const userPrompt = `DADOS DO ATLETA:
- MODO SOLICITADO: ${data.mode === "optimize" ? "Otimizar Meus Treinos Atuais (Refinar biomecânica, ordem e lacunas, preservando a essência que já faço)" : "Criar Nova Divisão Sob Medida (Periodização completa do zero)"}
- OBJETIVO PRINCIPAL: ${data.goal.toUpperCase()}
- FREQUÊNCIA SEMANAL: ${data.frequency} dias por semana
- AMBIENTE / EQUIPAMENTOS: ${data.equipment.toUpperCase()}
- FOCO ESPECÍFICO / RESTRIÇÕES / LIMITAÇÕES: ${data.focusRestrictions || "Nenhuma restrição ou limitação física informada."}

TREINOS ATUAIS CADASTRADOS NO APP:
${currentWorkoutsSummary.length > 0 ? currentWorkoutsSummary.join("\n") : "Nenhum treino prévio cadastrado."}

ÚLTIMAS SESSÕES DE TREINO REALIZADAS PELO ATLETA:
${recentSessionsSummary.length > 0 ? recentSessionsSummary.join("\n") : "Sem sessões recentes registradas."}

Prescreva agora a rotina de treinos completa de nível elite em formato JSON puro.`;

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
