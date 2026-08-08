import { describe, expect, it, afterEach } from "vitest";
import {
  getTextModel,
  getVisionModel,
  normalizeAiSettings,
  resolveAiApiKey,
  resolveAiChatEndpoint,
  resolveAiProvider,
  resolveVisionProvider,
} from "@/lib/ai-settings";

afterEach(() => {
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  delete process.env.OMNIROUTE_API_KEY;
});

describe("normalizeAiSettings", () => {
  it("mantém o provider reconhecido", () => {
    expect(normalizeAiSettings({ provider: "openrouter" }).provider).toBe("openrouter");
    expect(normalizeAiSettings({ provider: "omniroute" }).provider).toBe("omniroute");
    expect(normalizeAiSettings({ provider: "nvidia" }).provider).toBe("nvidia");
  });

  it("cai em groq para provider desconhecido/ausente", () => {
    expect(normalizeAiSettings({ provider: "gemini" } as never).provider).toBe("groq");
    expect(normalizeAiSettings(null).provider).toBe("groq");
    expect(normalizeAiSettings(undefined).provider).toBe("groq");
  });

  it("mapeia nvidia_model a partir de omniroute_base_url quando provider é nvidia", () => {
    const s = normalizeAiSettings({ provider: "nvidia", omniroute_base_url: " meu-modelo " });
    expect(s.nvidia_model).toBe("meu-modelo");
  });

  it("não seta nvidia_model para outros providers", () => {
    expect(normalizeAiSettings({ provider: "groq", omniroute_base_url: "x" }).nvidia_model).toBeNull();
  });

  it("preserva chaves e updated_at", () => {
    const s = normalizeAiSettings({
      provider: "openrouter",
      openrouter_api_key: "key",
      updated_at: "2026-01-01",
    });
    expect(s.openrouter_api_key).toBe("key");
    expect(s.updated_at).toBe("2026-01-01");
    expect(s.groq_api_key).toBeNull();
  });
});

describe("resolveAiProvider", () => {
  it("reconhece cada provider e cai em groq por default", () => {
    expect(resolveAiProvider({ provider: "openrouter" })).toBe("openrouter");
    expect(resolveAiProvider({ provider: "omniroute" })).toBe("omniroute");
    expect(resolveAiProvider({ provider: "nvidia" })).toBe("nvidia");
    expect(resolveAiProvider(undefined)).toBe("groq");
    expect(resolveAiProvider(null)).toBe("groq");
    expect(resolveAiProvider({})).toBe("groq");
  });
});

describe("getTextModel", () => {
  it("usa modelo padrão por provider", () => {
    expect(getTextModel("groq")).toBe("llama-3.3-70b-versatile");
    expect(getTextModel("openrouter")).toBe("qwen/qwen-2.5-72b-instruct");
    expect(getTextModel("omniroute")).toBe("llama-3.3-70b-versatile");
    expect(getTextModel("nvidia")).toBe("nvidia/llama-3.1-nemotron-70b-instruct");
  });

  it("nvidia usa nvidia_model custom quando presente", () => {
    expect(getTextModel("nvidia", { nvidia_model: "meu-modelo" })).toBe("meu-modelo");
  });

  it("nvidia sem nvidia_model cai no padrão", () => {
    expect(getTextModel("nvidia", { nvidia_model: null })).toBe("nvidia/llama-3.1-nemotron-70b-instruct");
  });
});

