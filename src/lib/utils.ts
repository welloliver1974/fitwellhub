import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getLocalDate(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function playBeep(_duration = 2000) {
  try {
    const ctx = new AudioContext();
    const freqs = [880, 660, 880];
    const beepLen = 0.4;
    const gap = 0.2;
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
