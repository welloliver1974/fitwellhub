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

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const substituteInputSchema = z.object({
  exercise_name: z.string().trim().min(1, "Nome do exercício obrigatório").max(100),
  reason: z.string().trim().max(200).default("aparelho ocupado"),
});

export const substituteOutputSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z.string(),
        muscles: z.string(),
        description: z.string(),
        tip: z.string(),
      })
    )
    .length(3),
});

export type SubstituteSuggestion = z.infer<typeof substituteOutputSchema>["suggestions"][number];

// ---------------------------------------------------------------------------
// AI tool definition (structured output)
// ---------------------------------------------------------------------------

const SUGGEST_TOOL = {
  type: "function",
  function: {
    name: "suggest_substitutes",
    description:
      "Sugere 3 exercícios alternativos equivalentes ao exercício informado, levando em conta o motivo da substituição.",
    parameters: {
      type: "object",
      required: ["suggestions"],
      properties: {
        suggestions: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            required: ["name", "muscles", "description", "tip"],
            properties: {
              name: {
                type: "string",
                description: "Nome do exercício alternativo em português",
              },
              muscles: {
                type: "string",
                description:
                  "Músculos principais trabalhados (ex: 'Dorsal, Bíceps, Rombóide')",
              },
              description: {
                type: "string",
                description:
                  "Por que é uma boa alternativa para este caso (1-2 frases)",
              },
              tip: {
                type: "string",
                description: "Dica de execução ou cuidado especial (1 frase)",
              },
            },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const suggestExerciseSubstitute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => substituteInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, user } = context as any;
    const { exercise_name, reason } = data;

    // Busca configurações de IA do usuário
    const aiSettings = await fetchAiSettings(supabase, user.id);
    const provider = resolveAiProvider(aiSettings);
    const apiKey = resolveAiApiKey(aiSettings, provider);
    const model = getTextModel(provider, aiSettings);

    if (!apiKey) {
      throw new Error(
        "Nenhuma chave de IA configurada. Configure um provider em Configurações > IA."
      );
    }

    const systemPrompt = `Você é um personal trainer especializado em musculação e treinamento funcional.
Sua tarefa é sugerir exatamente 3 exercícios alternativos para substituir um exercício durante um treino.
As alternativas devem:
- Trabalhar o(s) mesmo(s) grupo(s) muscular(es) do exercício original
- Ser viáveis dado o motivo da substituição informado
- Ser ordenadas da mais similar à mais diferente
- Ter nomes em português brasileiro
- NÃO repetir o exercício original nem variantes idênticas
Responda SEMPRE usando a ferramenta suggest_substitutes com exatamente 3 sugestões.`;

    const userMessage = `Exercício atual: ${exercise_name}
Motivo da substituição: ${reason}

Sugira 3 alternativas equivalentes.`;

    const response = await callAiChatCompletion({
      provider,
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      tools: [SUGGEST_TOOL],
      toolChoice: { type: "function", function: { name: "suggest_substitutes" } },
      temperature: 0.7,
      maxTokens: 800,
    });

    // Extrai a tool call da resposta
    const toolCall = response?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("A IA não retornou sugestões. Tente novamente.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error("Resposta da IA em formato inválido. Tente novamente.");
    }

    // Valida o output com zod
    const result = substituteOutputSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error("A IA não retornou o número correto de sugestões. Tente novamente.");
    }

    return result.data;
  });
