// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RemindersPage } from "@/components/reminders-page";

// Radix Select em jsdom precisa de pointer capture + scrollIntoView ao abrir o
// dropdown (mesmo mock do goals-page.component.test.tsx).
if (typeof window !== "undefined") {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

// Teste de INTEGRAÇÃO: renderiza a página de Lembretes com um supabase "fake"
// chainable (vi.hoisted, sem import externo) + useAuth mock. Fluxo real de CRUD.

const mock = vi.hoisted(() => {
  type Call = { type: "select" | "insert" | "update" | "delete"; table: string; payload?: unknown };
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
    reset: () => {
      selectData.clear();
      calls.length = 0;
    },
    setSelect: (table: string, rows: Record<string, unknown>[]) => selectData.set(table, rows),
    get selectCalls() {
      return calls.filter((c) => c.type === "select");
    },
    get insertCalls() {
      return calls.filter((c) => c.type === "insert");
    },
    get updateCalls() {
      return calls.filter((c) => c.type === "update");
    },
    get deleteCalls() {
      return calls.filter((c) => c.type === "delete");
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.supabase }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false, session: null }),
}));

// jsdom não tem Notification nativo; o componente lê Notification.permission.
beforeAll(() => {
  (globalThis as any).Notification = {
    permission: "granted",
    requestPermission: vi.fn().mockResolvedValue("granted"),
  };
});

const reminders = [
  {
    id: "r1",
    kind: "water",
    time_of_day: "09:00:00",
    days_of_week: [1, 2, 3, 4, 5],
    enabled: true,
  },
  {
    id: "r2",
    kind: "meal",
    time_of_day: "12:30:00",
    days_of_week: [0, 6],
    enabled: false,
  },
];

describe("RemindersPage — integração (supabase mock)", () => {
  beforeEach(() => mock.reset());

  it("carrega e lista os lembretes do banco", async () => {
    mock.setSelect("reminders", reminders);
    render(<RemindersPage />);

    expect(await screen.findByText("💧 Água")).toBeInTheDocument();
    expect(screen.getByText("🍽️ Refeição")).toBeInTheDocument();
    expect(mock.selectCalls.some((c) => c.table === "reminders")).toBe(true);
  });

  it("adiciona um lembrete com insert em reminders", async () => {
    mock.setSelect("reminders", reminders);
    const user = userEvent.setup();
    render(<RemindersPage />);
    await screen.findByText("💧 Água");

    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    await waitFor(() => {
      const ins = mock.insertCalls.find((c) => c.table === "reminders");
      expect(ins).toBeTruthy();
      expect(ins!.payload).toMatchObject({
        user_id: "u1",
        kind: "water",
        time_of_day: "09:00",
        days_of_week: [1, 2, 3, 4, 5],
        enabled: true,
      });
    });
  });

  it("não insere quando nenhum dia está selecionado", async () => {
  mock.setSelect("reminders", reminders);
  const user = userEvent.setup();
  render(<RemindersPage />);
  await screen.findByText("💧 Água");

  // desmarcar os 5 dias default (tornar `days` = [])
  const dayBtns = screen
    .getAllByRole("button")
    .filter((b) => b.className.includes("h-9 w-9") && /^[DSTQ]$/.test(b.textContent!.trim()));
  for (const b of dayBtns) {
    if (b.className.includes("bg-primary")) await user.click(b);
  }

  await user.click(screen.getByRole("button", { name: /Adicionar/ }));
  // a página valida com toast.error("Selecione pelo menos 1 dia"); não insere.
  expect(mock.insertCalls.some((c) => c.table === "reminders")).toBe(false);
});

  it("liga/desliga um lembrete (update enabled)", async () => {
    mock.setSelect("reminders", reminders);
    const user = userEvent.setup();
    render(<RemindersPage />);
    await screen.findByText("💧 Água");

    // Switch do lembrete r2 (desligado) → ligar
    const switchBtns = screen.getAllByRole("switch");
    await user.click(switchBtns[1]);

    await waitFor(() => {
      const upd = mock.updateCalls.find((c) => c.table === "reminders");
      expect(upd).toBeTruthy();
      expect(upd!.payload).toMatchObject({ enabled: true });
    });
  });

  it("remove um lembrete (delete reminders)", async () => {
    mock.setSelect("reminders", reminders);
    const user = userEvent.setup();
    render(<RemindersPage />);
    await screen.findByText("💧 Água");

    // "💧 Água" aparece 2× (trigger do Select + item da lista); pega o da lista
    const waters = screen.getAllByText("💧 Água");
    const item = waters.find((w) => w.closest("button") === null) ?? waters[1];
    const trash = within(item.closest("div")!.parentElement as HTMLElement).getByRole("button");
    await user.click(trash);

    await waitFor(() => {
      expect(mock.deleteCalls.some((c) => c.table === "reminders")).toBe(true);
    });
  });

  // Abre o Select de tipo e escolhe uma opção (helper local — o Select inicia em água).
  const pickKind = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: label }));
  };

  it("adiciona lembrete inteligente (kind smart) com time_of_day sentinela", async () => {
    mock.setSelect("reminders", []);
    const user = userEvent.setup();
    render(<RemindersPage />);
    await screen.findByText("Novo lembrete");

    await pickKind(user, "🧠 Inteligente");
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    await waitFor(() => {
      const ins = mock.insertCalls.find((c) => c.table === "reminders");
      expect(ins).toBeTruthy();
      expect(ins!.payload).toMatchObject({
        user_id: "u1",
        kind: "smart",
        time_of_day: "16:00",
        days_of_week: [1, 2, 3, 4, 5],
        enabled: true,
      });
    });
  });

  it("tipo inteligente esconde o horário manual e mostra o hint", async () => {
    mock.setSelect("reminders", []);
    const user = userEvent.setup();
    render(<RemindersPage />);
    await screen.findByText("Novo lembrete");

    // Antes: input de horário presente.
    expect(screen.getByDisplayValue("09:00")).toBeInTheDocument();

    await pickKind(user, "🧠 Inteligente");
    expect(screen.queryByDisplayValue("09:00")).not.toBeInTheDocument();
    expect(screen.getByText(/Horário inteligente/)).toBeInTheDocument();

    // Voltando para Água, o input reaparece.
    await pickKind(user, "💧 Água");
    expect(screen.getByDisplayValue("09:00")).toBeInTheDocument();
  });

  it("lista renderiza lembrete inteligente sem expor o time sentinela", async () => {
    mock.setSelect("reminders", [
      {
        id: "s1",
        kind: "smart",
        time_of_day: "16:00:00",
        days_of_week: [1, 2, 3, 4, 5],
        enabled: true,
      },
    ]);
    render(<RemindersPage />);

    expect(await screen.findByText("🧠 Inteligente")).toBeInTheDocument();
    expect(screen.getByText(/Horário inteligente/)).toBeInTheDocument();
    expect(screen.queryByText(/^16:00/)).toBeNull();
  });
});