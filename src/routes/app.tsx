import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Home,
  Dumbbell,
  Apple,
  LogOut,
  Sun,
  Moon,
  MessageCircle,
  Bell,
  Ruler,
  SlidersHorizontal,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useReminders } from "@/lib/use-reminders";
import { Link as RLink } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggle } = useTheme();
  useReminders();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);



  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  const tabs = [
    { to: "/app", icon: Home, label: "Hoje" },
    { to: "/app/treinos", icon: Dumbbell, label: "Treinos" },
    { to: "/app/nutricao", icon: Apple, label: "Nutrição" },
    { to: "/app/medidas", icon: Ruler, label: "Medidas" },
    { to: "/app/corpo", icon: Activity, label: "Corpo" },
    { to: "/app/chat", icon: MessageCircle, label: "Coach" },
    { to: "/app/ia", icon: SlidersHorizontal, label: "IA" },
  ] as const;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/app" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Apple className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold">Fit Well Hub</span>
          </Link>
          <div className="flex items-center gap-1">
            <RLink to="/app/lembretes">
              <Button variant="ghost" size="icon" title="Lembretes">
                <Bell className="h-4 w-4" />
              </Button>
            </RLink>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-10 border-t bg-card/95 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-1 py-2 flex items-center justify-between overflow-x-auto">
          {tabs.map(({ to, icon: Icon, label }) => {
            const active = to === "/app" ? path === "/app" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-1.5 sm:px-2 py-2 rounded-xl transition-colors min-w-0 shrink-0",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden sm:block text-[9px] font-medium truncate w-full text-center leading-tight">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
