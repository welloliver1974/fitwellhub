import { describe, expect, it } from "vitest";
import { getLocalDate } from "@/lib/utils";

describe("getLocalDate", () => {
  it("formata data local em YYYY-MM-DD", () => {
    expect(getLocalDate(new Date(2026, 7, 2))).toBe("2026-08-02");
    expect(getLocalDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("aplica pad-start em mes e dia", () => {
    expect(getLocalDate(new Date(2025, 11, 31))).toBe("2025-12-31");
    expect(getLocalDate(new Date(2026, 2, 7))).toBe("2026-03-07");
  });
});
