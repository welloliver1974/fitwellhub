import { describe, expect, it } from "vitest";
import { buildExportPayload } from "./export-diary";

describe("buildExportPayload (backup do diário em JSON)", () => {
  it("inclui as tabelas passadas e mantém version/exportedAt", () => {
    const p = buildExportPayload({
      exportedAt: "2026-08-10T00:00:00.000Z",
      user: { id: "u1" },
      tables: { meals: [{ id: "m1" }], meal_items: [{ id: "i1" }] },
    });
    expect(p.app).toBe("fitwell-hub");
    expect(p.version).toBe(1);
    expect(p.exportedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(p.user).toEqual({ id: "u1" });
    expect(p.data.meals).toEqual([{ id: "m1" }]);
    expect(p.data.meal_items).toEqual([{ id: "i1" }]);
  });

  it("exclui ai_settings por construção (chaves de API nunca vazam)", () => {
    const p = buildExportPayload({
      exportedAt: "x",
      user: {},
      tables: {
        meals: [],
        ai_settings: [{ openrouter_api_key: "sk-123", provider: "openrouter" }],
      },
    });
    expect(p.data).not.toHaveProperty("ai_settings");
    expect(p.data.meals).toEqual([]);
  });

  it("inclui chat_messages (histórico pessoal do Coach)", () => {
    const p = buildExportPayload({
      exportedAt: "x",
      user: {},
      tables: { chat_messages: [{ role: "user", content: "oi" }] },
    });
    expect(p.data.chat_messages).toEqual([{ role: "user", content: "oi" }]);
  });

  it("tabela ausente ou nula vira []", () => {
    const p = buildExportPayload({ exportedAt: "x", user: {}, tables: {} });
    expect(p.data).toEqual({});
    const p2 = buildExportPayload({
      exportedAt: "x",
      user: {},
      tables: { meals: null as unknown as unknown[] },
    });
    expect(p2.data.meals).toEqual([]);
  });
});