import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Fuso fixo do app: Brasil (SP) não tem horário de verão desde 2020 => UTC-3 estável.
const SP_TZ = "America/Sao_Paulo";

// Formata um instant em "YYYY-MM-DD" no timeZone dado, à prova de locale (formatToParts).
// O timeZone explícito torna o resultado independente do fuso do runtime
// (browser, Cloudflare Worker em UTC, servidor de teste, CI).
function toYmd(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// HOJE (ou a data civil do instant) em São Paulo, sempre.
// Não usa getFullYear/getMonth/getDate — esses getters dependem do fuso do runtime,
// e no Cloudflare Worker o runtime é UTC (um registro às 22h de SP cairia no dia seguinte).
export function getLocalDate(date?: Date): string {
  return toYmd(date ?? new Date(), SP_TZ);
}

// Data civil SP de "hoje menos `days` dias", contando DIAS CIVIS em SP.
// (Subtrair ms de Date.now() assume dia de 24h e desliza na virada de fuso.)
export function getLocalDateMinusDays(days: number, from?: Date): string {
  const base = getLocalDate(from); // "2026-08-04" (SP)
  const [y, m, d] = base.split("-").map(Number);
  const epoch = Date.UTC(y, m - 1, d) - days * 86400000; // meia-noite civil pura
  return toYmd(new Date(epoch), "UTC"); // timeZone UTC preserva a data civil
}

// Formata string "YYYY-MM-DD" (data civil do banco) em pt-BR sem construir um
// instant sujeito ao fuso do runtime — o antigo `new Date(x + "T00:00").toLocaleDateString`
// mostrava ONTEM no Worker UTC (00:00Z = 21h do dia anterior em SP).
// opts: Intl.DateTimeFormatOptions (day/month/year/weekday...); timeZone é forçado UTC.
export function formatLocalDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", { timeZone: "UTC", ...opts });
}

// Limites [start, end] ISO UTC do "hoje em SP", para queries gte/lte em colunas
// TIMESTAMP (ex.: workout_sessions.completed_at, gravado com toISOString() em UTC).
export function todayBoundsSaoPaulo(): { start: string; end: string } {
  const [y, m, d] = getLocalDate().split("-").map(Number);
  const startMs = Date.UTC(y, m - 1, d, 3, 0, 0, 0); // 00:00 SP = 03:00Z (UTC-3)
  const start = new Date(startMs);
  const end = new Date(startMs + 86400000 - 1); // 23:59:59.999 do dia SP
  return { start: start.toISOString(), end: end.toISOString() };
}

export function playBeep(_duration = 2000) {
  try {
    const ctx = new AudioContext();
    // Ascendente: corta musica no fone (800→1200→1600Hz, square com harmonicos)
    const freqs = [800, 1200, 1600];
    const beepLen = 0.3;
    const gap = 0.1;
    freqs.forEach((freq, i) => {
      const start = ctx.currentTime + i * (beepLen + gap);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "square";
      gain.gain.setValueAtTime(1.0, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + beepLen);
      osc.start(start);
      osc.stop(start + beepLen);
    });
  } catch {
  }
}
