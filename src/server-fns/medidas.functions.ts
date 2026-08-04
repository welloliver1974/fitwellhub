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

type AnalysisConfidence = "baixa" | "media" | "alta";

function getConfidence(measurementsCount: number, workoutsCount: number): AnalysisConfidence {
  if (measurementsCount >= 6 && workoutsCount >= 4) return "alta";
  if (measurementsCount >= 3 && workoutsCount >= 2) return "media";
  return "baixa";
}

export const analyzeMeasurements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const settings = await fetchAiSettings(supabase, userId);
    const provider = resolveAiProvider(settings);
    const apiKey = resolveAiApiKey(settings, provider);
    if (!apiKey) throw new Error("Configure uma chave de IA nas configuracoes.");

    // 1. Fetch body measurements
    const { data: measurements } = await supabase
      .from("body_measurements")
      .select("log_date, label, value_cm")
      .eq("user_id", userId)
      .order("log_date", { ascending: true });

    // 2. Fetch completed workout sessions from the last 30 days
    const thirtyDaysAgo = getLocalDateMinusDays(30);
    const { data: workoutsData } = await supabase
      .from("workout_sessions")
      .select(`
        id, 
        name, 
        completed_at,
        workout_session_sets (
          id, 
          exercise_name, 
          reps, 
          weight_kg
        )
      `)
      .eq("user_id", userId)
      .gte("completed_at", thirtyDaysAgo + "T00:00:00")
      .order("completed_at", { ascending: true });

    // Format Measurements
    let measurementsText = "Nenhuma medida registrada.";
    if (measurements && measurements.length > 0) {
      // Group by label to show evolution
      const groups = new Map<string, any[]>();
      for (const m of measurements) {
        if (!groups.has(m.label)) groups.set(m.label, []);
        groups.get(m.label)!.push(m);
      }
      
      const lines = [];
      for (const [label, entries] of groups.entries()) {
        const first = entries[0];
        const last = entries[entries.length - 1];
        if (entries.length === 1) {
          lines.push(`- ${label}: ${last.value_cm}cm (em ${last.log_date})`);
        } else {
          const diff = last.value_cm - first.value_cm;
          const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
          lines.push(`- ${label}: de ${first.value_cm}cm (${first.log_date}) para ${last.value_cm}cm (${last.log_date}). Evolução: ${diffStr}cm.`);
        }
      }
      measurementsText = lines.join("\n");
    }

    // Format Workouts Summary
    let workoutsText = "Nenhum treino registrado nos últimos 30 dias.";
    if (workoutsData && workoutsData.length > 0) {
      const wCount = workoutsData.length;
      const workoutNames = [...new Set(workoutsData.map(w => w.name))].join(", ");
      workoutsText = `Total de treinos nos últimos 30 dias: ${wCount}.\nTipos de treino frequentes: ${workoutNames}.`;
    }

    const systemPrompt = `Você é um analista de evolução física especializado em antropometria. Você transforma dados brutos de medidas corporais em um diagnóstico direto e preciso.

Sua análise:
1. **Direção geral**: o corpo está perdendo medidas (emagrecimento), ganhando (hipertrofia) ou estabilizado?
2. **Destaques**: mencione nominalmente os 2-3 locais com maior variação positiva ou negativa
3. **Correlação com treinos**: se houver dados de treino, cruze os exercícios mais frequentes com as medidas correspondentes
4. **Termômetro**: uma frase-veredito final do tipo "Seu corpo está respondendo bem à estratégia atual"

Markdown limpo. Tom de profissional de avaliação física — não de coach de internet. Máximo de 4 parágrafos.`;

    const userPrompt = `Paciente — Evolução de Medidas:

${measurementsText}

Registro de Treinos (últimos 30 dias):
${workoutsText}

Analise a evolução física.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const json = await callAiChatCompletion({
      provider,
      apiKey,
      model: getTextModel(provider, settings),
      messages,
      temperature: 0.4,
      maxTokens: 1024,
      baseUrl: settings.omniroute_base_url,
    });
    const analysis = json.choices[0].message.content as string;
    const confidence = getConfidence(measurements?.length ?? 0, workoutsData?.length ?? 0);
    const latestMeasurement = measurements && measurements.length > 0 ? measurements[measurements.length - 1] : null;
    const previousMeasurement = measurements && measurements.length > 1 ? measurements[measurements.length - 2] : null;

    let nextAction = "Registre uma nova medida nos próximos 7 dias para acompanhar a tendência com mais segurança.";
    if (latestMeasurement && previousMeasurement && latestMeasurement.label === previousMeasurement.label) {
      const diff = Number(latestMeasurement.value_cm) - Number(previousMeasurement.value_cm);
      if (diff > 0.5) {
        nextAction = `Mantenha a progressão e observe se ${latestMeasurement.label.toLowerCase()} continua subindo nas próximas medições.`;
      } else if (diff < -0.5) {
        nextAction = `Boa queda em ${latestMeasurement.label.toLowerCase()}; repita a medição em 7 dias para confirmar a tendência.`;
      } else {
        nextAction = `A tendência de ${latestMeasurement.label.toLowerCase()} está estável; vale revisar treino, sono e alimentação.`;
      }
    }

    const sources = [
      `${measurements?.length ?? 0} medições registradas`,
      `${workoutsData?.length ?? 0} treinos nos últimos 30 dias`,
    ];
    if (latestMeasurement) {
      sources.push(`Última medida: ${latestMeasurement.label} em ${latestMeasurement.log_date}`);
    }

    return {
      analysis,
      snapshot: {
        confidence,
        nextAction,
        sources,
      },
    };
  });

const compareSchema = z.object({
  dateA: z.string().trim().min(1),
  dateB: z.string().trim().min(1),
});

export const compareMeasurementsWithAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => compareSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { dateA, dateB } = data;
    const { supabase, userId } = context;
    const settings = await fetchAiSettings(supabase, userId);
    const provider = resolveAiProvider(settings);
    const apiKey = resolveAiApiKey(settings, provider);
    if (!apiKey) throw new Error("Configure uma chave de IA nas configuracoes.");

    // 1. Buscar medidas para as duas datas
    const { data: measurements } = await supabase
      .from("body_measurements")
      .select("log_date, label, value_cm")
      .eq("user_id", userId)
      .in("log_date", [dateA, dateB])
      .order("log_date", { ascending: true });

    // 2. Buscar peso na data A (ou mais próximo anterior)
    const { data: weightAData } = await supabase
      .from("body_weights")
      .select("weight_kg, log_date")
      .eq("user_id", userId)
      .lte("log_date", dateA)
      .order("log_date", { ascending: false })
      .limit(1);

    // 3. Buscar peso na data B (ou mais próximo anterior)
    const { data: weightBData } = await supabase
      .from("body_weights")
      .select("weight_kg, log_date")
      .eq("user_id", userId)
      .lte("log_date", dateB)
      .order("log_date", { ascending: false })
      .limit(1);

    const weightA = weightAData && weightAData.length > 0 ? Number(weightAData[0].weight_kg) : null;
    const weightADate = weightAData && weightAData.length > 0 ? weightAData[0].log_date : null;

    const weightB = weightBData && weightBData.length > 0 ? Number(weightBData[0].weight_kg) : null;
    const weightBDate = weightBData && weightBData.length > 0 ? weightBData[0].log_date : null;

    // 4. Formatar os dados para a IA
    // Agrupar medidas por label, depois comparar dateA e dateB
    const measurementsMap = new Map<string, { valA?: number; valB?: number }>();
    if (measurements) {
      for (const m of measurements) {
        if (!measurementsMap.has(m.label)) {
          measurementsMap.set(m.label, {});
        }
        const valObj = measurementsMap.get(m.label)!;
        if (m.log_date === dateA) {
          valObj.valA = Number(m.value_cm);
        } else if (m.log_date === dateB) {
          valObj.valB = Number(m.value_cm);
        }
      }
    }

    const lines: string[] = [];
    for (const [label, vals] of measurementsMap.entries()) {
      const aStr = vals.valA !== undefined ? `${vals.valA.toFixed(1)} cm` : "não registrado";
      const bStr = vals.valB !== undefined ? `${vals.valB.toFixed(1)} cm` : "não registrado";
      
      let diffStr = "";
      if (vals.valA !== undefined && vals.valB !== undefined) {
        const diff = vals.valB - vals.valA;
        diffStr = ` (Variação: ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} cm)`;
      }
      lines.push(`- ${label}: de ${aStr} em ${dateA} para ${bStr} em ${dateB}${diffStr}`);
    }

    const measurementsText = lines.length > 0 ? lines.join("\n") : "Nenhuma medida registrada nessas datas.";

    const weightAText = weightA ? `${weightA.toFixed(1)} kg${weightADate !== dateA ? ` (registrado mais próximo em ${weightADate})` : ""}` : "não registrado";
    const weightBText = weightB ? `${weightB.toFixed(1)} kg${weightBDate !== dateB ? ` (registrado mais próximo em ${weightBDate})` : ""}` : "não registrado";
    
    let weightDiffText = "";
    if (weightA && weightB) {
      const wDiff = weightB - weightA;
      weightDiffText = ` (Variação de peso: ${wDiff >= 0 ? "+" : ""}${wDiff.toFixed(1)} kg)`;
    }

    const systemPrompt = `Você é um analista de evolução corporal especializado em comparação temporal de medidas antropométricas. Seu foco é detectar a direção real da mudança entre duas datas — sem achismo.

