import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeRecordWater } from "./chat.functions";

// ---- Supabase mock helper ----
function makeSupabase({
  existingRecord = null as null | { id: string; ml: number },
  updateError = null as null | { message: string },
  insertError = null as null | { message: string },
} = {}) {
  const updated: { id: string; ml: number }[] = [];
  const inserted: { user_id: string; log_date: string; ml: number }[] = [];

  const supabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockImplementation((row: any) => {
      if (!insertError) inserted.push(row);
      return { error: insertError };
    }),
    update: vi.fn().mockImplementation((row: any) => {
      updated.push(row);
      return {
        eq: vi.fn().mockReturnValue({ error: updateError }),
      };
    }),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: existingRecord }),
    _inserted: inserted,
    _updated: updated,
  };
  return supabase;
}

const USER_ID = "user-abc";
const TODAY = "2026-08-09";

describe("executeRecordWater", () => {
  it("insere novo registro quando não existe nenhum para hoje", async () => {
    const supabase = makeSupabase({ existingRecord: null });
    const result = await executeRecordWater(supabase as any, USER_ID, TODAY, { ml: 500 });
    expect(result).toContain("500ml");
    expect(supabase._inserted).toHaveLength(1);
    expect(supabase._inserted[0]).toMatchObject({ user_id: USER_ID, log_date: TODAY, ml: 500 });
  });

  it("acumula ml ao registro existente do dia", async () => {
    const supabase = makeSupabase({ existingRecord: { id: "wl-1", ml: 300 } });
    const result = await executeRecordWater(supabase as any, USER_ID, TODAY, { ml: 200 });
    expect(result).toContain("500ml"); // 300 + 200
    expect(result).toContain("+200ml");
  });

  it("retorna erro quando ml <= 0", async () => {
    const supabase = makeSupabase();
    const result = await executeRecordWater(supabase as any, USER_ID, TODAY, { ml: 0 });
    expect(result).toContain("inválida");
  });

  it("retorna mensagem de erro quando insert falha", async () => {
    const supabase = makeSupabase({ existingRecord: null, insertError: { message: "DB offline" } });
    const result = await executeRecordWater(supabase as any, USER_ID, TODAY, { ml: 300 });
    expect(result).toContain("Erro ao registrar");
    expect(result).toContain("DB offline");
  });

  it("retorna mensagem de erro quando update falha", async () => {
    const supabase = makeSupabase({
      existingRecord: { id: "wl-2", ml: 100 },
      updateError: { message: "Connection lost" },
    });
    const result = await executeRecordWater(supabase as any, USER_ID, TODAY, { ml: 400 });
    expect(result).toContain("Erro ao atualizar");
    expect(result).toContain("Connection lost");
  });
});
