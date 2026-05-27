import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const analyzeMeasurements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada");
    
    const { supabase, userId } = context;

    // 1. Fetch body measurements
    const { data: measurements } = await supabase
      .from("body_measurements")
      .select("log_date, label, value_cm")
      .eq("user_id", userId)
      .order("log_date", { ascending: true });

    // 2. Fetch workouts from the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: workoutsData } = await supabase
      .from("workouts")
      .select(`
        id, 
        name, 
        workout_date,
        exercises (
          id, 
          name, 
          sets (
            reps, 
            weight_kg
          )
        )
      `)
      .eq("user_id", userId)
      .gte("workout_date", thirtyDaysAgo)
      .order("workout_date", { ascending: true });

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

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${apiKey}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({ 
        model: "llama-3.3-70b-versatile", 
        messages,
        temperature: 0.7,
        max_tokens: 1024
      }),
    });

    if (!response.ok) {
      throw new Error("Erro ao chamar a API de IA: " + await response.text());
    }

    const json = await response.json();
    return { analysis: json.choices[0].message.content };
  });
