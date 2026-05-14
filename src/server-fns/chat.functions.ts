import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  message: z.string().trim().max(2000).optional().default(""),
  image: z.string().optional(),
});

export const sendChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada no arquivo .env");
    const { supabase, userId } = context;

    // ... (rest of data gathering code remains same) ...
    // Build context: last 7 days of meals/water/weight + goals + history
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const [
      { data: goals },
      { data: meals },
      { data: water },
      { data: weights },
      { data: history },
    ] = await Promise.all([
      supabase
        .from("goals")
        .select("calories,protein_g,carbs_g,fat_g")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("meals").select("id,meal_date").eq("user_id", userId).gte("meal_date", weekAgo),
      supabase
        .from("water_logs")
        .select("ml,log_date")
        .eq("user_id", userId)
        .gte("log_date", weekAgo),
      supabase
        .from("body_weights")
        .select("weight_kg,log_date")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .limit(5),
      supabase
        .from("chat_messages")
        .select("role,content")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const ids = (meals ?? []).map((m) => m.id);
    const byMeal: Record<string, string> = {};
    (meals ?? []).forEach((m) => {
      byMeal[m.id] = m.meal_date;
    });
    const dailyTotals: Record<string, { kcal: number; p: number; c: number; f: number }> = {};
    if (ids.length) {
      const { data: items } = await supabase
        .from("meal_items")
        .select("meal_id,calories,protein_g,carbs_g,fat_g")
        .in("meal_id", ids);
      (items ?? []).forEach((i) => {
        const d = byMeal[i.meal_id as string];
        if (!d) return;
        const cur = dailyTotals[d] ?? { kcal: 0, p: 0, c: 0, f: 0 };
        cur.kcal += Number(i.calories || 0);
        cur.p += Number(i.protein_g || 0);
        cur.c += Number(i.carbs_g || 0);
        cur.f += Number(i.fat_g || 0);
        dailyTotals[d] = cur;
      });
    }
    const waterByDay: Record<string, number> = {};
    (water ?? []).forEach((w) => {
      waterByDay[w.log_date] = (waterByDay[w.log_date] ?? 0) + Number(w.ml);
    });

    const ctxText = `
Hoje: ${today}
Metas: ${goals?.calories ?? 2000}kcal, P${goals?.protein_g ?? 140}g, C${goals?.carbs_g ?? 220}g, G${goals?.fat_g ?? 65}g
Últimos 7 dias (kcal/P/C/G/água-ml):
${Object.entries(dailyTotals)
  .sort()
  .map(
    ([d, t]) =>
      `${d}: ${Math.round(t.kcal)}/${Math.round(t.p)}/${Math.round(t.c)}/${Math.round(t.f)} | água ${waterByDay[d] ?? 0}ml`,
  )
  .join("\n")}
Pesos recentes: ${(weights ?? []).map((w) => `${w.log_date}=${w.weight_kg}kg`).join(", ")}
`.trim();

    // Save user message
    const dbMessage = data.image ? `[Imagem anexada] ${data.message}`.trim() : data.message;
    await supabase
      .from("chat_messages")
      .insert({ user_id: userId, role: "user", content: dbMessage });

    const recentHistory = (history ?? []).reverse();

    const modelToUse = data.image ? "llama-3.2-11b-vision-preview" : "llama-3.3-70b-versatile";

    const userMessageContent = data.image
      ? [
          { type: "text", text: data.message || "Analise esta imagem." },
          { type: "image_url", image_url: { url: data.image } },
        ]
      : data.message;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          {
            role: "system",
            content: `Você é um coach de nutrição e treino direto, motivador e baseado em ciência. Responda em português brasileiro, curto e objetivo (máx 4 parágrafos). Use os dados reais do usuário abaixo:\n\n${ctxText}`,
          },
          ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userMessageContent },
        ],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Erro detalhado da API do Groq:", errorText);
      throw new Error(`Falha na IA: ${res.status} - ${errorText.slice(0, 100)}`);
    }

    const j = await res.json();
    const reply: string = j.choices?.[0]?.message?.content ?? "(sem resposta)";

    await supabase
      .from("chat_messages")
      .insert({ user_id: userId, role: "assistant", content: reply });

    return { reply };
  });
