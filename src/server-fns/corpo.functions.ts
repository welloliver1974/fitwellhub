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

export const calculateTdee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // 1. Fetch Profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("sex, height_cm, birth_date")
      .eq("id", userId)
      .single();

    // 2. Fetch Latest Weight
    const { data: weightData } = await supabase
      .from("body_weights")
      .select("weight_kg, log_date")
      .eq("user_id", userId)
      .order("log_date", { ascending: false })
      .limit(1);

    const latestWeight = weightData && weightData.length > 0 ? Number(weightData[0].weight_kg) : null;

    if (!profile || !profile.sex || !profile.height_cm || !profile.birth_date || !latestWeight) {
      return {
        bmr: null,
        tdee: null,
        activityFactor: null,
        sessionsPerWeek: 0,
        age: profile?.birth_date ? calculateAge(profile.birth_date) : null,
        sex: profile?.sex || null,
        height: profile?.height_cm ? Number(profile.height_cm) : null,
        weight: latestWeight,
        missingData: {
          sex: !profile?.sex,
          height: !profile?.height_cm,
          birthDate: !profile?.birth_date,
          weight: !latestWeight,
        }
      };
    }

    const age = calculateAge(profile.birth_date);
    const height = Number(profile.height_cm);
    const sex = profile.sex;

    // 3. Mifflin-St Jeor BMR
    // Men: 10 * weight + 6.25 * height - 5 * age + 5
    // Women: 10 * weight + 6.25 * height - 5 * age - 161
    let bmr = 0;
    if (sex === "male") {
      bmr = 10 * latestWeight + 6.25 * height - 5 * age + 5;
    } else {
      bmr = 10 * latestWeight + 6.25 * height - 5 * age - 161;
    }

    // 4. Activity Factor based on workout sessions in last 28 days
    const twentyEightDaysAgo = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
    const { data: workouts } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("user_id", userId)
      .gte("completed_at", twentyEightDaysAgo + "T00:00:00");

    const totalWorkouts = workouts?.length ?? 0;
    const sessionsPerWeek = totalWorkouts / 4;

    let activityFactor = 1.2; // Sedentary
    if (sessionsPerWeek >= 1 && sessionsPerWeek < 3) {
      activityFactor = 1.375; // Lightly Active
    } else if (sessionsPerWeek >= 3 && sessionsPerWeek < 5) {
      activityFactor = 1.55; // Moderately Active
    } else if (sessionsPerWeek >= 5) {
      activityFactor = 1.725; // Very Active
    }

    const tdee = bmr * activityFactor;

    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      activityFactor,
      sessionsPerWeek,
      age,
      sex,
      height,
      weight: latestWeight,
      missingData: null
    };
  });

