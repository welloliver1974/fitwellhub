import { describe, expect, it } from "vitest";
import {
  getLocalDate,
  getLocalDateMinusDays,
  formatLocalDate,
  todayBoundsSaoPaulo,
} from "@/lib/utils";

// Os testes usam instants absolutos via "new Date('...Z')" (meio-dia UTC = longe das
// bordas de fuso) e afirmam o resultado em America/Sao_Paulo. Assim são independentes
// do fuso da máquina de teste (nem só SP, nem só UTC).

describe("getLocalDate (fuso SP fixo)", () => {
  it("meio-dia UTC = mesmo dia em SP", () => {
    expect(getLocalDate(new Date("2026-08-02T12:00:00Z"))).toBe("2026-08-02");
    expect(getLocalDate(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });

  it("borda: 02:00Z de 04/08 = 23h do dia 03/08 em SP", () => {
    // No Worker (UTC) 02:00Z ainda é 04/08, mas em SP é 03/08 às 23h.
    expect(getLocalDate(new Date("2026-08-04T02:00:00Z"))).toBe("2026-08-03");
  });

  it("borda: 03:00Z de 04/08 = meia-noite de 04/08 em SP", () => {
    expect(getLocalDate(new Date("2026-08-04T03:00:00Z"))).toBe("2026-08-04");
  });
});

describe("getLocalDateMinusDays", () => {
  it("subtrai dias civis em SP, independente do fuso do runtime", () => {
    const from = new Date("2026-08-04T12:00:00Z"); // 09:00 SP de 04/08
    expect(getLocalDateMinusDays(0, from)).toBe("2026-08-04");
    expect(getLocalDateMinusDays(1, from)).toBe("2026-08-03");
    expect(getLocalDateMinusDays(7, from)).toBe("2026-07-28");
  });

  it("cruza virada de mês", () => {
    const from = new Date("2026-08-01T12:00:00Z");
    expect(getLocalDateMinusDays(1, from)).toBe("2026-07-31");
  });
});

describe("formatLocalDate", () => {
  it("formata data civil em pt-BR sem depender do fuso do runtime", () => {
    expect(formatLocalDate("2026-08-04")).toBe("04/08/2026");
    expect(formatLocalDate("2025-12-31")).toBe("31/12/2025");
  });

  it("aceita options de formatação (formato pt-BR com 'de')", () => {
    expect(
      formatLocalDate("2026-08-04", { day: "2-digit", month: "short", year: "numeric" }),
    ).toBe("04 de ago. de 2026");
    // 04/08/2026 cai numa terça-feira
    const wd = formatLocalDate("2026-08-04", { weekday: "short" });
    expect(wd.toLowerCase()).toContain("ter");
  });
});

describe("todayBoundsSaoPaulo", () => {
  it("produz intervalo ISO UTC de 24h começando às 03:00Z (00:00 SP)", () => {
    const { start, end } = todayBoundsSaoPaulo();
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    expect(e - s).toBe(86400000 - 1); // 23:59:59.999
    expect(new Date(start).getUTCHours()).toBe(3); // 00:00 SP = 03:00Z (UTC-3)
  });
});