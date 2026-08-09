import { useEffect, useRef, useState } from "react";
import { aiStageLabel, type AiStage } from "@/lib/ai-stage";

/**
 * Hook dos estados granulares de loading (UX 2, forma 1).
 * Mede o tempo decorrido desde que `active` ficou true e deriva o rótulo de
 * fase via aiStageLabel (estimativa por timer, front-only — sem tocar backend).
 */
export function useAiStage(
  active: boolean,
  options?: { hasImages?: boolean }
): AiStage | null {
  const startRef = useRef<number>(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const hasImagesRef = useRef(options?.hasImages ?? false);

  // Mantém o snapshot de "tinha imagem" no momento do envio (é lido a cada tick).
  useEffect(() => {
    if (options?.hasImages !== undefined) {
      hasImagesRef.current = options.hasImages;
    }
  }, [options?.hasImages]);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      return;
    }
    startRef.current = Date.now();
    setElapsedMs(0);
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current);
    }, 500);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  return aiStageLabel(elapsedMs, { hasImages: hasImagesRef.current });
}