export const analyzeFullBodyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const settings = await fetchAiSettings(supabase, userId);
    const provider = resolveAiProvider(settings);
    const apiKey = resolveAiApiKey(settings, provider);
    if (!apiKey) throw new Error("Configure uma chave de IA nas configuracoes.");

    // 1. Fetch Profile and calculate TDEE
    const tdeeData = await calculateTdee({ context });

    // 2. Fetch Latest Bioimpedance Log
    const { data: bioimpedance } = await supabase
      .from("bioimpedance_logs")
      .select("*")
      .eq("user_id", userId)
      .order("log_date", { ascending: false })
      .limit(1);

    const latestBio = bioimpedance && bioimpedance.length > 0 ? bioimpedance[0] : null;

    // 3. Fetch recent Workouts (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: workoutsData } = await supabase
      .from("workout_sessions")
      .select("id, name, completed_at")
      .eq("user_id", userId)
      .gte("completed_at", thirtyDaysAgo + "T00:00:00")
      .order("completed_at", { ascending: true });

    // 4. Fetch recent Nutrition (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const { data: meals } = await supabase
      .from("meals")
      .select(`
        id,
        meal_date,
        meal_items (
          calories,
          protein_g,
          carbs_g,
          fat_g
        )
      `)
      .eq("user_id", userId)
      .gte("meal_date", sevenDaysAgo)
      .order("meal_date", { ascending: true });

    // Calculate nutrition averages
    let avgCalories = 0;
    let avgProtein = 0;
    let avgCarbs = 0;
    let avgFat = 0;

    if (meals && meals.length > 0) {
      // Group by unique date to find days logged
      const daysLogged = new Set(meals.map(m => m.meal_date)).size || 1;
      let totalCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;

      for (const meal of meals) {
        if (meal.meal_items) {
          for (const item of meal.meal_items) {
            totalCalories += Number(item.calories ?? 0);
            totalProtein += Number(item.protein_g ?? 0);
            totalCarbs += Number(item.carbs_g ?? 0);
            totalFat += Number(item.fat_g ?? 0);
          }
        }
      }

      avgCalories = Math.round(totalCalories / daysLogged);
      avgProtein = Math.round(totalProtein / daysLogged);
      avgCarbs = Math.round(totalCarbs / daysLogged);
      avgFat = Math.round(totalFat / daysLogged);
    }

    // 5. Fetch body measurements (last 30 days)
    const { data: measurements } = await supabase
      .from("body_measurements")
      .select("log_date, label, value_cm")
      .eq("user_id", userId)
      .gte("log_date", thirtyDaysAgo)
      .order("log_date", { ascending: true });

    // Format measurements
    let measurementsText = "Nenhuma medida registrada nos últimos 30 dias.";
    if (measurements && measurements.length > 0) {
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

    // Format workouts
    let workoutsText = "Nenhum treino concluído nos últimos 30 dias.";
    if (workoutsData && workoutsData.length > 0) {
      const count = workoutsData.length;
      const names = [...new Set(workoutsData.map(w => w.name))].join(", ");
      workoutsText = `Total de treinos no período: ${count}. Tipos de treino frequentes: ${names}.`;
    }

    // Format Bioimpedance text
    let bioimpedanceText = "Nenhum registro de bioimpedância disponível.";
    if (latestBio) {
      bioimpedanceText = `
- Peso: ${latestBio.weight_kg ?? "N/A"} kg (em ${latestBio.log_date})
- % Gordura Corporal: ${latestBio.body_fat_pct ?? "N/A"}%
- Massa Muscular: ${latestBio.muscle_mass_kg ?? "N/A"} kg
- Massa Óssea: ${latestBio.bone_mass_kg ?? "N/A"} kg
- % Água Corporal: ${latestBio.body_water_pct ?? "N/A"}%
- Gordura Visceral: ${latestBio.visceral_fat ?? "N/A"}
- Idade Metabólica: ${latestBio.metabolic_age ?? "N/A"} anos
`;
    }

    const tdeeText = tdeeData.bmr
      ? `TMB: ${tdeeData.bmr} kcal | TDEE estimado: ${tdeeData.tdee} kcal (fator de atividade: ${tdeeData.activityFactor}, baseado em média de ${tdeeData.sessionsPerWeek.toFixed(1)} treinos por semana)`
      : "Dados insuficientes para cálculo de TMB/TDEE (preencha sexo, altura e peso).";

    const nutritionText = avgCalories > 0
      ? `Média diária dos últimos 7 dias: ${avgCalories} kcal (Proteínas: ${avgProtein}g | Carboidratos: ${avgCarbs}g | Gorduras: ${avgFat}g)`
      : "Nenhuma refeição registrada nos últimos 7 dias.";

    const systemPrompt = `Você é um Personal Trainer e Coach de Nutrição esportiva altamente qualificado.
Sua missão é gerar um diagnóstico evolutivo completo cruzando todos os dados corporais, nutricionais e de treinos do usuário.

Sua análise deve conter:
1. **Composição Corporal & Bioimpedância**: Análise do peso, % de gordura e massa muscular, indicando se os valores estão saudáveis ou sugerindo o foco correto (emagrecimento, hipertrofia ou recomposição).
2. **Balanço Energético & Nutrição**: Correlacione o TDEE estimado com a média de ingestão calórica e macros dos últimos 7 dias. O usuário está em déficit, superávit ou manutenção?
3. **Evolução & Treinos**: Correlacione o volume e frequência de treinos nos últimos 30 dias com as mudanças de medidas em cm e dados de bioimpedância.
4. **Próximos Passos**: Recomendações práticas e acionáveis de ajuste de calorias/macros e estratégia de treino para maximizar os resultados.

Escreva em português (Brasil) em formato Markdown muito elegante, limpo e profissional. Seja direto e motivador. Evite textos excessivamente longos (limite de 4-5 parágrafos ou seções curtas).`;

    const userPrompt = `Aqui está o meu perfil de saúde e progresso consolidado:

### Dados Pessoais & Metabolismo:
- Sexo: ${tdeeData.sex === "male" ? "Masculino" : tdeeData.sex === "female" ? "Feminino" : "Não informado"}
- Altura: ${tdeeData.height ? `${tdeeData.height} cm` : "Não informada"}
- Idade: ${tdeeData.age ? `${tdeeData.age} anos` : "Não informada"}
- ${tdeeText}

### Bioimpedância mais recente:
${bioimpedanceText}

### Consumo Nutricional Recente (Média 7 dias):
${nutritionText}

### Histórico de Treinos (Últimos 30 dias):
${workoutsText}

### Medidas Corporais (Variação últimos 30 dias):
${measurementsText}

Por favor, faça um diagnóstico completo do meu estado físico atual e me dê as melhores recomendações.`;

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
      maxTokens: 1500,
      baseUrl: settings.omniroute_base_url,
    });

    const analysis = json.choices[0].message.content as string;

    return {
      analysis,
      tdee: tdeeData.tdee,
      bmr: tdeeData.bmr,
      sessionsPerWeek: tdeeData.sessionsPerWeek
    };
  });

