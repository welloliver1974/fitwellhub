import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  query: z.string().trim().min(1).max(200),
  grams: z.number().min(1).max(5000).default(100),
});

const macroSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Nome canônico do alimento em português" },
    calories: { type: "number", description: "kcal por porção informada" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
  },
  required: ["name", "calories", "protein_g", "carbs_g", "fat_g"],
  additionalProperties: false,
};

export const lookupNutrition = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const grams = data.grams;

    // try Open Food Facts first
    try {
      const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(data.query)}&search_simple=1&action=process&json=1&page_size=1`;
      const offRes = await fetch(offUrl, { signal: AbortSignal.timeout(5000) });
      if (offRes.ok) {
        const body = await offRes.json();
        const p = body.products?.[0]?.nutriments;
        if (p?.["energy-kcal_100g"]) {
          const ratio = grams / 100;
          return {
            name: body.products[0].product_name || data.query,
            calories: Math.round(p["energy-kcal_100g"] * ratio),
            protein_g: Math.round((p["proteins_100g"] ?? 0) * ratio * 10) / 10,
            carbs_g: Math.round((p["carbohydrates_100g"] ?? 0) * ratio * 10) / 10,
            fat_g: Math.round((p["fat_100g"] ?? 0) * ratio * 10) / 10,
          };
        }
      }
    } catch {
      // fallback to IA
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada no arquivo .env");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Você é um nutricionista. Estime macros (kcal, proteína, carboidrato, gordura) de alimentos brasileiros. Use a tabela TACO como referência mental. Sempre arredonde para 1 casa decimal. Retorne APENAS via tool call.",
          },
          {
            role: "user",
            content: `Alimento: "${data.query}". Porção: ${grams}g. Estime os macros para essa porção exata.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_macros",
              description: "Reporta macros nutricionais estimados",
              parameters: macroSchema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_macros" } },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Erro detalhado da API do Groq (Nutrition):", errorText);
      throw new Error(`Erro IA: ${res.status} - ${errorText.slice(0, 100)}`);
    }

    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("Resposta inválida da IA");
    const args = JSON.parse(call.function.arguments);
    return args as {
      name: string;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
    };
  });

const photoSchema = z.object({
  imageBase64: z.string().min(50),
});

export const analyzePhoto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => photoSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada no arquivo .env");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://fitwellhub.app",
        "X-Title": "FitWell Hub",
      },
      body: JSON.stringify({
        model: "qwen/qwen2.5-vl-72b-instruct",
        messages: [
          {
            role: "system",
            content:
              'Você é nutricionista. Identifique cada alimento visível na foto do prato, estime gramas e macros (kcal, proteína, carboidrato, gordura) por item. Use a tabela TACO como referência. Retorne APENAS um JSON válido (sem markdown, sem explicacão) no formato: {"items":[{"name":"...","grams":N,"calories":N,"protein_g":N,"carbs_g":N,"fat_g":N}]}',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analise este prato e estime macros por item. Retorne apenas o JSON." },
              { type: "image_url", image_url: { url: data.imageBase64 } },
            ],
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Muitas requisições. Tente novamente mais tarde ou verifique seus créditos no OpenRouter.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione fundos no OpenRouter.");
    if (!res.ok) {
      const errorText = await res.text();
      console.error("Erro detalhado da API do OpenRouter:", errorText);
      throw new Error(`Erro IA: ${res.status} - ${errorText.slice(0, 100)}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("Resposta vazia da IA");

    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("IA não retornou um JSON válido");

    const args = JSON.parse(match[0]);
    if (!args.items || !Array.isArray(args.items)) throw new Error("Formato de resposta inesperado");

    return args as {
      items: Array<{
        name: string;
        grams: number;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
      }>;
    };
  });

const coachSchema = z.object({
  summary: z.string().max(8000),
});

export const coachAdvice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => coachSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY não configurada no arquivo .env");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Você é um coach pessoal de treino e nutrição. Analise os dados da última semana do usuário e retorne 3-5 insights curtos, práticos e motivadores em português. Use markdown simples (negrito e listas). Seja direto, sem clichês.",
          },
          { role: "user", content: data.summary },
        ],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Erro detalhado da API do Groq (Coach):", errorText);
      throw new Error(`Erro IA: ${res.status} - ${errorText.slice(0, 100)}`);
    }

    const json = await res.json();
    return { text: (json.choices?.[0]?.message?.content as string) ?? "" };
  });
