import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Component, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/lib/theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Fit Well Hub — Treino & Nutrição" },
      {
        name: "description",
        content: "Acompanhe seus treinos de musculação e refeições com dados nutricionais por IA.",
      },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Fit Well Hub — Treino & Nutrição" },
      {
        property: "og:description",
        content: "Acompanhe seus treinos de musculação e refeições com dados nutricionais por IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Fit Well Hub — Treino & Nutrição" },
      {
        name: "twitter:description",
        content: "Acompanhe seus treinos de musculação e refeições com dados nutricionais por IA.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f5f18780-260c-40c8-83f5-499370a53254/id-preview-c4138755--abc69c38-0d4a-46eb-96b3-f0416eff75a9.lovable.app-1777947093532.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f5f18780-260c-40c8-83f5-499370a53254/id-preview-c4138755--abc69c38-0d4a-46eb-96b3-f0416eff75a9.lovable.app-1777947093532.png",
      },
      { name: "theme-color", content: "#0a0a0a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Fit Well Hub" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.classList.add(t);else document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}})()`,
        }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <script dangerouslySetInnerHTML={{
          __html: `if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js")`,
        }} />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </ThemeProvider>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
          <h1 className="text-6xl font-bold text-foreground">Oops!</h1>
          <p className="mt-4 text-muted-foreground">Algo deu errado ao carregar esta página.</p>
          <Link
            to="/app"
            className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => this.setState({ hasError: false })}
          >
            Voltar ao início
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}
