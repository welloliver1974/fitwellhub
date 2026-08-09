// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAiStage } from "@/lib/use-ai-stage";

// Helper: avançar o relógio fake DENTRO de act() — sem isso, as atualizações de
// estado disparadas pelo callback do setInterval (setElapsedMs) não são
// aplicadas a tempo da leitura em result.current.
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("useAiStage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retorna null quando inativo", () => {
    const { result } = renderHook(() => useAiStage(false));
    expect(result.current).toBeNull();
  });

  it("começa em preparando e avança conforme o tempo", () => {
    const { result } = renderHook(() => useAiStage(true));

    expect(result.current).toBe("preparando"); // elapsed 0

    advance(1100); // tick em 500 e 1000
    expect(result.current).toBe("consultando");

    advance(3000); // total 4100ms
    expect(result.current).toBe("gerando");
  });

  it("reseta ao desativar e reativar", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useAiStage(active),
      { initialProps: { active: true } }
    );

    advance(4100);
    expect(result.current).toBe("gerando");

    rerender({ active: false });
    expect(result.current).toBeNull();

    rerender({ active: true });
    expect(result.current).toBe("preparando"); // recomeçou do zero
  });

  it("com imagem, 4000ms ainda é consultando", () => {
    const { result } = renderHook(() =>
      useAiStage(true, { hasImages: true })
    );

    advance(4000);
    expect(result.current).toBe("consultando");

    advance(3000); // total 7000ms
    expect(result.current).toBe("gerando");
  });

  it("limpa o interval no unmount", () => {
    const { unmount } = renderHook(() => useAiStage(true));
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});