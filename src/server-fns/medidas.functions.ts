import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getLocalDate } from "@/lib/utils";
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
    const thirtyDaysAgo = getLocalDate(new Date(Date.now() - 30 * 86400000));
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

    const systemPrompt = `Você é um Personal Trainer e Coach de Nutrição altamente especializado e encorajador.
Sua tarefa é cruzar os dados de Medidas Corporais do usuário com a rotina de Treinos dele (dos últimos 30 dias).
Gere uma análise rápida, direta e motivadora. 
Destaque pontos positivos (ex: "sua cintura diminuiu, mostrando perda de gordura" ou "seus braços aumentaram, ótimo trabalho de hipertrofia!").
Se não houver muitos dados de treino, foque apenas nas medidas. Use formato Markdown, com listas ou negrito onde fizer sentido. Seja conciso (máximo de 3 parágrafos curtos).`;

    const userPrompt = `Aqui estão meus dados:
### Medidas Corporais (Evolução):
${measurementsText}

### Meus Treinos (Últimos 30 dias):
${workoutsText}

Por favor, faça uma análise da minha evolução física.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const json = await callAiChatCompletion({
      provider,
      apiKey,
      model: getTextModel(provider, settings),
      messages,
      temperature: 0.7,
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

    const systemPrompt = `Você é um Personal Trainer e Coach de Nutrição altamente especializado e focado em recomposição corporal.
Sua tarefa é analisar a evolução de todas as medidas corporais e pesos de um usuário entre duas datas específicas.

Orientações de análise:
1. Avalie a variação do peso corporal em relação às mudanças das medidas de gordura (Cintura, Quadril, Pochete) e massa muscular (Braços, Ombros, Peito, Coxas, Panturrilhas).
2. Explique se a evolução representa queima de gordura, ganho de massa muscular ou recomposição corporal.
3. Compare a simetria corporal (ex: diferença de evolução entre braço esquerdo e direito, ou coxa esquerda e direita) caso esses dados estejam disponíveis nas duas datas.
4. Mantenha a resposta motivadora, objetiva e formatada em Markdown de forma muito elegante e limpa. Use negritos para destacar números e termos importantes.
5. Seja conciso (máximo de 3 a 4 parágrafos curtos).`;

    const userPrompt = `Por favor, analise a evolução dos meus dados físicos entre as duas datas fornecidas:

### Período de Comparação:
- Data Base (A): ${dateA} (Peso: ${weightAText})
- Data Comparação (B): ${dateB} (Peso: ${weightBText})${weightDiffText}

### Comparativo de Medidas Corporais:
${measurementsText}

Por favor, forneça um diagnóstico sobre a minha evolução física com base nesses dados.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const json = await callAiChatCompletion({
      provider,
      apiKey,
      model: getTextModel(provider, settings),
      messages,
      temperature: 0.7,
      maxTokens: 1024,
      baseUrl: settings.omniroute_base_url,
    });
    
    const analysis = json.choices[0].message.content as string;
    return { analysis };
  });

