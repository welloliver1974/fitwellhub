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
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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

    if (res.status === 429) throw new Error("Muitas requisições. Aguarde um instante.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos em Settings → Workspace → Usage.");
    if (!res.ok) throw new Error(`Erro IA: ${res.status}`);

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