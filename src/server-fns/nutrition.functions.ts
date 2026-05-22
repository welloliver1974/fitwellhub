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
            content: `Alimento: "${data.query}". Porção: ${data.grams}g. Estime os macros para essa porção exata.`,
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

const photoMacrosTool = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "Alimentos identificados na foto",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome em português" },
          grams: { type: "number", description: "Estimativa de gramas visíveis no prato" },
          calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
        },
        required: ["name", "grams", "calories", "protein_g", "carbs_g", "fat_g"],
      },
    },
  },
  required: ["items"],
};

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
              "Você é nutricionista. Identifique cada alimento visível na foto do prato, estime gramas e macros (kcal, proteína, carboidrato, gordura) por item. Use a tabela TACO como referência. Retorne APENAS via tool call.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analise este prato e estime macros por item." },
              { type: "image_url", image_url: { url: data.imageBase64 } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_plate",
              description: "Reporta itens identificados no prato",
              parameters: photoMacrosTool,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_plate" } },
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
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("Resposta inválida da IA");
    const args = JSON.parse(call.function.arguments);
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
