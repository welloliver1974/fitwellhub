// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NutDayDetail } from "@/components/nutrition-day-detail";

// Teste de INTEGRAÇÃO do detalhe do dia (histórico de nutrição): supabase "fake"
// (meals + meal_items) + useAuth mock. Garante soma por dia e refeições agrupadas.

const mock = vi.hoisted(() => {
  const selectData = new Map<string, Record<string, unknown>[]>();
  const calls: { type: string; table: string }[] = [];

  const chain = (table: string, single: boolean) => {
    const q: any = () => q;
    Object.setPrototypeOf(q, {
      select: () => chain(table, single),
      eq: () => chain(table, single),
      order: () => chain(table, single),
      limit: () => chain(table, single),
      in: () => chain(table, single),
      ilike: () => chain(table, single),
      maybeSingle: () => chain(table, true),
      single: () => chain(table, true),
    });
    q.then = (resolve: (v: any) => void) => {
      calls.push({ type: "select", table });
      const rows = selectData.get(table) ?? [];
      resolve({ data: single ? (rows[0] ?? null) : rows, error: null });
    };
    return q;
  };

  const from = (table: string) => chain(table, false);

  return {
    supabase: { from },
    reset: () => {
      selectData.clear();
      calls.length = 0;
    },
    setSelect: (table: string, rows: Record<string, unknown>[]) => selectData.set(table, rows),
    get selectCalls() {
      return calls.filter((c) => c.type === "select");
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.supabase }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false, session: null }),
}));

describe("NutDayDetail — integração (supabase mock)", () => {
  beforeEach(() => mock.reset());

  it("lista refeições/itens do dia agrupados por tipo com total", async () => {
    mock.setSelect("meals", [
      { id: "m1", meal_type: "Café da manhã" },
      { id: "m2", meal_type: "Jantar" },
    ]);
    mock.setSelect("meal_items", [
      { id: "i1", meal_id: "m1", name: "Pão", grams: 220, calories: 200, protein_g: 5, carbs_g: 30, fat_g: 1 },
      { id: "i2", meal_id: "m1", name: "Café", grams: 200, calories: 10, protein_g: 0.3, carbs_g: 2, fat_g: 0 },
      { id: "i3", meal_id: "m2", name: "Arroz", grams: 150, calories: 210, protein_g: 15, carbs_g: 44, fat_g: 0.2 },
    ]);

    render(<NutDayDetail />);

    expect(await screen.findByText("Pão")).toBeInTheDocument();
    expect(screen.getByText("Café")).toBeInTheDocument();
    expect(screen.getByText("Arroz")).toBeInTheDocument();

    // Cabeçalhos de refeição presentes
    expect(screen.getByText("Café da manhã")).toBeInTheDocument();
    expect(screen.getByText("Jantar")).toBeInTheDocument();

    // Total do dia: 200 + 10 + 210 = 420 kcal; P 5 + 0.3 + 15 = 20.3 → 20
    expect(screen.getByText(/Total do dia/)).toBeInTheDocument();
    expect(screen.getByText(/420 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/P 20/)).toBeInTheDocument();
  });

  it("dia sem refeições mostra mensagem vazia", async () => {
    mock.setSelect("meals", []);
    render(<NutDayDetail />);

    expect(
      await screen.findByText(/Nenhuma refeição registrada nesse dia/),
    ).toBeInTheDocument();
  });

  it("trocar a data no input recarrega as refeições do novo dia", async () => {
    mock.setSelect("meals", [
      { id: "m1", meal_type: "Café da manhã" },
    ]);
    mock.setSelect("meal_items", [
      { id: "i1", meal_id: "m1", name: "Vitamina", grams: 300, calories: 180, protein_g: 12, carbs_g: 25, fat_g: 3 },
    ]);
    render(<NutDayDetail />);
    await screen.findByText("Vitamina");
    const selectsBefore = mock.selectCalls.filter((c) => c.table === "meals").length;

    // Troca para um dia diferente do padrão (que agora é "ontem") → nova consulta
    const input = screen.getByLabelText(/Dia/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-08-05" } });

    await waitFor(() => {
      expect(mock.selectCalls.filter((c) => c.table === "meals").length).toBeGreaterThanOrEqual(
        selectsBefore + 1,
      );
    });
    expect(screen.getByText("05/08/2026")).toBeInTheDocument();
  });
});