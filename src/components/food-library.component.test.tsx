// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FoodLibrary } from "@/components/FoodLibrary";

// Teste de INTEGRAÇÃO: renderiza o FoodLibrary inteiro com um supabase "fake"
// chainable (vi.hoisted, sem import externo — o vi.mock é hoisted ao topo e
// não consegue ler consts top-level do seu módulo). Confirma o fluxo real de
// dados: load → lista → busca → diálogo adicionar → insert com macros escalados.

const mock = vi.hoisted(() => {
  type Call = {
    type: "select" | "insert" | "update" | "delete";
    table: string;
    payload?: unknown;
  };
  const selectData = new Map<string, Record<string, unknown>[]>();
  const calls: Call[] = [];

  const chain = (table: string, single: boolean, doLog = true) => {
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
      if (doLog) calls.push({ type: "select", table });
      const rows = selectData.get(table) ?? [];
      resolve({ data: single ? (rows[0] ?? null) : rows, error: null });
    };
    return q;
  };

  const from = (table: string) => {
    const c = chain(table, false);
    c.insert = (payload: unknown) => {
      calls.push({ type: "insert", table, payload });
      return Promise.resolve({ data: null, error: null });
    };
    c.update = (payload: unknown) => {
      calls.push({ type: "update", table, payload });
      return { eq: () => Promise.resolve({ data: null, error: null }) };
    };
    c.delete = () => {
      calls.push({ type: "delete", table });
      return { eq: () => Promise.resolve({ data: null, error: null }) };
    };
    return c;
  };

  return {
    supabase: { from },
    setSelect: (table: string, rows: Record<string, unknown>[]) => selectData.set(table, rows),
    lookupNutrition: () => Promise.resolve({}),
    get selectCalls() {
      return calls.filter((c) => c.type === "select");
    },
    get insertCalls() {
      return calls.filter((c) => c.type === "insert");
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.supabase }));
vi.mock("@/server-fns/nutrition.functions", () => ({ lookupNutrition: mock.lookupNutrition ?? vi.fn() }));

function defaultProps() {
  return {
    user: { id: "u1" },
    session: { access_token: "tok" },
    mealTypes: ["Café da manhã", "Almoço", "Lanche", "Jantar", "Ceia"],
    defaultMealType: "Café da manhã",
    existingMealTypes: ["Café da manhã"],
    ensureMeal: vi.fn().mockResolvedValue({
      id: "m1",
      meal_type: "Café da manhã",
      meal_date: "2026-08-02",
    }),
    onItemAdded: vi.fn(),
  };
}

function foodCollection() {
  return [
    {
      id: "f1",
      name: "Arroz integral",
      category: "Grãos",
      grams: 100,
      calories: 124,
      protein_g: 2.6,
      carbs_g: 25.8,
      fat_g: 1,
    },
    {
      id: "f2",
      name: "Frango grelhado",
      category: "Proteínas",
      grams: 100,
      calories: 195,
      protein_g: 31,
      carbs_g: 0,
      fat_g: 7,
    },
  ];
}

describe("FoodLibrary — integração com supabase (mock)", () => {
  it("carrega e lista os alimentos da biblioteca do banco", async () => {
    mock.setSelect("food_library", foodCollection());
    render(<FoodLibrary {...defaultProps()} />);

    await waitFor(() => {
      expect(screen.getByText("Arroz integral")).toBeInTheDocument();
      expect(screen.getByText("Frango grelhado")).toBeInTheDocument();
    });
    expect(mock.selectCalls.some((c) => c.table === "food_library")).toBe(true);
  });

  it("filtra a lista pela busca", async () => {
    mock.setSelect("food_library", foodCollection());
    const user = userEvent.setup();
    render(<FoodLibrary {...defaultProps()} />);
    await screen.findByText("Arroz integral");

    await user.type(screen.getByPlaceholderText("Buscar alimento…"), "frango");
    expect(screen.queryByText("Arroz integral")).not.toBeInTheDocument();
    expect(screen.getByText("Frango grelhado")).toBeInTheDocument();
  });

  it("mostra o card vazio quando a biblioteca não tem nada", async () => {
    mock.setSelect("food_library", []);
    render(<FoodLibrary {...defaultProps()} />);
    await screen.findByText(/Nenhum alimento na biblioteca/i);
  });

  it("abre 'adicionar', muda a porção e insere meal_items com macros escalados", async () => {
    mock.setSelect("food_library", foodCollection());
    const props = defaultProps();
    const user = userEvent.setup();
    render(<FoodLibrary {...props} />);

    await user.click(await screen.findByText("Frango grelhado"));
    // localiza o diálogo pelo título acessível (o outro dialog "criar/editar" fica no DOM)
    const dialog = await screen.findByRole("dialog", { name: "Adicionar à refeição" });

    // o campo abre com o valor da porção do alimento (100); muda para 150
    const gramsInput = within(dialog).getByDisplayValue("100");
    await user.clear(gramsInput);
    await user.type(gramsInput, "150");
    expect(within(dialog).getByText(/293 kcal/)).toBeInTheDocument();
    expect(within(dialog).getByText(/P 46\.5/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
    expect(props.ensureMeal).toHaveBeenCalledWith("Café da manhã");
    await waitFor(() => {
      expect(props.onItemAdded).toHaveBeenCalled();
      const ins = mock.insertCalls.find((c) => c.table === "meal_items");
      expect(ins).toBeTruthy();
      expect(ins!.payload).toMatchObject({
        user_id: "u1",
        meal_id: "m1",
        name: "Frango grelhado",
        grams: 150,
        calories: 293,
        protein_g: 46.5,
      });
    });
  });

  it("desabilita 'Adicionar' quando a porção é zerada", async () => {
    mock.setSelect("food_library", foodCollection());
    const user = userEvent.setup();
    render(<FoodLibrary {...defaultProps()} />);
    await user.click(await screen.findByText("Frango grelhado"));

    const dialog = await screen.findByRole("dialog", { name: "Adicionar à refeição" });
    const gramsInput = within(dialog).getByDisplayValue("100");
    await user.clear(gramsInput);
    await user.type(gramsInput, "0");
    const addButton = Array.from(within(dialog).getAllByRole("button")).find(
      (b) => b.textContent && b.textContent.trim() === "Adicionar",
    )!;
    expect(addButton).toBeDisabled();
  });
});