Estrutura obrigatória:

1. **Balanço Geral**: o peso mudou? E as medidas? O paciente está em emagrecimento, recomposição ou hipertrofia no período analisado?
2. **Análise por Região**: divida entre medidas de gordura (cintura, quadril, pochete) e medidas musculares (braços, coxas, peito, ombros). A direção é consistente ou conflitante?
3. **Simetria**: compare D/E sempre que houver dados — diferenças > 5% merecem destaque
4. **Veredito**: resposta direta: "O paciente está evoluindo conforme o esperado" ou "Há sinais de estagnação/desvio de estratégia"

Tom de avaliador físico de alto nível — técnico, preciso, sem firulas. Markdown limpo. Máximo de 4 parágrafos.`;

    const userPrompt = `Análise entre duas datas:

### Período de Comparação:
- Data Base (A): ${dateA} (Peso: ${weightAText})
- Data Comparação (B): ${dateB} (Peso: ${weightBText})${weightDiffText}

### Comparativo de Medidas Corporais:
${measurementsText}

Qual é o diagnóstico evolutivo deste período?`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const json = await callAiChatCompletion({
      provider,
      apiKey,
      model: getTextModel(provider, settings),
      messages,
      temperature: 0.4,
      maxTokens: 1024,
      baseUrl: settings.omniroute_base_url,
    
    });
    const analysis = json.choices[0].message.content as string;
    return { analysis };
  });

