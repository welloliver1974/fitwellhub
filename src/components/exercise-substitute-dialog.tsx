import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Shuffle, Dumbbell, ChevronRight } from "lucide-react";
import { suggestExerciseSubstitute } from "@/server-fns/workout.functions";
import type { SubstituteSuggestion } from "@/server-fns/workout.functions";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Motivos pré-definidos
// ---------------------------------------------------------------------------
const QUICK_REASONS = [
  { value: "aparelho ocupado", label: "Aparelho ocupado" },
  { value: "treinando em casa", label: "Treinando em casa" },
  { value: "dor ou desconforto", label: "Dor / desconforto" },
  { value: "sem equipamento disponível", label: "Sem equipamento" },
  { value: "variação para o treino", label: "Quero variar" },
  { value: "custom", label: "Outro motivo..." },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ExerciseSubstituteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseName: string;
  session: Session | null;
  onSelect: (newName: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExerciseSubstituteDialog({
  open,
  onOpenChange,
  exerciseName,
  session,
  onSelect,
}: ExerciseSubstituteDialogProps) {
  const [reasonKey, setReasonKey] = useState("aparelho ocupado");
  const [customReason, setCustomReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SubstituteSuggestion[]>([]);

  const effectiveReason =
    reasonKey === "custom" ? customReason.trim() || "outro motivo" : reasonKey;

  const handleSearch = async () => {
    setLoading(true);
    setSuggestions([]);
    try {
      const result = await suggestExerciseSubstitute({
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        data: {
          exercise_name: exerciseName,
          reason: effectiveReason,
        },
      });
      setSuggestions(result.suggestions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar alternativas.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (name: string) => {
    onSelect(name);
    onOpenChange(false);
    setSuggestions([]);
    toast.success(`Exercício substituído por "${name}" nesta sessão`);
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setSuggestions([]);
      setReasonKey("aparelho ocupado");
      setCustomReason("");
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-primary" />
            Substituir Exercício
          </DialogTitle>
          <DialogDescription>
            A IA sugere 3 alternativas equivalentes a{" "}
            <span className="font-semibold text-foreground">{exerciseName}</span>.
            O template original não é alterado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Seletor de motivo */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Motivo da substituição
            </label>
            <Select value={reasonKey} onValueChange={setReasonKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUICK_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {reasonKey === "custom" && (
              <Input
                placeholder="Ex: estou com hérnia de disco..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                maxLength={200}
                className="mt-1"
              />
            )}
          </div>

          {/* Botão buscar */}
          {suggestions.length === 0 && (
            <Button
              onClick={handleSearch}
              disabled={loading || (reasonKey === "custom" && !customReason.trim())}
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando alternativas...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Buscar Alternativas com IA
                </>
              )}
            </Button>
          )}

          {/* Cards de sugestões */}
          {suggestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                3 Alternativas sugeridas
              </p>
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className="rounded-xl border bg-card p-3.5 space-y-1.5 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="font-semibold text-sm">{s.name}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-primary hover:bg-primary/10 shrink-0"
                      onClick={() => handleSelect(s.name)}
                    >
                      Usar este <ChevronRight className="h-3 w-3 ml-0.5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-1.5 pl-8">
                    <Dumbbell className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">{s.muscles}</span>
                  </div>

                  <p className="text-xs text-foreground/80 pl-8">{s.description}</p>

                  <div className="ml-8 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      💡 {s.tip}
                    </p>
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={handleSearch}
                disabled={loading}
                className="w-full gap-2"
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Buscar outras alternativas
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
