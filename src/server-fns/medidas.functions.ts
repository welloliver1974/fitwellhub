import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
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
      model: getTextModel(provider),
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
