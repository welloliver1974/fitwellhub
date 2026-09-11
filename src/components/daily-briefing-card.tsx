import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getLocalDate } from "@/lib/utils";
import { getPeriodOfDay, type BriefingResult, type DayPeriod } from "@/lib/briefing-utils";
import { getDailyBriefing } from "@/server-fns/briefing.functions";
import { Sun, Flame, Moon, Sparkles, RotateCw, ArrowRight, Bot } from "lucide-react";
import { toast } from "sonner";

interface DailyBriefingCardProps {
  userId?: string;
  workoutName?: string | null;
  hasWorkoutToday?: boolean;
  caloriesConsumed?: number;
  caloriesGoal?: number;
  proteinConsumed?: number;
  proteinGoal?: number;
  waterMl?: number;
  waterGoal?: number;
}

export function DailyBriefingCard({
  userId,
  workoutName,
  hasWorkoutToday,
  caloriesConsumed,
  caloriesGoal,
  proteinConsumed,
  proteinGoal,
  waterMl,
  waterGoal,
}: DailyBriefingCardProps) {
  const today = getLocalDate();
  const period = getPeriodOfDay();
  const cacheKey = `fitwell-briefing-${userId || "guest"}-${today}-${period}`;

  const [briefing, setBriefing] = useState<BriefingResult | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!briefing);

  const fetchBriefing = async (force = false) => {
    if (!force && briefing) return;
    setLoading(true);
    try {
      const res = await getDailyBriefing({
        data: {
          period,
          workoutName,
          hasWorkoutToday,
          caloriesConsumed,
          caloriesGoal,
          proteinConsumed,
          proteinGoal,
          waterMl,
          waterGoal,
        },
      });
      setBriefing(res);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(res));
      } catch {}
    } catch (err: any) {
      console.warn("Erro ao carregar daily briefing:", err);
      toast.error("Não foi possível atualizar o briefing da IA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!briefing) {
      fetchBriefing(false);
    }
  }, [cacheKey]);

  const PeriodIcon = period === "manha" ? Sun : period === "tarde" ? Flame : Moon;

  if (loading && !briefing) {
    return (
      <Card className="p-4 bg-gradient-to-br from-card via-card to-primary/5 border-primary/20 shadow-xs animate-pulse">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-4 w-4 rounded-full bg-primary/20" />
          <div className="h-3 w-28 rounded bg-muted" />
        </div>
        <div className="h-5 w-48 rounded bg-muted mb-2" />
        <div className="h-4 w-full rounded bg-muted/70" />
      </Card>
    );
  }

  if (!briefing) return null;

  return (
    <Card className="relative overflow-hidden p-4 sm:p-5 bg-gradient-to-br from-card via-card to-primary/10 border-primary/25 shadow-sm">
      {/* Glow decorativo sutil */}
      <div className="absolute top-0 right-0 -mt-6 -mr-6 w-24 h-24 bg-primary/15 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-1">
            <Bot className="h-3.5 w-3.5 text-primary" />
            Coach IA • Briefing {period === "manha" ? "Matinal" : period === "tarde" ? "da Tarde" : "Noturno"}
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => fetchBriefing(true)}
          disabled={loading}
          title="Recalcular briefing"
        >
          <RotateCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
          <PeriodIcon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm sm:text-base text-foreground mb-1 leading-snug">
            {briefing.title}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {briefing.message}
          </p>

          {briefing.actionText && briefing.actionLink && (
            <div className="mt-3 flex items-center gap-2">
              <Link
                to={briefing.actionLink as any}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <span>{briefing.actionText}</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
