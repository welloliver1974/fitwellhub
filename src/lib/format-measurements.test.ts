import { describe, expect, it } from "vitest";
import { formatMeasurements } from "./format-measurements";

describe("formatMeasurements", () => {
  it("retorna mensagem padrão quando nulo ou vazio", () => {
    expect(formatMeasurements(null)).toBe("Sem registros de medidas recentes.");
    expect(formatMeasurements([])).toBe("Sem registros de medidas recentes.");
  });

  it("formata entrada única com rótulo, valor e data", () => {
    const res = formatMeasurements([
      { log_date: "2026-08-01", label: "Cintura", value_cm: 82.5 },
    ]);
    expect(res).toBe("- Cintura: 82.5cm (em 2026-08-01)");
  });

  it("calcula e formata a evolução quando há múltiplas medidas da mesma área", () => {
    const res = formatMeasurements([
      { log_date: "2026-08-01", label: "Cintura", value_cm: 84 },
      { log_date: "2026-08-08", label: "Cintura", value_cm: 82 },
    ]);
    expect(res).toBe("- Cintura: de 84cm em 2026-08-01 para 82cm em 2026-08-08 (Evolução: -2.0cm)");
  });

  it("adiciona o sinal de mais para variações positivas", () => {
    const res = formatMeasurements([
      { log_date: "2026-08-01", label: "Braço", value_cm: 36 },
      { log_date: "2026-08-08", label: "Braço", value_cm: 37.2 },
    ]);
    expect(res).toBe("- Braço: de 36cm em 2026-08-01 para 37.2cm em 2026-08-08 (Evolução: +1.2cm)");
  });
});
