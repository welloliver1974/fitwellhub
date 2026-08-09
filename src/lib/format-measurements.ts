export type MeasurementEntry = {
  log_date: string;
  label: string;
  value_cm: number;
};

/**
 * Formata o histórico de medidas corporais em texto para inclusão no contexto de IA.
 * Mostra o valor único ou a evolução (variação em cm) por grupo/rótulo de medida.
 */
export function formatMeasurements(measurements?: MeasurementEntry[] | null): string {
  if (!measurements || measurements.length === 0) {
    return "Sem registros de medidas recentes.";
  }

  // Ordena cronologicamente (do mais antigo para o mais recente)
  const sortedMeasurements = [...measurements].sort((a, b) =>
    a.log_date.localeCompare(b.log_date)
  );

  const groups = new Map<string, MeasurementEntry[]>();
  for (const m of sortedMeasurements) {
    if (!groups.has(m.label)) groups.set(m.label, []);
    groups.get(m.label)!.push(m);
  }

  const lines: string[] = [];
  for (const [label, entries] of groups.entries()) {
    if (entries.length === 1) {
      const item = entries[0];
      lines.push(`- ${label}: ${item.value_cm}cm (em ${item.log_date})`);
    } else {
      const first = entries[0];
      const last = entries[entries.length - 1];
      const diff = last.value_cm - first.value_cm;
      const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
      lines.push(
        `- ${label}: de ${first.value_cm}cm em ${first.log_date} para ${last.value_cm}cm em ${last.log_date} (Evolução: ${diffStr}cm)`
      );
    }
  }

  return lines.join("\n");
}
