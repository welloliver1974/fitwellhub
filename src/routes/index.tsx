import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Dumbbell, Apple, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
            <Apple className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-xl">Fit Well Hub</span>
        </div>
        <Link to="/auth">
          <Button variant="ghost">Entrar</Button>
        </Link>
      </header>

      <main className="px-6 py-12 max-w-6xl mx-auto">
        <section className="text-center max-w-2xl mx-auto py-12 md:py-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" /> Nutrição com IA
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
            Treino e nutrição,
            <br />
            <span className="text-primary">em um só lugar.</span>
          </h1>
          <p className="text-lg text-muted-foreground mt-6 max-w-xl mx-auto">
            Registre suas séries de musculação e refeições do dia. A IA estima calorias e macros
            automaticamente.
          </p>
          <div className="mt-8 flex gap-3 justify-center">
            <Link to="/auth">
              <Button size="lg" className="rounded-full px-8">
                Começar grátis
              </Button>
            </Link>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4 mt-12">
          <FeatureCard
            icon={<Dumbbell className="h-5 w-5" />}
            title="Treinos completos"
            desc="Exercícios, séries, repetições e cargas. Histórico completo."
          />
          <FeatureCard
            icon={<Apple className="h-5 w-5" />}
            title="Diário alimentar"
            desc="Digite o alimento e receba os macros instantaneamente."
          />
          <FeatureCard
            icon={<TrendingUp className="h-5 w-5" />}
            title="Metas & progresso"
            desc="Acompanhe metas diárias de calorias e macros."
          />
        </section>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="p-6 rounded-2xl border bg-card hover:shadow-[var(--shadow-soft)] transition-shadow">
      <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="font-display font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{desc}</p>
    </div>
  );
}
