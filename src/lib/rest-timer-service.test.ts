import { describe, it, expect } from "vitest";
import { calculateRemainingSeconds } from "./rest-timer-service";

describe("rest-timer-service", () => {
  it("deve retornar 0 quando o tempo alvo já passou", () => {
    const now = 1700000000000;
    const past = now - 5000;
    expect(calculateRemainingSeconds(past, now)).toBe(0);
  });

  it("deve retornar 0 quando o targetTimeMs for inválido ou 0", () => {
    expect(calculateRemainingSeconds(0, 1700000000000)).toBe(0);
  });

  it("deve calcular corretamente os segundos restantes arredondando para cima", () => {
    const now = 1700000000000;
    // 60 segundos exatos
    expect(calculateRemainingSeconds(now + 60000, now)).toBe(60);

    // 59.4 segundos restantes -> arredonda para 60s
    expect(calculateRemainingSeconds(now + 59400, now)).toBe(60);

    // 15.1 segundos restantes -> arredonda para 16s
    expect(calculateRemainingSeconds(now + 15100, now)).toBe(16);

    // 0.2 segundos restantes -> arredonda para 1s
    expect(calculateRemainingSeconds(now + 200, now)).toBe(1);
  });
});
