import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Sparkles } from "lucide-react";
import type { CoachPlan } from "@/lib/coach-plan";

// Card recolhível do plano semanal — componente apresentacional puro.
// Recebe o plano pronto (calculado de forma determinística no sendChat)
// só quando a pergunta tem intenção de plano. Recolhe/expandiu ao toque no
// cabeçalho. Extraído de app.chat.tsx para ser testável com testing-library.
export function PlanCard({ plan }: { plan: CoachPlan }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-xl border bg-card/60 p-3 text-xs">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Plano da semana
            </span>
            <span className="inline-flex items-center gap-2 shrink-0">
              <span className="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                {plan.objective}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          <p className="font-semibold text-foreground">{plan.focus}</p>
          <p className="leading-snug">
            <span className="text-muted-foreground">Hoje: </span>
            {plan.todaySummary}
          </p>
          <div className="space-y-1 rounded-lg bg-background/60 p-2 leading-snug">
            <p>
              <span className="text-muted-foreground">Treino: </span>
              {plan.trainingGoal}
            </p>
            <p>
              <span className="text-muted-foreground">Nutrição: </span>
              {plan.nutritionGoal}
            </p>
            <p>
              <span className="text-muted-foreground">Acompanhamento: </span>
              {plan.trackingGoal}
            </p>
          </div>
          <ul className="space-y-1 leading-snug">
            {plan.checklist.map((item) => (
              <li key={item} className="flex gap-1.5">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground leading-snug">
            Próxima ação: <span className="font-medium text-foreground">{plan.nextAction}</span>
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
