// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const xdgConfigHome = path.resolve(process.cwd(), ".cache", "xdg-config");
fs.mkdirSync(xdgConfigHome, { recursive: true });
process.env.XDG_CONFIG_HOME = xdgConfigHome;

export default defineConfig({
  cloudflare: process.env.VERCEL ? false : true,
  tanstackStart: {
    server: {
      preset: process.env.VERCEL ? "vercel" : undefined,
    },
  },
  vite: {
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          // Divide dependências estáveis em chunks nomeados por janela de uso.
          // Objetivos: (1) aliviar o entry `index` (que carrega em toda rota),
          // (2) paralelizar downloads e (3) melhorar cache hit entre deploys
          // (deps mudam menos que o código do app). A primeira regra que casa vence.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("jspdf") || id.includes("html2canvas")) return "pdf";
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("/recharts/") || id.includes("recharts/")) return "charts";
            if (id.includes("@radix-ui")) return "radix";
            if (id.includes("@tanstack/react-query")) return "query";
            if (id.includes("@tanstack/")) return "router";
            if (
              id.includes("react-router") ||
              /node_modules\/(react|react-dom|scheduler)\//.test(id)
            )
              return "react";
            if (
              id.includes("react-hook-form") ||
              id.includes("@hookform/resolvers") ||
              id.includes("zod") ||
              id.includes("input-otp") ||
              id.includes("react-day-picker")
            )
              return "forms";
            if (
              id.includes("lucide-react") ||
              id.includes("cmdk") ||
              id.includes("class-variance-authority") ||
              id.includes("clsx") ||
              id.includes("tailwind-merge")
            )
              return "ui-utils";
            if (
              id.includes("embla-carousel") ||
              id.includes("vaul") ||
              id.includes("react-resizable-panels") ||
              id.includes("tw-animate-css") ||
              id.includes("sonner")
            )
              return "ui-misc";
          },
        },
      },
    },
    test: {
      environment: "node",
      // jsdom só nos testes de UI (*.component.test.tsx) via docblock
      // `// @vitest-environment jsdom` no topo do arquivo (Vitest 4 não tem
      // mais environmentMatchGlobs). A lógica pura de src/lib/*.test.ts segue
      // em node (mais rápido, sem DOM).
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["src/test/setup.ts"],
    },
  },
});
