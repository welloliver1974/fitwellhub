// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalsPage } from "@/components/goals-page";

// Teste de INTEGRAÇÃO da página de Metas: supabase "fake" (maybeSingle + upsert)
// + useAuth mock + useNavigate (router) mock + calculateTdee mockado.

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

const mockTdee = vi.hoisted(() => {
  const calculateTdee = vi.fn();
  return { calculateTdee };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.supabase }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false, session: null }),
}));
vi.mock("@/server-fns/corpo.functions", () => ({
  calculateTdee: mockTdee.calculateTdee,
}));
const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

// Sugestão calculada p/ o teste: tdee 2400, peso 80 →
// suggestGoals(2400, 80) = { calories: 2400, protein_g: 160, fat_g: 67, carbs_g: 289 }
const TDEE_OK = {
  bmr: 1745,
  tdee: 2400,
  activityFactor: 1.375,
  sessionsPerWeek: 1.5,
  weight: 80,
  missingData: null,
};
const TDEE_MISSING = {
  bmr: null,
  tdee: null,
  activityFactor: null,
  sessionsPerWeek: 0,
  weight: null,
  missingData: { sex: true, height: true, birthDate: true, weight: true },
};

describe("GoalsPage — integração (supabase mock + calculateTdee mock)", () => {
  beforeEach(() => {
    mock.reset();
    mockTdee.calculateTdee.mockReset();
    mockTdee.calculateTdee.mockResolvedValue(TDEE_OK);
  });

  it("pré-carrega os campos com a sugestão quando não há meta salva", async () => {
    mock.setSelect("goals", []);
    render(<GoalsPage />);

    expect(await screen.findByDisplayValue("2400")).toBeInTheDocument();
    expect(screen.getByDisplayValue("160")).toBeInTheDocument();
    expect(screen.getByDisplayValue("67")).toBeInTheDocument();
    expect(screen.getByDisplayValue("289")).toBeInTheDocument();
    // Sugestão = 2400 kcal = TDEE; também mostra o banner
    // (texto quebrado em <span>/<strong> → matcher por conteúdo)
    expect(
      screen.getByText((content) => content.includes("Sugestão calculada:")),
    ).toBeInTheDocument();
    expect(screen.getByText("2400 kcal")).toBeInTheDocument();
  });

  it("carrega a meta salva quando customizada (não sobrescreve)", async () => {
    mock.setSelect("goals", [
      { calories: 1800, protein_g: 160, carbs_g: 150, fat_g: 70 },
    ]);
    render(<GoalsPage />);

    expect(await screen.findByDisplayValue("1800")).toBeInTheDocument();
    expect(screen.getByDisplayValue("160")).toBeInTheDocument();
    expect(screen.getByDisplayValue("150")).toBeInTheDocument();
    expect(screen.getByDisplayValue("70")).toBeInTheDocument();
    // banner ainda aparece, mas os campos mantêm o valor salvo
    expect(
      screen.getByText((content) => content.includes("Sugestão calculada:")),
    ).toBeInTheDocument();
  });

  it("botão 'Usar calculada' preenche os campos com a sugestão", async () => {
    mock.setSelect("goals", [
      { calories: 1800, protein_g: 160, carbs_g: 150, fat_g: 70 },
    ]);
    const user = userEvent.setup();
    render(<GoalsPage />);
    await screen.findByDisplayValue("1800");

    await user.click(screen.getByRole("button", { name: "Usar calculada" }));

    expect(screen.getByDisplayValue("2400")).toBeInTheDocument();
    expect(screen.getByDisplayValue("160")).toBeInTheDocument();
    expect(screen.getByDisplayValue("67")).toBeInTheDocument();
    expect(screen.getByDisplayValue("289")).toBeInTheDocument();
  });

  it("sem dados p/ TDEE mostra hint e mantém metas no padrão", async () => {
    mock.setSelect("goals", []);
    mockTdee.calculateTdee.mockResolvedValue(TDEE_MISSING);
    render(<GoalsPage />);

    expect(
      await screen.findByText(/Preencha sexo, altura, nascimento e peso/),
    ).toBeInTheDocument();
    // campos continuam no padrão (2000/140/220/65)
    expect(screen.getByDisplayValue("2000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("65")).toBeInTheDocument();
    // soma calórica do padrão = 2025
    expect(screen.getByText(/2025 kcal/)).toBeInTheDocument();
  });

  it("salvar chama upsert em goals e navega para /app", async () => {
    mock.setSelect("goals", []);
    mockTdee.calculateTdee.mockResolvedValue(TDEE_MISSING);
    const user = userEvent.setup();
    render(<GoalsPage />);
    await screen.findByDisplayValue("2000");

    await user.click(screen.getByRole("button", { name: "Salvar metas" }));

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

  it("salvar mantendo a sugestão grava goal_auto=true", async () => {
    mock.setSelect("goals", []); // pré-preenche com a sugestão (2400/160/67/289)
    const user = userEvent.setup();
    render(<GoalsPage />);
    await screen.findByDisplayValue("2400");

    await user.click(screen.getByRole("button", { name: "Salvar metas" }));

    await waitFor(() => {
      const up = mock.upsertCalls.find((c) => c.table === "goals");
      expect(up).toBeTruthy();
      expect(up!.payload).toMatchObject({
        calories: 2400,
        protein_g: 160,
        carbs_g: 289,
        fat_g: 67,
        goal_auto: true,
      });
    });
  });

  it("salvar após editar os campos grava goal_auto=false", async () => {
    mock.setSelect("goals", []); // pré-preenche com a sugestão (2400/160/67/289)
    const user = userEvent.setup();
    render(<GoalsPage />);
    await screen.findByDisplayValue("2400");

    // Usuário edita a meta de calorias para um valor diferente da sugestão.
    fireEvent.change(screen.getByDisplayValue("2400"), { target: { value: "1800" } });
    await user.click(screen.getByRole("button", { name: "Salvar metas" }));

    await waitFor(() => {
      const up = mock.upsertCalls.find((c) => c.table === "goals");
      expect(up).toBeTruthy();
      expect(up!.payload).toMatchObject({
        calories: 1800,
        goal_auto: false,
      });
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