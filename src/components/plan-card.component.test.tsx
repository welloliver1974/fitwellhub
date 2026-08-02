// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanCard } from "@/components/plan-card";
import { buildCoachPlan } from "@/lib/coach-plan";

// Fixture: plano de Emagrecimento sem treinos (mesmo caso do coach-plan.test.ts),
// montado com o builder real para não acoplar o teste a literais.
const plan = buildCoachPlan(
  { workoutCount: 0, mealCount: 2, weightCount: 0, waterCount: 0 },
  { calories: 1800, protein_g: 120 },
);

describe("PlanCard", () => {
  it("mostra o título recolhido e esconde o conteúdo", () => {
    render(<PlanCard plan={plan} />);
    expect(screen.getByText("Plano da semana")).toBeInTheDocument();
    // Radix Collapsible mantém o conteúdo oculto (data-state=closed).
    expect(screen.queryByText(plan.focus)).not.toBeInTheDocument();
  });

  it("mostra o chip de objetivo mesmo recolhido", () => {
    render(<PlanCard plan={plan} />);
    expect(screen.getByText(plan.objective)).toBeInTheDocument();
  });

  it("expande ao toque no cabeçalho e mostra foco/metas", async () => {
    const user = userEvent.setup();
    render(<PlanCard plan={plan} />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText(plan.focus)).toBeInTheDocument();
    expect(screen.getByText(/Hoje:/)).toBeInTheDocument();
    expect(screen.getByText(/Treino:/)).toBeInTheDocument();
    expect(screen.getByText(/Nutrição:/)).toBeInTheDocument();
    expect(screen.getByText(/Acompanhamento:/)).toBeInTheDocument();
  });

  it("lista todos os itens do checklist após expandir", async () => {
    const user = userEvent.setup();
    render(<PlanCard plan={plan} />);
    await user.click(screen.getByRole("button"));
    expect(screen.getAllByRole("listitem")).toHaveLength(plan.checklist.length);
    for (const item of plan.checklist) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it("mostra a próxima ação após expandir", async () => {
    const user = userEvent.setup();
    render(<PlanCard plan={plan} />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText(/Próxima ação:/)).toBeInTheDocument();
    expect(screen.getByText(plan.nextAction)).toBeInTheDocument();
  });

  it("recolhe de novo ao segundo toque", async () => {
    const user = userEvent.setup();
    render(<PlanCard plan={plan} />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText(plan.focus)).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(screen.queryByText(plan.focus)).not.toBeInTheDocument();
  });
});
