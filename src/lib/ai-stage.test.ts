import { describe, expect, it } from "vitest";
import { aiStageLabel, AI_STAGE_LABEL } from "@/lib/ai-stage";

describe("aiStageLabel — thresholds sem imagem", () => {
  it("elapsedMs < 1000 → preparando", () => {
    expect(aiStageLabel(0)).toBe("preparando");
    expect(aiStageLabel(999)).toBe("preparando");
  });

  it("borda exata 1000 → consultando", () => {
    expect(aiStageLabel(1000)).toBe("consultando");
  });

  it("elapsedMs entre 1000 e 3999 → consultando", () => {
    expect(aiStageLabel(1999)).toBe("consultando");
    expect(aiStageLabel(3999)).toBe("consultando");
  });

  it("borda exata 4000 (sem imagem) → gerando", () => {
    expect(aiStageLabel(4000)).toBe("gerando");
    expect(aiStageLabel(12000)).toBe("gerando");
  });
});

describe("aiStageLabel — hasImages alonga a janela de consultando", () => {
  it("com imagem, 4000 ainda é consultando", () => {
    expect(aiStageLabel(4000, { hasImages: true })).toBe("consultando");
  });

  it("com imagem, borda exata 7000 → gerando", () => {
    expect(aiStageLabel(7000, { hasImages: true })).toBe("gerando");
    expect(aiStageLabel(6999, { hasImages: true })).toBe("consultando");
  });
});

describe("AI_STAGE_LABEL", () => {
  it("cobre as 3 fases com os textos combinados", () => {
    expect(Object.keys(AI_STAGE_LABEL)).toEqual([
      "preparando",
      "consultando",
      "gerando",
    ]);
    expect(AI_STAGE_LABEL.preparando).toContain("dados");
    expect(AI_STAGE_LABEL.consultando).toContain("IA");
    expect(AI_STAGE_LABEL.gerando).toBe("Gerando resposta…");
  });
});