import { playBeep } from "@/lib/utils";

/**
 * Calcula os segundos restantes até o target timestamp de forma absoluta.
 * Garante que mesmo com throttling de setInterval quando a tela do celular apaga,
 * o relógio esteja perfeitamente sincronizado com o tempo real.
 */
export function calculateRemainingSeconds(targetTimeMs: number, nowMs: number = Date.now()): number {
  if (!targetTimeMs || targetTimeMs <= nowMs) return 0;
  return Math.max(0, Math.ceil((targetTimeMs - nowMs) / 1000));
}

/**
 * Solicita permissão do navegador para exibir notificações de sistema (Web Notifications).
 */
export async function requestRestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted") {
    return "granted";
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export interface RestAlertOptions {
  exerciseName?: string;
  workoutId?: string;
}

/**
 * Dispara o alerta completo de término de descanso:
 * 1. Bipes sonoros via AudioContext
 * 2. Vibração tátil do dispositivo (navigator.vibrate)
 * 3. Notificação do sistema via Service Worker (visível mesmo com tela bloqueada)
 */
export async function triggerRestCompletedAlert(options: RestAlertOptions = {}): Promise<void> {
  // 1. Som
  playBeep();

  // 2. Vibração tátil física
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([250, 100, 250, 100, 250]);
    } catch {}
  }

  // 3. Notificação visual de sistema
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title = "⏰ Descanso finalizado!";
  const body = options.exerciseName
    ? `Hora da próxima série de ${options.exerciseName}!`
    : "Hora da próxima série!";
  const url = options.workoutId
    ? `/app/treinos/${options.workoutId}/foco`
    : "/app/treinos";

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && "showNotification" in registration) {
        await registration.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          vibrate: [250, 100, 250, 100, 250],
          tag: "fitwell-rest-timer",
          renotify: true,
          data: { url },
        } as NotificationOptions);
        return;
      }
    }

    // Fallback se Service Worker não estiver pronto
    new Notification(title, {
      body,
      icon: "/icon-192.png",
      tag: "fitwell-rest-timer",
    });
  } catch (err) {
    console.warn("Não foi possível disparar notificação do timer:", err);
  }
}