describe("resolveAiApiKey", () => {
  it("usa a chave armazenada por provider", () => {
    expect(resolveAiApiKey({ groq_api_key: " g1 " }, "groq")).toBe("g1");
    expect(resolveAiApiKey({ openrouter_api_key: " o1 " }, "openrouter")).toBe("o1");
    expect(resolveAiApiKey({ omniroute_api_key: " m1 " }, "omniroute")).toBe("m1");
  });

  it("nvidia usa openrouter_api_key (detalhe real)", () => {
    expect(resolveAiApiKey({ openrouter_api_key: " okey " }, "nvidia")).toBe("okey");
  });

  it("cai em vars de ambiente quando não há chave armazenada", () => {
    process.env.GROQ_API_KEY = "env-groq";
    expect(resolveAiApiKey({}, "groq")).toBe("env-groq");

    process.env.NVIDIA_API_KEY = "env-nvidia";
    expect(resolveAiApiKey({}, "nvidia")).toBe("env-nvidia");
  });

  it("omniroute vér fallback para OPENROUTER e GROQ (ordem)", () => {
    process.env.OMNIROUTE_API_KEY = "env-omni";
    expect(resolveAiApiKey({}, "omniroute")).toBe("env-omni");

    delete process.env.OMNIROUTE_API_KEY;
    process.env.OPENROUTER_API_KEY = "env-or";
    expect(resolveAiApiKey({}, "omniroute")).toBe("env-or");

    process.env.GROQ_API_KEY = "env-groq";
    expect(resolveAiApiKey({}, "omniroute")).toBe("env-or"); // prioridade mantém OR acima de groq
  });

  it("retorna null quando nada disponível", () => {
    expect(resolveAiApiKey({}, "groq")).toBeNull();
  });
});

describe("normalizeAiSettings — foto do prato (visao)", () => {
  it("preserva photo_provider/photo_model definidos", () => {
    const s = normalizeAiSettings({
      provider: "nvidia",
      photo_provider: "openrouter",
      photo_model: " meu-vl ",
    });
    expect(s.photo_provider).toBe("openrouter");
    expect(s.photo_model).toBe("meu-vl");
  });

  it("photo_provider invalido/ausente cai em null", () => {
    expect(normalizeAiSettings({ provider: "groq" }).photo_provider).toBeNull();
    expect(
      normalizeAiSettings({ provider: "groq", photo_provider: "groq" } as never).photo_provider,
    ).toBeNull();
  });
});

describe("resolveVisionProvider/getVisionModel", () => {
  it("usa provider de foto quando configurado", () => {
    expect(resolveVisionProvider({ provider: "groq", photo_provider: "openrouter" })).toBe(
      "openrouter",
    );
    expect(resolveVisionProvider({ provider: "groq", photo_provider: "nvidia" })).toBe("nvidia");
  });

  it("segue provider compativel com visao quando foto esta em auto", () => {
    expect(resolveVisionProvider({ provider: "nvidia", photo_provider: null })).toBe("nvidia");
    expect(resolveVisionProvider({ provider: "omniroute", photo_provider: null })).toBe(
      "omniroute",
    );
    expect(resolveVisionProvider({ provider: "groq", photo_provider: null })).toBe("openrouter");
  });

  it("corrige modelo antigo da NVIDIA que gerava 404", () => {
    expect(
      getVisionModel("nvidia", { photo_model: "nvidia/llama-3.2-90b-vision-instruct" }),
    ).toBe("meta/llama-3.2-90b-vision-instruct");
  });

  it("usa defaults de visao por provider", () => {
    expect(getVisionModel("nvidia")).toBe("meta/llama-3.2-90b-vision-instruct");
    expect(getVisionModel("openrouter")).toBe("qwen/qwen2.5-vl-72b-instruct");
    expect(getVisionModel("omniroute")).toBe("qwen/qwen2.5-vl-72b-instruct");
  });
});

describe("resolveAiChatEndpoint", () => {
  it("resolve por provider", () => {
    expect(resolveAiChatEndpoint("groq")).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(resolveAiChatEndpoint("openrouter")).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(resolveAiChatEndpoint("nvidia")).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(resolveAiChatEndpoint("omniroute")).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("omniroute usa baseUrl custom quando presente", () => {
    expect(resolveAiChatEndpoint("omniroute", " https://custom.example ")).toBe("https://custom.example");
  });

  it("desconhecido cai em groq", () => {
    expect(resolveAiChatEndpoint("outro" as never)).toBe("https://api.groq.com/openai/v1/chat/completions");
  });
});
