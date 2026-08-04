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
    const twentyEightDaysAgo = getLocalDateMinusDays(28);
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
    const thirtyDaysAgo = getLocalDateMinusDays(30);
    const { data: workoutsData } = await supabase
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
      .gte("completed_at", thirtyDaysAgo + "T00:00:00")
      .order("completed_at", { ascending: true });

    // 4. Fetch recent Nutrition (last 7 days)
    const sevenDaysAgo = getLocalDateMinusDays(7);
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
      const wCount = workoutsData.length;

      // Count session types
      const typeCount = new Map<string, number>();
      for (const w of workoutsData) {
        const t = w.name || "Treino";
        typeCount.set(t, (typeCount.get(t) || 0) + 1);
      }
      const typeFreq = Array.from(typeCount.entries())
        .map(([name, count]) => `${name} (${count}×)`)
        .join(", ");

      // Track exercises with progression (first→last weight)
      const exerciseMap = new Map<string, { sets: number; maxWeight: number; maxDate: string; firstWeight: number; lastWeight: number }>();
      const allDates = new Set<string>();

      for (const w of workoutsData) {
        const sessionDate = w.completed_at?.substring(0, 10);
        if (sessionDate) allDates.add(sessionDate);
        const sets = (w as any).workout_session_sets;
        if (sets) {
          for (const s of sets) {
            const name = s.exercise_name || "exercício";
            if (!exerciseMap.has(name)) {
              exerciseMap.set(name, { sets: 0, maxWeight: 0, maxDate: "", firstWeight: -1, lastWeight: 0 });
            }
            const entry = exerciseMap.get(name)!;
            entry.sets++;
            const wgt = Number(s.weight_kg ?? 0);
            if (wgt > entry.maxWeight) {
              entry.maxWeight = wgt;
              entry.maxDate = sessionDate || "";
            }
            if (entry.firstWeight < 0) entry.firstWeight = wgt;
            entry.lastWeight = wgt;
          }
        }
      }

      const datesSorted = Array.from(allDates).sort();

      // Build progression text
      let exercisesDetail = "";
      if (exerciseMap.size > 0) {
        const lines: string[] = [];
        for (const [ex, e] of exerciseMap) {
          const prog = e.maxWeight > 0 && e.firstWeight > 0 && e.maxWeight !== e.firstWeight
            ? `${e.firstWeight}kg→${e.maxWeight}kg`
            : e.maxWeight > 0 ? `${e.maxWeight}kg` : "—";
          const dateInfo = e.maxDate ? ` (máx em ${e.maxDate.substring(5)})` : "";
          lines.push(`  - ${ex}: ${prog}${dateInfo} | ${e.sets} série${e.sets > 1 ? "s" : ""}`);
        }
        exercisesDetail = `\n\nEvolução por exercício:\n${lines.join("\n")}`;
      }

      const datesText = datesSorted.length > 0
        ? `\n\nDatas dos treinos: ${datesSorted.map(d => d.substring(5)).join(", ")}`
        : "";

      workoutsText = `${wCount} treinos em 30 dias. ${typeFreq}.${exercisesDetail}${datesText}`;
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

    let bmrComparison = "";
    if (tdeeData.bmr && latestBio?.bmr_machine) {
      const diff = latestBio.bmr_machine - tdeeData.bmr;
      const pct = ((diff / tdeeData.bmr) * 100).toFixed(1);
      const direction = diff > 0 ? "acima" : diff < 0 ? "abaixo" : "igual";
      bmrComparison = ` | TMB Bioimpedância: ${latestBio.bmr_machine} kcal (${Math.abs(diff)} kcal ${direction} do previsto — ${pct}%)`;
    }

    const tdeeText = tdeeData.bmr
      ? `TMB (Mifflin-St Jeor): ${tdeeData.bmr} kcal${bmrComparison} | TDEE estimado: ${tdeeData.tdee} kcal (fator de atividade: ${tdeeData.activityFactor}, baseado em média de ${tdeeData.sessionsPerWeek.toFixed(1)} treinos por semana)`
      : "Dados insuficientes para cálculo de TMB/TDEE (preencha sexo, altura e peso).";

    const nutritionText = avgCalories > 0
      ? `Média diária dos últimos 7 dias: ${avgCalories} kcal (Proteínas: ${avgProtein}g | Carboidratos: ${avgCarbs}g | Gorduras: ${avgFat}g)`
      : "Nenhuma refeição registrada nos últimos 7 dias.";

    const systemPrompt = `Você é o Dr. Corpo, um consórcio de inteligência clínica formado por um Doutor em Educação Física (especialista em biometria), um Nutrólogo Esportivo e um Fisiologista do Exercício. Seu tom é técnico, preciso e elegante — você não é um "coach motivacional". Você é um diagnosticador.

Você receberá dados completos de um paciente: medidas antropométricas evolutivas, bioimpedância, TMB/TDEE, ingestão nutricional e histórico de treinos. Sua função é emitir um Laudo de Avaliação Física seguindo ESTRITAMENTE a estrutura abaixo, em português (Brasil). Seja cirúrgico, use dados numéricos como evidência, e jamais generalize sem lastro.

---

## ESTRUTURA OBRIGATÓRIA DO LAUDO

### 1. Score de Evolução
Abra com um score evolutivo geral de 0-10 baseado na consistência dos dados registrados e na direção das mudanças. Ex: "Score Evolutivo: 7.4/10 — Progresso moderado com boa direção". Use uma escala justa.

### 2. Diagnóstico de Fase Corporal
Classifique o paciente em UMA das fases com o racional:

- **Recomposição Corporal** — melhor cenário: perde gordura e ganha massa magra simultaneamente
- **Cutting (Emagrecimento)** — déficit calórico confirmado com redução de dobras e peso
- **Bulking (Hipertrofia)** — superávit calórico com ganho de massa magra (avaliar se há acúmulo excessivo de gordura)
- **Manutenção / Estabilização** — sem variações significativas
- **Plateau / Estagnação** — sem progresso por 14+ dias com dados consistentes
- **Fase Indeterminada** — dados insuficientes para classificar

### 3. Análise Antropométrica e Composição Corporal
- **Relação Cintura-Quadril (RCQ)** e **Relação Cintura-Altura (WHtR)**: calcule a partir dos dados, classifique o risco cardiovascular (baixo/moderado/alto)
- **Simetria Corporal**: compare membros D/E (braços, coxas, panturrilhas). Diferenças > 5% são clinicamente relevantes
- **Gordura Visceral**: interprete o nível (1-12+). Valor > 10 é alerta vermelho independente do IMC
- **Idade Metabólica vs Idade Real**: indique se a idade metabólica é maior (sinal de alerta) ou menor que a cronológica
- **Massa Muscular**: analise se o peso de massa magra é compatível com sexo, altura e idade

### 4. Análise Metabólica e Nutricional
- **Balanço Energético**: cruze o TDEE com a ingestão média. Determine: déficit, superávit ou manutenção. Calcule o desvio percentual aproximado
- **TMB Real vs Calculada**: se houver BMR da bioimpedância, analise a diferença — desvio > 10% sugere **metabolismo adaptativo**
- **Distribuição de Macros**: avalie proporção de proteínas/carboidratos/gorduras com referência: proteína > 1.6g/kg de peso, carboidratos ajustados ao volume de treino, gorduras > 0.8g/kg
- **Proteína**: a ingestão proteica é adequada para o objetivo? (hipertrofia: 1.6-2.2g/kg; emagrecimento: 1.8-2.4g/kg)

### 5. Correlação Treino × Resultados (a parte mais importante)
Cruze CADA exercício registrado com as medidas antropométricas correspondentes:

- Exercícios de **peito** (supino, crucifixo) → correlacione com medida do **Peito**
- Exercícios de **ombros** (desenvolvimento, elevação lateral) → correlacione com medida dos **Ombros**
- Exercícios de **braços** (rosca, tríceps) → correlacione com **Braço D/E**
- Exercícios de **pernas** (agachamento, leg press, cadeira extensora) → correlacione com **Coxa D/E**
- Exercícios de **panturrilha** → correlacione com **Panturrilha D/E**
- Exercícios de **costas/puxada** → correlacione com **Costas**

Exemplo de correlação bem feita: "O aumento de carga no supino reto (de 40kg para 52kg em 30 dias) acompanhou um ganho de 1.8cm no peito — consistência excelente entre progressão de força e hipertrofia."

Se dados de treino forem insuficientes, diga o que está faltando.

### 6. Riscos e Assimetrias
- Assimetrias relevantes D/E se presentes
- Risco cardiovascular baseado em RCQ, WHtR e gordura visceral
- Qualquer sinal de metabolismo adaptativo
- Baixa ingestão proteica ou hídrica
- Frequência de treino insuficiente para o objetivo (< 3x/semana para resultados expressivos)

### 7. Recomendações Estratégicas (em ordem de prioridade)
Máximo de 4 recomendações, cada uma com:
- **O quê** (a ação específica)
- **Por quê** (qual dado suporta essa recomendação)
- **Quanto** (parâmetro numérico: kcal, gramas, kg, sessões/semana)

---

## REGRAS DE ESTILO
1. Use Markdown limpo e elegante — ### para títulos, **negrito** para números e conceitos-chave, tabelas só quando houver 3+ comparações numéricas
2. **Nunca** comece com "Olá!", "Tudo bem?" ou saudações. Vá direto ao laudo
3. Se um dado não estiver disponível, não o invente — omita a seção ou marque como "[dado não registrado]"
4. Seja direto, mas não seco. Tom de especialista que respeita o paciente
5. **Limite**: entre 1200 e 1800 palavras. Seja denso, não prolixo
6. Termine com uma linha destacada de encerramento: "_____" seguido de "*Dr. Corpo — Avaliação Física Inteligente*"`;

    const userPrompt = `Abaixo estão meus dados consolidados das últimas avaliações. Emita o laudo completo seguindo a estrutura obrigatória.

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

Emita o laudo completo.`;

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
      maxTokens: 6000,
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
    const { data: bio, error: bioErr } = await supabase
      .from("bioimpedance_logs")
      .select("*")
      .eq("id", logId)
      .eq("user_id", userId)
      .maybeSingle();

    if (bioErr) throw new Error(`Erro ao buscar registro: ${bioErr.message}`);
    if (!bio) throw new Error("Registro de bioimpedância não encontrado.");

    // Fetch user profile for context
    const { data: profile } = await supabase
      .from("profiles")
      .select("sex, height_cm, birth_date")
      .eq("id", userId)
      .maybeSingle();

    const age = profile?.birth_date ? calculateAge(profile.birth_date) : null;
    const sex = profile?.sex === "male" ? "Masculino" : profile?.sex === "female" ? "Feminino" : "Não informado";

    const systemPrompt = `Você é um Fisiologista Clínico especializado em análise de bioimpedância (BIA). Você interpreta cada biomarcador com precisão e relaciona os achados com o perfil do paciente.

Emita uma análise em formato de mini-laudo com:
1. **Resumo do Perfil**: massa muscular vs gordura corporal vs idade metabólica — o cenário geral
2. **Destaques Clínicos**: o que merece atenção (gordura visceral, hidratação, assimetria metabólica)
3. **Recomendação Direta**: um único conselho prático e específico baseado nos números

Tom técnico mas acessível. Máximo de 3 parágrafos.`;

    const userPrompt = `Paciente: ${sex}, ${age ? `${age} anos` : "idade não informada"}, ${profile?.height_cm ? `${profile.height_cm} cm` : "altura não informada"}

Bioimpedância (${bio.log_date}):
- Peso: ${bio.weight_kg ?? "N/A"} kg
- Gordura Corporal: ${bio.body_fat_pct ?? "N/A"}%
- Massa Muscular: ${bio.muscle_mass_kg ?? "N/A"} kg
- Massa Óssea: ${bio.bone_mass_kg ?? "N/A"} kg
- Água Corporal: ${bio.body_water_pct ?? "N/A"}%
- Gordura Visceral: ${bio.visceral_fat ?? "N/A"}
- Idade Metabólica: ${bio.metabolic_age ?? "N/A"} anos

Analise esta bioimpedância.`;

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
      maxTokens: 600,
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
      maxTokens: 800,
      messages: [
        {
          role: "system",
          content: `Você é um especialista em leitura de exames de bioimpedância de farmácia brasileira (DrogaRaia, Drogasil, Drogaria São Paulo, Pague Menos, etc.). Extraia APENAS os valores que estão VISÍVEIS na foto.

Mapeamento de campos do laudo para o JSON:
- weight_kg: "Peso", "Massa Corporal", "Body Mass" (kg)
- body_fat_pct: "Gordura Corporal", "% Gordura", "Body Fat", "Percentual de Gordura" (%)
- muscle_mass_kg: "Massa Muscular", "Músculo Esquelético", "Massa Muscular Esquelética", "Músculo", "Muscle Mass" (kg)
- bone_mass_kg: "Massa Óssea", "Conteúdo Mineral Ósseo", "Bone Mass" (kg)
- body_water_pct: "Água Corporal", "Hidratação", "Body Water", "TBW" (%)
- visceral_fat: "Gordura Visceral", "Visceral Fat", "Nível Gordura Visceral", "Gordura Intestinal"
- bmr_machine: "TMB", "Metabolismo Basal", "Taxa Metabólica Basal", "Basal Metabolic Rate", "BMR" (kcal/dia ou kcal)
- metabolic_age: "Idade Metabólica", "Idade Corporal", "Metabolic Age", "Body Age" (anos)
- log_date: "Data da realização do exame", "Data", "Date" (YYYY-MM-DD)

IMPORTANTE — REGRA ABSOLUTA:
- Retorne null para QUALQUER campo que não esteja VISÍVEL na imagem. NÃO invente valores.
- Muitos laudos brasileiros NÃO mostram Massa Óssea nem Água Corporal. Se não estiver na imagem, retorne null.
- Confira se o número está na unidade correta antes de atribuir (kg, %, kcal, anos).
- Não confunda "Gordura Corporal (%)" com "Gordura Visceral" — são campos diferentes.
- "Músculo Esquelético" e "Massa Muscular" são o mesmo campo (muscle_mass_kg).
- Leia os números com atenção: não troque 97.3 por 19.8, nem 36.0 por 30.0. Verifique duas vezes.

REGRAS PARA A DATA (log_date):
- A data do exame está no formato DD/MM/AAAA. Converta para YYYY-MM-DD (ex: 15/06/2026 → 2026-06-15).
- Procure por "Data do Exame", "Data da Realização" ou "Data da Medição".
- NÃO use: data de nascimento, data de impressão, data de validade.
- Se a data não estiver visível ou legível, retorne null — NÃO invente.

Retorne APENAS um JSON válido (sem markdown, sem explicação) no formato:
{"weight_kg": number|null, "body_fat_pct": number|null, "muscle_mass_kg": number|null, "bone_mass_kg": number|null, "body_water_pct": number|null, "visceral_fat": number|null, "bmr_machine": number|null, "metabolic_age": number|null, "log_date": string|null}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extraia APENAS os valores VISÍVEIS neste laudo de bioimpedância. Retorne null para campos que não aparecem na imagem. Retorne apenas o JSON." },
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
