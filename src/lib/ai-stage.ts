// Lógica pura dos estados granulares de loading da IA (UX 2, forma 1).
// Sem imports — testável em node. Consumida por app.chat.tsx e app.coach.tsx.
// Os rótulos são ESTIMATIVAS de fase baseadas em tempo decorrido, não fases
// reais comunicadas pelo servidor (isso seria a forma 2, com polling).

export type AiStage = "preparando" | "consultando" | "gerando";

export const AI_STAGE_LABEL: Record<AiStage, string> = {
  preparando: "Carregando seus dados…",
  consultando: "Consultando a IA…",
  gerando: "Gerando resposta…",
};

export const AI_STAGE_THRESHOLDS = {
  /** Abaixo disso: ainda buscando dados/contexto. */
  preparandoMs: 1000,
  /** Até aqui: a IA está "pensando". Com imagem anexada, a chamada é de visão (mais lenta). */
  consultandoMs: 4000,
  consultandoMsComImagem: 7000,
};

export function aiStageLabel(
  elapsedMs: number,
  options?: { hasImages?: boolean }
): AiStage {
  if (elapsedMs < AI_STAGE_THRESHOLDS.preparandoMs) return "preparando";
  const limiteConsultando = options?.hasImages
    ? AI_STAGE_THRESHOLDS.consultandoMsComImagem
    : AI_STAGE_THRESHOLDS.consultandoMs;
  if (elapsedMs < limiteConsultando) return "consultando";
  return "gerando";
}