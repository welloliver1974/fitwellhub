// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalsPage } from "@/components/goals-page";

// Teste de INTEGRAÇÃO da página de Metas: supabase "fake" (maybeSingle + upsert)
// + useAuth mock + useNavigate (router) mock.

const mock = vi.hoisted(() => {
  type Call = {
    type: "select" | "upsert" | "update" | "delete" | "insert";
    table: string;
    payload?: unknown;
  };
  const selectData = new Map<string, Record<string, unknown>[]>();
  const calls: Call[] = [];

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
      upsert: (payload: unknown) => {
        calls.push({ type: "upsert", table, payload });
        return Promise.resolve({ data: null, error: null });
      },
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
    get upsertCalls() {
      return calls.filter((c) => c.type === "upsert");
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.supabase }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false, session: null }),
}));
const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

describe("GoalsPage — integração (supabase mock)", () => {
  beforeEach(() => mock.reset());

  it("pré-carrega os valores da meta existente", async () => {
    mock.setSelect("goals", [
      { calories: 1800, protein_g: 160, carbs_g: 150, fat_g: 70 },
    ]);
    render(<GoalsPage />);

    expect(await screen.findByDisplayValue("1800")).toBeInTheDocument();
    expect(screen.getByDisplayValue("160")).toBeInTheDocument();
    expect(screen.getByDisplayValue("150")).toBeInTheDocument();
    expect(screen.getByDisplayValue("70")).toBeInTheDocument();
  });

  it("mostra a soma calórica dos macros (macroKcal)", async () => {
    render(<GoalsPage />);
    await screen.findByDisplayValue("2000"); // defaults enquanto loading resolve

    // protein 140 + carbs 220 + fat 65 → 140*4 + 220*4 + 65*9 = 560 + 880 + 585 = 2025
    expect(screen.getByText(/2025 kcal/)).toBeInTheDocument();
  });

  it("salvar chama upsert em goals e navega para /app", async () => {
    mock.setSelect("goals", []);
    const user = userEvent.setup();
    render(<GoalsPage />);
    await screen.findByDisplayValue("2000");

    await user.click(screen.getByRole("button", { name: /Salvar metas/ }));

    await waitFor(() => {
      const up = mock.upsertCalls.find((c) => c.table === "goals");
      expect(up).toBeTruthy();
      expect(up!.payload).toMatchObject({
        user_id: "u1",
        calories: 2000,
        protein_g: 140,
        carbs_g: 220,
        fat_g: 65,
      });
      expect(navigate).toHaveBeenCalledWith({ to: "/app" });
    });
  });

  it("mostra aviso quando a meta difere >50kcal da soma dos macros", async () => {
    mock.setSelect("goals", [
      { calories: 1000, protein_g: 140, carbs_g: 220, fat_g: 65 },
    ]);
    render(<GoalsPage />);
    await screen.findByDisplayValue("1000");

    // macroKcal 2025 − meta 1000 = 1025 kcal de diferença → aviso
    expect(screen.getByText(/Difere 1025 kcal da meta calórica/)).toBeInTheDocument();
  });
});