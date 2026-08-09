// Monta o payload do backup do diário em JSON. Puro — recebe um mapa <tabela, rows[]>
// e devolve o objeto pronto pra virar arquivo. `ai_settings` nunca é exportado por
// construção (guarda chaves de API). Sem imports — testável em node.

export function buildExportPayload(input: {
  exportedAt: string;
  user: unknown;
  tables: Record<string, unknown[]>;
}): {
  app: "fitwell-hub";
  version: 1;
  exportedAt: string;
  user: unknown;
  data: Record<string, unknown[]>;
} {
  const data: Record<string, unknown[]> = {};
  for (const [name, rows] of Object.entries(input.tables)) {
    if (name === "ai_settings") continue; // segredo — nunca exportar
    data[name] = rows ?? [];
  }
  return {
    app: "fitwell-hub",
    version: 1,
    exportedAt: input.exportedAt,
    user: input.user,
    data,
  };
}