const bioAnalysisSchema = z.object({
  logId: z.string().uuid()
});

export const analyzeBioimpedanceLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bioAnalysisSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { logId } = data;
    const { supabase, userId } = context;

    const settings = await fetchAiSettings(supabase, userId);
    const provider = resolveAiProvider(settings);
    const apiKey = resolveAiApiKey(settings, provider);
    if (!apiKey) throw new Error("Configure uma chave de IA nas configuracoes.");

    // Fetch this bioimpedance log
    const { data: bio } = await supabase
      .from("bioimpedance_logs")
      .select("*")
      .eq("id", logId)
      .eq("user_id", userId)
      .single();

    if (!bio) throw new Error("Registro de bioimpedância não encontrado.");

    // Fetch user profile for context
    const { data: profile } = await supabase
      .from("profiles")
      .select("sex, height_cm, birth_date")
      .eq("id", userId)
      .single();

    const age = profile?.birth_date ? calculateAge(profile.birth_date) : null;
    const sex = profile?.sex === "male" ? "Masculino" : profile?.sex === "female" ? "Feminino" : "Não informado";

    const systemPrompt = `Você é um Coach de Saúde e especialista em Composição Corporal.
Analise a leitura de bioimpedância fornecida e explique o significado dos valores em português de forma clara, didática e encorajadora.
Destaque a saúde da massa muscular, o percentual de gordura e o nível de gordura visceral. Dê dicas rápidas de melhora ou manutenção.
Seja muito conciso (máximo de 2 parágrafos curtos).`;

    const userPrompt = `Aqui estão os meus dados de perfil e esta bioimpedância específica:
- Sexo: ${sex}
- Altura: ${profile?.height_cm ? `${profile.height_cm} cm` : "Não informada"}
- Idade: ${age ? `${age} anos` : "Não informada"}

Leitura de Bioimpedância:
- Data: ${bio.log_date}
- Peso: ${bio.weight_kg ?? "N/A"} kg
- Gordura Corporal: ${bio.body_fat_pct ?? "N/A"}%
- Massa Muscular: ${bio.muscle_mass_kg ?? "N/A"} kg
- Massa Óssea: ${bio.bone_mass_kg ?? "N/A"} kg
- Água Corporal: ${bio.body_water_pct ?? "N/A"}%
- Gordura Visceral: ${bio.visceral_fat ?? "N/A"}
- Idade Metabólica: ${bio.metabolic_age ?? "N/A"} anos

Por favor, faça uma análise direta dessa bioimpedância.`;

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
      maxTokens: 500,
      baseUrl: settings.omniroute_base_url,
    });

    const analysis = json.choices[0].message.content as string;

    return { analysis };
  });

const bioPhotoSchema = z.object({
  imageBase64: z.string().min(50),
});

export const analyzeBioimpedancePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bioPhotoSchema.parse(d))
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
          content: `Você é um especialista em leitura de exames de bioimpedância. Extraia os valores numéricos visíveis na foto do laudo/exame.

Retorne APENAS um JSON válido (sem markdown, sem explicação) no formato:
{"weight_kg": number|null, "body_fat_pct": number|null, "muscle_mass_kg": number|null, "bone_mass_kg": number|null, "body_water_pct": number|null, "visceral_fat": number|null, "bmr_machine": number|null, "metabolic_age": number|null, "log_date": string|null}

Use null para campos que não conseguir identificar. O log_date deve estar no formato YYYY-MM-DD se visível.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extraia todos os valores numéricos deste laudo de bioimpedância. Retorne apenas o JSON." },
            { type: "image_url", image_url: { url: data.imageBase64 } },
          ],
        },
      ],
    });

    const content = (res as any).choices?.[0]?.message?.content;
    if (!content) throw new Error("Resposta vazia da IA");

    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("IA não retornou um JSON válido");

    return JSON.parse(match[0]) as {
      weight_kg: number | null;
      body_fat_pct: number | null;
      muscle_mass_kg: number | null;
      bone_mass_kg: number | null;
      body_water_pct: number | null;
      visceral_fat: number | null;
      bmr_machine: number | null;
      metabolic_age: number | null;
      log_date: string | null;
    };
  });
