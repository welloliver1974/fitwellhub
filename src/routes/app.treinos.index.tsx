import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn, formatLocalDate, getLocalDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, ChevronRight, ChevronDown, ChevronUp, Dumbbell, Trash2, Copy, Layers, PencilLine, History, RotateCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getSavedSplitRotation, saveSplitRotation } from "@/lib/workout-rotation";

export const Route = createFileRoute("/app/treinos/")({
  component: WorkoutsPage,
});

type Workout = { id: string; name: string; workout_date: string };
type Session = { id: string; name: string; completed_at: string };

type ExerciseSummary = {
  name: string;
  sets: { set_number: number; reps: number; weight_kg: number; completed: boolean }[];
  maxWeight: number;
  totalCompletedSets: number;
};

type SessionDetail = {
  exercises: ExerciseSummary[];
  totalVolume: number;
  totalSets: number;
};

// Instant UTC (completed_at) em data+hora local SP — fuso fixo do app.
function formatSessionWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function WorkoutsPage() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionDetails, setSessionDetails] = useState<Record<string, SessionDetail>>({});
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());
  const [splitOrder, setSplitOrder] = useState<string[]>([]);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitInput, setSplitInput] = useState("");

  const toggleSessionExpand = (id: string) => {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("workouts")
      .select("id,name,workout_date")
      .eq("user_id", user.id)
      .order("workout_date", { ascending: false })
      .limit(50);
    setWorkouts(data ?? []);
  };
  const loadSessions = async () => {
    if (!user) return;
    const { data: sessData } = await supabase
      .from("workout_sessions")
      .select("id,name,completed_at")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false })
      .limit(30);

    const sessList = sessData ?? [];
    setSessions(sessList);

    if (sessList.length > 0) {
      const sessionIds = sessList.map((s) => s.id);
      const { data: setsData } = await supabase
        .from("workout_session_sets")
        .select("session_id,exercise_name,set_number,reps,weight_kg,completed")
        .in("session_id", sessionIds)
        .order("set_number", { ascending: true });

      if (setsData) {
        const detailsMap: Record<string, SessionDetail> = {};

        for (const s of sessList) {
          detailsMap[s.id] = { exercises: [], totalVolume: 0, totalSets: 0 };
        }

        const sessionMap = new Map<string, Map<string, typeof setsData>>();
        for (const item of setsData) {
          if (!sessionMap.has(item.session_id)) {
            sessionMap.set(item.session_id, new Map());
          }
          const exMap = sessionMap.get(item.session_id)!;
          if (!exMap.has(item.exercise_name)) {
            exMap.set(item.exercise_name, []);
          }
          exMap.get(item.exercise_name)!.push(item);
        }

        sessionMap.forEach((exMap, sessionId) => {
          const exercises: ExerciseSummary[] = [];
          let totalVol = 0;
          let totalCompletedCount = 0;

          exMap.forEach((sList, exName) => {
            let maxW = 0;
            let compCount = 0;
            for (const item of sList) {
              const w = Number(item.weight_kg) || 0;
              const r = Number(item.reps) || 0;
              if (w > maxW) maxW = w;
              if (item.completed) {
                compCount++;
                totalVol += w * r;
              }
            }
            totalCompletedCount += compCount || sList.length;
            exercises.push({
              name: exName,
              sets: sList.map((it) => ({
                set_number: it.set_number,
                reps: it.reps,
                weight_kg: Number(it.weight_kg) || 0,
                completed: it.completed,
              })),
              maxWeight: maxW,
              totalCompletedSets: compCount || sList.length,
            });
          });

          detailsMap[sessionId] = {
            exercises,
            totalVolume: totalVol,
            totalSets: totalCompletedCount,
          };
        });

        setSessionDetails(detailsMap);
      }
    } else {
      setSessionDetails({});
    }
  };
  useEffect(() => {
    if (!user) return;
    load();
    loadSessions();
    const saved = getSavedSplitRotation();
    setSplitOrder(saved);
    setSplitInput(saved.join(", "));
  }, [user?.id]);

  const handleSaveSplit = () => {
    const items = splitInput
      .split(/[,>\s-]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (items.length === 0) {
      toast.error("Informe ao menos uma letra (ex: B, C, D, A)");
      return;
    }
    saveSplitRotation(items);
    setSplitOrder(items);
    setSplitDialogOpen(false);
    toast.success(`Ordem de rotação salva: ${items.join(" ➔ ")}`);
  };

  const create = async () => {
    if (!name.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("workouts")
      .insert({ name: name.trim(), user_id: user.id, workout_date: getLocalDate() });
    if (error) return toast.error(error.message);
    setName("");
    setOpen(false);
    toast.success("Treino criado");
    load();
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Sessões concluídas ligadas: o FK workout_id é ON DELETE SET NULL, então o
    // app NÃO as remove ao apagar o treino — sessões órfãs continuariam a inflar
    // a média de treinos/semana e a meta. Excluir junto aqui.
    const { data: sess } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("workout_id", id);
    const sessIds = (sess ?? []).map((s) => s.id);
    if (!confirm(
      sessIds.length > 0
        ? `Excluir este treino, os exercícios e ${sessIds.length} sessão(ões) concluída(s) do histórico?`
        : "Excluir este treino e todos os exercícios?"
    )) return;
    // workout_session_sets são removidas em cascata pela FK (session_id).
    if (sessIds.length) {
      const { error: sessErr } = await supabase
        .from("workout_sessions")
        .delete()
        .in("id", sessIds);
      if (sessErr) return toast.error(sessErr.message);
    }
    const { data: exs } = await supabase.from("exercises").select("id").eq("workout_id", id);
    const exIds = (exs ?? []).map((x) => x.id);
    if (exIds.length) await supabase.from("sets").delete().in("exercise_id", exIds);
    await supabase.from("exercises").delete().eq("workout_id", id);
    const { error } = await supabase.from("workouts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(sessIds.length ? "Treino e sessões excluídos" : "Treino excluído");
    load();
    loadSessions();
  };

  const duplicate = async (w: Workout, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const today = getLocalDate();
    const { data: newW, error } = await supabase
      .from("workouts")
      .insert({ name: w.name, user_id: user.id, workout_date: today })
      .select("id")
      .single();
    if (error || !newW) return toast.error(error?.message ?? "Erro");

    const { data: exs } = await supabase
      .from("exercises")
      .select("id,name,position,notes")
      .eq("workout_id", w.id)
      .order("position");

    if (exs && exs.length) {
      const exIds = exs.map((ex) => ex.id);
      const { data: setsData } = await supabase
        .from("sets")
        .select("exercise_id,set_number,reps,weight_kg")
        .in("exercise_id", exIds);

      const { data: newExs, error: exErr } = await supabase
        .from("exercises")
        .insert(exs.map((ex) => ({
          name: ex.name,
          position: ex.position,
          notes: ex.notes,
          user_id: user.id,
          workout_id: newW.id
        })))
        .select("id,name");

      if (exErr) return toast.error("Erro ao duplicar exercícios");

      if (newExs && newExs.length && setsData && setsData.length) {
        const setsToInsert: any[] = [];
        exs.forEach((originalEx) => {
          const matchingNewEx = newExs.find((n) => n.name === originalEx.name);
          if (matchingNewEx) {
            const originalExSets = setsData.filter((s) => s.exercise_id === originalEx.id);
            originalExSets.forEach((s) => {
              setsToInsert.push({
                exercise_id: matchingNewEx.id,
                user_id: user.id,
                set_number: s.set_number,
                reps: s.reps,
                weight_kg: s.weight_kg,
                completed: false
              });
            });
          }
        });

        if (setsToInsert.length > 0) {
          const { error: setsErr } = await supabase.from("sets").insert(setsToInsert);
          if (setsErr) return toast.error("Erro ao duplicar séries");
        }
      }
    }
    toast.success("Treino duplicado para hoje");
    load();
  };

  const startEditing = (w: Workout, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(w.id);
    setEditName(w.name);
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from("workouts")
      .update({ name: editName.trim() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    toast.success("Nome atualizado");
    load();
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const removeSession = async (sid: string) => {
    if (!confirm("Excluir esta sessão concluída do histórico? A média de treinos/semana e a meta recalcularão.")) return;
    const { error } = await supabase
      .from("workout_sessions")
      .delete()
      .eq("id", sid);
    if (error) return toast.error(error.message);
    toast.success("Sessão excluída do histórico");
    loadSessions();
  };

  return (
    <div className="space-y-4 sm:space-y-5 w-full max-w-full overflow-hidden">
      {/* Header Responsivo Mobile-First */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Treinos</h1>
          {/* Botão Novo em destaque no mobile */}
          <div className="sm:hidden">
            <Button size="sm" onClick={() => setOpen(true)} className="rounded-full h-8 px-3 text-xs gap-1 shadow-sm">
              <Plus className="h-3.5 w-3.5" />
              Novo
            </Button>
          </div>
        </div>

        {/* Barra de atalhos e ações */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link to="/app/treinos/ia">
            <Button size="sm" variant="outline" className="rounded-full h-8 px-2.5 sm:px-3 text-xs border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5 mr-1 text-primary shrink-0" />
              <span className="sm:inline">Assistente IA</span>
            </Button>
          </Link>
          <Link to="/app/templates">
            <Button size="sm" variant="outline" className="rounded-full h-8 px-2.5 sm:px-3 text-xs">
              <Layers className="h-3.5 w-3.5 mr-1 shrink-0" />
              <span>Templates</span>
            </Button>
          </Link>
          <div className="hidden sm:block">
            <Button size="sm" onClick={() => setOpen(true)} className="rounded-full h-8 px-3.5 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Novo
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog de Novo Treino */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo treino</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Peito e tríceps"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button onClick={create} className="rounded-full w-full sm:w-auto">
              Criar treino
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="workouts" className="w-full space-y-3 sm:space-y-4">
        <TabsList className="grid w-full grid-cols-2 p-1 rounded-2xl bg-secondary/40 border border-border/40 h-auto">
          <TabsTrigger
            value="workouts"
            className="rounded-xl py-2 px-1.5 sm:px-3 text-xs sm:text-sm font-medium gap-1 sm:gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm min-w-0"
          >
            <Dumbbell className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
            <span className="truncate">Minhas Fichas</span>
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] sm:text-[11px] h-4 sm:h-5 rounded-full shrink-0">
              {workouts.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="rounded-xl py-2 px-1.5 sm:px-3 text-xs sm:text-sm font-medium gap-1 sm:gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm min-w-0"
          >
            <History className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
            <span className="truncate sm:hidden">Histórico</span>
            <span className="hidden sm:inline truncate">Histórico Concluído</span>
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] sm:text-[11px] h-4 sm:h-5 rounded-full shrink-0">
              {sessions.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workouts" className="space-y-3 sm:space-y-4 mt-0 focus-visible:outline-none">
          {workouts.length > 0 && splitOrder.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 sm:px-3.5 sm:py-2.5 rounded-2xl bg-secondary/30 text-xs border border-border/50">
              <div className="flex items-center gap-2 min-w-0">
                <RotateCw className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-muted-foreground truncate">
                  Divisão:{" "}
                  <strong className="text-foreground font-semibold tracking-wide">
                    {splitOrder.join(" ➔ ")}
                  </strong>
                </span>
              </div>
              <Dialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 rounded-full self-start sm:self-auto shrink-0"
                  >
                    Ajustar divisão
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Ordem da Divisão de Treinos</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <Label>Sequência de Rotação (letras separadas por vírgula)</Label>
                    <Input
                      value={splitInput}
                      onChange={(e) => setSplitInput(e.target.value)}
                      placeholder="B, C, D, A"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      O app sugere automaticamente o próximo treino na página inicial e no Coach IA baseado na última sessão finalizada no histórico.
                      <br />
                      <br />
                      Exemplo atual: ao concluir o treino <strong>D</strong>, o próximo sugerido é o <strong>A</strong>.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleSaveSplit} className="rounded-full w-full sm:w-auto">
                      Salvar sequência
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {workouts.length === 0 ? (
            <Card className="p-8 sm:p-10 text-center">
              <Dumbbell className="h-8 w-8 sm:h-10 sm:w-10 mx-auto text-muted-foreground mb-3 opacity-60" />
              <p className="text-sm sm:text-base text-muted-foreground">Nenhum treino ainda. Crie o primeiro!</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {workouts.map((w) => (
                <Link key={w.id} to="/app/treinos/$id" params={{ id: w.id }} className="block">
                  <Card className="p-3 sm:p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors gap-2 overflow-hidden">
                    <div className="flex-1 min-w-0">
                      {editingId === w.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saveEdit(w.id); }
                              if (e.key === "Escape") cancelEdit();
                            }}
                            onBlur={() => saveEdit(w.id)}
                            className="h-8 text-sm font-medium"
                            autoFocus
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="font-medium text-sm sm:text-base truncate">{w.name}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={(e) => startEditing(w, e)}
                          >
                            <PencilLine className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      )}
                      <p className="text-[11px] sm:text-xs text-muted-foreground">
                        {formatLocalDate(w.workout_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => duplicate(w, e)}
                        title="Duplicar para hoje"
                      >
                        <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => remove(w.id, e)}
                        title="Excluir treino"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 mt-0 focus-visible:outline-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <History className="h-4 w-4 text-primary shrink-0" />
              <h2 className="text-sm sm:text-base font-semibold">Treinos Concluídos</h2>
            </div>
            <span className="text-[11px] sm:text-xs text-muted-foreground">
              {sessions.length} {sessions.length === 1 ? "sessão" : "sessões"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground text-pretty">
            Sessões do histórico alimentam a média de treinos/semana e a meta. Para limpar um
            registro de teste ou duplicado, use o botão de excluir ao lado — as fichas ativas não são afetadas.
          </p>
          {sessions.length === 0 ? (
            <Card className="p-6 sm:p-8 text-center border-dashed">
              <History className="h-7 w-7 sm:h-8 sm:w-8 mx-auto text-muted-foreground mb-2 opacity-50" />
              <p className="text-sm font-medium text-muted-foreground">Nenhuma sessão concluída ainda</p>
              <p className="text-xs text-muted-foreground mt-1">Conclua um treino pelo app ou avise o Hermes no Telegram para salvar!</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => {
                const detail = sessionDetails[s.id];
                const isExpanded = expandedSessionIds.has(s.id);
                const exCount = detail?.exercises?.length ?? 0;

                return (
                  <Card
                    key={s.id}
                    className={cn(
                      "p-3 sm:p-4 transition-all duration-200 overflow-hidden border border-border/60 cursor-pointer select-none",
                      isExpanded ? "bg-secondary/40 shadow-sm border-primary/20" : "hover:bg-secondary/30"
                    )}
                    onClick={() => toggleSessionExpand(s.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm sm:text-base text-foreground truncate">{s.name}</p>
                          {exCount > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary shrink-0">
                              {exCount} {exCount === 1 ? "exercício" : "exercícios"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] sm:text-xs text-muted-foreground flex-wrap">
                          <span>{formatSessionWhen(s.completed_at)}</span>
                          {detail && detail.totalVolume > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-foreground/90 font-medium">
                                {Math.round(detail.totalVolume).toLocaleString("pt-BR")} kg vol.
                              </span>
                            </>
                          )}
                          {detail && detail.totalSets > 0 && (
                            <>
                              <span>•</span>
                              <span>{detail.totalSets} séries</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSession(s.id);
                          }}
                          title="Excluir sessão do histórico"
                          className="h-8 w-8 hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground hover:text-destructive transition-colors" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSessionExpand(s.id);
                          }}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title={isExpanded ? "Recolher detalhes" : "Ver exercícios feitos"}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-primary" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Detalhes dos exercícios concluídos quando expandido */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                        {exCount === 0 ? (
                          <p className="text-xs text-muted-foreground italic py-1">
                            Nenhuma série específica gravada para esta sessão.
                          </p>
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium pb-1">
                              <span>Exercícios realizados:</span>
                              <span>{detail.exercises.length} itens</span>
                            </div>
                            <div className="space-y-1.5">
                              {detail.exercises.map((ex, idx) => (
                                <div
                                  key={idx}
                                  className="p-2.5 rounded-xl bg-background/80 border border-border/40 hover:border-primary/20 transition-colors"
                                >
                                  <div className="flex items-start sm:items-center justify-between gap-2 flex-col sm:flex-row">
                                    <Link
                                      to="/app/exercicios/$name"
                                      params={{ name: encodeURIComponent(ex.name) }}
                                      className="font-medium text-xs sm:text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1.5 group min-w-0"
                                      onClick={(e) => e.stopPropagation()}
                                      title="Ver evolução e gráfico deste exercício"
                                    >
                                      <Dumbbell className="h-3.5 w-3.5 text-primary shrink-0 group-hover:scale-110 transition-transform" />
                                      <span className="truncate group-hover:underline">{ex.name}</span>
                                      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                                    </Link>

                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                                        {ex.totalCompletedSets} {ex.totalCompletedSets === 1 ? "série" : "séries"}
                                      </Badge>
                                      {ex.maxWeight > 0 && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary font-medium">
                                          máx {ex.maxWeight} kg
                                        </Badge>
                                      )}
                                    </div>
                                  </div>

                                  {/* Breakdown das séries com repetições e cargas */}
                                  <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-1.5 border-t border-border/30">
                                    {ex.sets.map((st, sIdx) => (
                                      <div
                                        key={sIdx}
                                        className={cn(
                                          "text-[10px] px-2 py-0.5 rounded-md border flex items-center gap-1",
                                          st.completed
                                            ? "bg-secondary/60 text-foreground border-border/40 font-medium"
                                            : "bg-muted/30 text-muted-foreground border-transparent line-through opacity-60"
                                        )}
                                        title={`Série ${st.set_number}: ${st.reps} reps ${st.weight_kg ? `com ${st.weight_kg}kg` : ""}`}
                                      >
                                        <span className="text-muted-foreground text-[9px]">#{st.set_number}</span>
                                        <span>
                                          {st.weight_kg > 0 ? `${st.weight_kg}kg × ` : ""}
                                          {st.reps} reps
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
