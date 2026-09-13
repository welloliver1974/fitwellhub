import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLocalDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Undo2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Layers,
  Dumbbell,
  Timer,
  Lightbulb,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  saveWorkoutBackup,
  getWorkoutBackup,
  hasWorkoutBackup,
  type GeneratedRoutine,
  type GeneratedWorkout,
  type WorkoutSnapshot,
  type BackupSnapshot,
} from "@/lib/workout-ai-utils";
import { generateAiWorkoutRoutine } from "@/server-fns/workout-generator.functions";
import { saveSplitRotation } from "@/lib/workout-rotation";
import { getAiSettingsLocal } from "@/lib/ai-settings";
import { WorkoutCoachChat } from "@/components/workout-coach-chat";

export const Route = createFileRoute("/app/treinos/ia")({
  component: WorkoutAiAssistantPage,
});

function WorkoutAiAssistantPage() {
  const { user, session } = useAuth();
  const navigate = useNavigate();

  // Estados de dados atuais
  type CurrentWorkoutInfo = {
    id: string;
    name: string;
    exercises: string[];
  };
  const [currentWorkouts, setCurrentWorkouts] = useState<CurrentWorkoutInfo[]>([]);
  const [showWorkoutsDetails, setShowWorkoutsDetails] = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [backupInfo, setBackupInfo] = useState<BackupSnapshot | null>(null);

  // Estados do formulário do assistente
  const [mode, setMode] = useState<"optimize" | "new">("optimize");
  const [goal, setGoal] = useState<"hipertrofia" | "forca" | "definicao" | "saude">("hipertrofia");
  const [frequency, setFrequency] = useState<number>(4);
  const [equipment, setEquipment] = useState<"academia" | "condominio" | "casa">("academia");
  const [focusRestrictions, setFocusRestrictions] = useState("");

  // Estados da geração de IA
  const [isGenerating, setIsGenerating] = useState(false);
  const [routine, setRoutine] = useState<GeneratedRoutine | null>(null);
  const [diagnosisText, setDiagnosisText] = useState("");
  const [expandedWorkouts, setExpandedWorkouts] = useState<Record<number, boolean>>({ 0: true });

  // Modais
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Carregar estado atual e backup existente
  const loadInitialData = async () => {
    if (!user?.id) return;
    setLoadingCurrent(true);
    try {
      setBackupInfo(getWorkoutBackup());

      const { data: workoutsData } = await supabase
        .from("workouts")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name");

      if (workoutsData && workoutsData.length > 0) {
        const wIds = workoutsData.map((w) => w.id);
        const { data: exs } = await supabase
          .from("exercises")
          .select("workout_id, name")
          .eq("user_id", user.id)
          .in("workout_id", wIds)
          .order("position");

        const byW: Record<string, string[]> = {};
        (exs ?? []).forEach((e) => {
          if (!byW[e.workout_id]) byW[e.workout_id] = [];
          byW[e.workout_id].push(e.name);
        });

        const items: CurrentWorkoutInfo[] = workoutsData.map((w) => ({
          id: w.id,
          name: w.name,
          exercises: byW[w.id] ?? [],
        }));
        setCurrentWorkouts(items);
      } else {
        setCurrentWorkouts([]);
      }
    } catch (err) {
      console.error("Erro ao carregar dados atuais:", err);
    } finally {
      setLoadingCurrent(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadInitialData();
    }
  }, [user?.id]);

  // Disparar geração pela IA
  const handleGenerate = async () => {
    setIsGenerating(true);
    setRoutine(null);
    try {
      const localSettings = getAiSettingsLocal();
      const localProvider = localSettings?.provider || "groq";
      let localApiKey = "";
      let localModel = "";
      let localBaseUrl = "";

      if (localProvider === "groq") {
        localApiKey = localSettings?.groq_api_key || "";
        localModel = localSettings?.groq_model || "";
      } else if (localProvider === "openrouter") {
        localApiKey = localSettings?.openrouter_api_key || "";
        localModel = localSettings?.openrouter_model || "";
      } else if (localProvider === "nvidia") {
        localApiKey = localSettings?.openrouter_api_key || "";
        localModel = localSettings?.nvidia_model || "";
      } else if (localProvider === "omniroute") {
        localApiKey = localSettings?.omniroute_api_key || "";
        localModel = localSettings?.custom_model || "";
        localBaseUrl = localSettings?.custom_base_url || "";
      }

      const res = await generateAiWorkoutRoutine({
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        data: {
          mode,
          goal,
          frequency,
          equipment,
          focusRestrictions: focusRestrictions.trim(),
          clientProvider: localProvider,
          clientApiKey: localApiKey || undefined,
          clientModel: localModel || undefined,
          clientBaseUrl: localBaseUrl || undefined,
        },
      });

      if (!res?.routine?.workouts || !Array.isArray(res.routine.workouts) || res.routine.workouts.length === 0) {
        throw new Error("A IA não conseguiu retornar a estrutura de treinos. Tente novamente.");
      }

      setRoutine(res.routine);
      setDiagnosisText(res.diagnosis || "");
      // Abre todos os treinos no preview
      const exp: Record<number, boolean> = {};
      res.routine.workouts.forEach((_, idx) => (exp[idx] = true));
      setExpandedWorkouts(exp);
      toast.success("Proposta de treino gerada com sucesso!");
    } catch (err: any) {
      console.error("Erro ao gerar treino IA:", err);
      toast.error(err?.message || "Erro ao consultar a IA");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleExpand = (idx: number) => {
    setExpandedWorkouts((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Coletar snapshot dos treinos atuais antes de aplicar
  const captureCurrentSnapshot = async (): Promise<WorkoutSnapshot[]> => {
    const { data: workouts } = await supabase
      .from("workouts")
      .select("id, name, workout_date")
      .order("name");

    if (!workouts || workouts.length === 0) return [];

    const wIds = workouts.map((w) => w.id);
    const { data: exercises } = await supabase
      .from("exercises")
      .select("id, workout_id, name, position, notes")
      .in("workout_id", wIds)
      .order("position");

    const exIds = (exercises ?? []).map((e) => e.id);
    const { data: sets } = exIds.length
      ? await supabase.from("sets").select("exercise_id, set_number, reps, weight_kg").in("exercise_id", exIds)
      : { data: [] };

    return workouts.map((w) => {
      const wExs = (exercises ?? []).filter((e) => e.workout_id === w.id);
      return {
        name: w.name,
        workout_date: w.workout_date,
        exercises: wExs.map((e) => {
          const eSets = (sets ?? []).filter((s) => s.exercise_id === e.id);
          return {
            name: e.name,
            position: e.position,
            notes: e.notes,
            sets: eSets.map((s) => ({
              set_number: s.set_number,
              reps: s.reps,
              weight_kg: s.weight_kg,
            })),
          };
        }),
      };
    });
  };

  // Aplicar a rotina gerada no app
  const handleConfirmApply = async () => {
    if (!routine?.workouts || !user) {
      toast.error("Nenhuma rotina gerada para aplicar.");
      return;
    }
    setIsApplying(true);

    try {
      // 1. Criar ponto de restauração (backup) antes de alterar qualquer coisa
      const currentSnapshots = await captureCurrentSnapshot();
      if (currentSnapshots.length > 0) {
        const backup = saveWorkoutBackup(currentSnapshots, "Meu Treino Original");
        setBackupInfo(backup);
      }

      // 2. Limpar treinos antigos ativos (apenas treinos e exercícios da grade ativa, mantendo sessões e histórico!)
      const { data: oldWorkouts } = await supabase.from("workouts").select("id").eq("user_id", user.id);
      const oldIds = (oldWorkouts ?? []).map((w) => w.id);
      if (oldIds.length > 0) {
        const { data: oldExs } = await supabase.from("exercises").select("id").in("workout_id", oldIds);
        const oldExIds = (oldExs ?? []).map((e) => e.id);
        if (oldExIds.length > 0) {
          await supabase.from("sets").delete().in("exercise_id", oldExIds);
          await supabase.from("exercises").delete().in("id", oldExIds);
        }
        await supabase.from("workouts").delete().in("id", oldIds);
      }

      // 3. Inserir os novos treinos em lote
      const today = getLocalDate();
      const newSplitLetters: string[] = [];

      for (let i = 0; i < routine.workouts.length; i++) {
        const w = routine.workouts[i];
        if (w.letter) newSplitLetters.push(w.letter);

        const { data: createdW, error: wErr } = await supabase
          .from("workouts")
          .insert({
            name: w.name,
            workout_date: today,
            user_id: user.id,
          })
          .select("id")
          .single();

        if (wErr || !createdW) throw new Error(wErr?.message || "Erro ao criar treino");

        // Inserir exercícios
        for (let j = 0; j < w.exercises.length; j++) {
          const ex = w.exercises[j];
          const { data: createdEx, error: exErr } = await supabase
            .from("exercises")
            .insert({
              workout_id: createdW.id,
              name: ex.name,
              position: j + 1,
            })
            .select("id")
            .single();

          if (exErr || !createdEx) continue;

          // Inserir séries padrão sugeridas
          const setsCount = ex.sets || 3;
          const setsPayload = Array.from({ length: setsCount }).map((_, sIdx) => ({
            exercise_id: createdEx.id,
            set_number: sIdx + 1,
            reps: null,
            weight_kg: null,
            completed: false,
          }));

          await supabase.from("sets").insert(setsPayload);
        }
      }

      // Salvar a rotação com as novas letras se houver
      if (newSplitLetters.length > 0) {
        saveSplitRotation(newSplitLetters);
      }

      toast.success("Nova rotina aplicada com sucesso na sua grade ativa!");
      setApplyDialogOpen(false);
      navigate({ to: "/app/treinos" });
    } catch (err: any) {
      console.error("Erro ao aplicar rotina:", err);
      toast.error(err?.message || "Erro ao aplicar nova rotina");
    } finally {
      setIsApplying(false);
    }
  };

  // Salvar apenas como Template (alternativa que não toca na grade ativa)
  const handleSaveAsTemplates = async () => {
    if (!routine?.workouts || !user) {
      toast.error("Nenhuma rotina gerada para salvar como template.");
      return;
    }
    try {
      for (const w of routine.workouts) {
        const { data: tpl, error: tplErr } = await supabase
          .from("workout_templates")
          .insert({ name: w.name, user_id: user.id })
          .select("id")
          .single();

        if (tplErr || !tpl) continue;

        const exsToInsert = w.exercises.map((ex, idx) => ({
          template_id: tpl.id,
          name: ex.name,
          position: idx + 1,
        }));

        await supabase.from("workout_template_exercises").insert(exsToInsert);
      }

      toast.success("Rotina salva na seção de Templates!");
      navigate({ to: "/app/templates" });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar templates");
    }
  };

  // Restaurar treino original a partir do backup
  const handleConfirmRestore = async () => {
    if (!backupInfo?.workouts || !user) {
      toast.error("Nenhum backup disponível para restauração.");
      return;
    }
    setIsRestoring(true);

    try {
      // 1. Limpar treinos da grade atual
      const { data: curWorkouts } = await supabase.from("workouts").select("id").eq("user_id", user.id);
      const curIds = (curWorkouts ?? []).map((w) => w.id);
      if (curIds.length > 0) {
        const { data: curExs } = await supabase.from("exercises").select("id").in("workout_id", curIds);
        const curExIds = (curExs ?? []).map((e) => e.id);
        if (curExIds.length > 0) {
          await supabase.from("sets").delete().in("exercise_id", curExIds);
          await supabase.from("exercises").delete().in("id", curExIds);
        }
        await supabase.from("workouts").delete().in("id", curIds);
      }

      // 2. Recriar treinos a partir do snapshot salvo
      const restoredLetters: string[] = [];

      for (const snap of backupInfo.workouts) {
        const match = snap.name.match(/^(?:treino\s+)?([a-zA-Z])(?:\s*[-–:]|\s+|$)/i);
        if (match) restoredLetters.push(match[1].toUpperCase());

        const { data: newW, error: wErr } = await supabase
          .from("workouts")
          .insert({
            name: snap.name,
            workout_date: snap.workout_date || getLocalDate(),
            user_id: user.id,
          })
          .select("id")
          .single();

        if (wErr || !newW) continue;

        for (const ex of snap.exercises) {
          const { data: newEx, error: exErr } = await supabase
            .from("exercises")
            .insert({
              workout_id: newW.id,
              user_id: user.id,
              name: ex.name,
              position: ex.position,
              notes: ex.notes,
            })
            .select("id")
            .single();

          if (exErr || !newEx) continue;

          if (ex.sets && ex.sets.length > 0) {
            const setsToInsert = ex.sets.map((s) => ({
              exercise_id: newEx.id,
              user_id: user.id,
              set_number: s.set_number,
              reps: s.reps,
              weight_kg: s.weight_kg,
              completed: false,
            }));
            await supabase.from("sets").insert(setsToInsert);
          }
        }
      }

      if (restoredLetters.length > 0) {
        saveSplitRotation(restoredLetters);
      }

      setRestoreDialogOpen(false);
      toast.success("Treino original restaurado com sucesso!");
      await loadInitialData();
      navigate({ to: "/app/treinos" });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao restaurar treino original");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar com Navegação */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/app/treinos">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Assistente de Treinos IA
            </h1>
            <p className="text-xs text-muted-foreground">
              Ambiente de planejamento dedicado e seguro
            </p>
          </div>
        </div>

        {backupInfo && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRestoreDialogOpen(true)}
            className="rounded-full text-xs border-amber-500/40 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500"
          >
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Restaurar Original
          </Button>
        )}
      </div>

      {/* Card de Garantia de Segurança */}
      <Card className="p-4 bg-emerald-950/20 border-emerald-500/30 rounded-2xl">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-emerald-200">
              Seus treinos e histórico estão 100% seguros
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Tudo o que você planejar aqui é uma <strong>proposta de rascunho</strong>. Nada no seu aplicativo é alterado até você decidir clicar em <em>"Aplicar Ficha"</em>. Além disso, o app cria um ponto de restauração automático para você voltar para o seu treino antigo com 1 clique sempre que quiser.
            </p>
          </div>
        </div>
      </Card>

      {/* Card: O que a IA detectou nos seus treinos atuais - Compacto & Retrátil */}
      <Card className="p-3.5 sm:p-4 rounded-2xl border-border/60 bg-card/60 backdrop-blur-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Dumbbell className="h-4 w-4 text-primary shrink-0" />
            <h2 className="text-sm font-semibold truncate">Seus Treinos Atuais</h2>
            {currentWorkouts.length > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4 rounded-full font-normal">
                {currentWorkouts.length} {currentWorkouts.length === 1 ? "ficha" : "fichas"}
              </Badge>
            )}
          </div>
          {currentWorkouts.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowWorkoutsDetails(!showWorkoutsDetails)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 shrink-0 rounded-lg"
            >
              <span>{showWorkoutsDetails ? "Ocultar" : "Ver exercícios"}</span>
              {showWorkoutsDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>

        {loadingCurrent ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Consultando fichas ativas...
          </div>
        ) : currentWorkouts.length > 0 ? (
          <div className="space-y-2.5">
            {/* Visualização limpa e compacta em chips/tags */}
            <div className="flex flex-wrap gap-1.5">
              {currentWorkouts.map((w) => (
                <div
                  key={w.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-secondary/40 border border-border/50 text-xs font-medium text-foreground"
                >
                  <span className="truncate max-w-[180px] sm:max-w-[260px]">{w.name}</span>
                  <span className="text-[10px] text-muted-foreground font-normal shrink-0">
                    ({w.exercises.length} exs)
                  </span>
                </div>
              ))}
            </div>

            {/* Gaveta retrátil com exercícios detalhados (abre apenas se o usuário quiser ver) */}
            {showWorkoutsDetails && (
              <div className="pt-2 border-t border-border/40 max-h-60 overflow-y-auto space-y-2 pr-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentWorkouts.map((w) => (
                    <div
                      key={w.id}
                      className="p-2.5 rounded-xl bg-secondary/25 border border-border/40 text-xs space-y-1"
                    >
                      <p className="font-semibold text-foreground truncate">{w.name}</p>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        {w.exercises.length > 0 ? w.exercises.join(" • ") : "Nenhum exercício cadastrado"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-0.5">
              <Lightbulb className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              A IA usa essas fichas como referência para otimizar séries, volumes e descansos.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic py-1">
            Nenhum treino cadastrado ainda. A IA montará uma divisão completa para você.
          </p>
        )}
      </Card>

      {/* Formulário de Configuração da Proposta */}
      <Card className="p-4 sm:p-5 rounded-2xl border-border/60 space-y-4">
        <h2 className="text-sm font-semibold">Como você deseja a ajuda da IA?</h2>

        {/* Escolha de Modo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setMode("optimize")}
            className={`p-3 rounded-xl text-left border transition-all ${
              mode === "optimize"
                ? "bg-primary/10 border-primary text-foreground"
                : "bg-secondary/20 border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Otimizar Meus Treinos Atuais (Recomendado)
            </p>
            <p className="text-[11px] mt-1 text-muted-foreground">
              Mantém a base do que você já faz, corrigindo volumes e aperfeiçoando séries e descansos.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode("new")}
            className={`p-3 rounded-xl text-left border transition-all ${
              mode === "new"
                ? "bg-primary/10 border-primary text-foreground"
                : "bg-secondary/20 border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Montar Nova Divisão Sob Medida
            </p>
            <p className="text-[11px] mt-1 text-muted-foreground">
              Cria uma ficha do zero com base no seu objetivo e quantidade de dias escolhida.
            </p>
          </button>
        </div>

        {/* Parâmetros: Objetivo e Frequência */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div>
            <Label className="text-xs">Objetivo Principal</Label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value as any)}
              className="mt-1.5 w-full h-9 px-3 rounded-lg bg-background border border-input text-xs"
            >
              <option value="hipertrofia">Hipertrofia (Massa Muscular)</option>
              <option value="forca">Força Pura</option>
              <option value="definicao">Definição / Emagrecimento</option>
              <option value="saude">Saúde e Longevidade</option>
            </select>
          </div>

          <div>
            <Label className="text-xs">Frequência Semanal</Label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              className="mt-1.5 w-full h-9 px-3 rounded-lg bg-background border border-input text-xs"
            >
              <option value={3}>3 dias por semana (ABC / Full Body)</option>
              <option value={4}>4 dias por semana (BCDA / Upper-Lower)</option>
              <option value={5}>5 dias por semana (PPL + Upper-Lower)</option>
              <option value={6}>6 dias por semana (PPL 2x)</option>
            </select>
          </div>

          <div>
            <Label className="text-xs">Equipamento Disponível</Label>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value as any)}
              className="mt-1.5 w-full h-9 px-3 rounded-lg bg-background border border-input text-xs"
            >
              <option value="academia">Academia Completa</option>
              <option value="condominio">Condomínio / Halteres</option>
              <option value="casa">Em Casa (Halteres / Calistenia)</option>
            </select>
          </div>
        </div>

        {/* Foco e Restrições Livres */}
        <div>
          <Label className="text-xs">Foco Específico ou Restrições (Opcional)</Label>
          <Input
            value={focusRestrictions}
            onChange={(e) => setFocusRestrictions(e.target.value)}
            placeholder="Ex: Sem agachamento por dor no joelho; ênfase em deltóide lateral e tríceps"
            className="mt-1.5 text-xs h-9"
          />
        </div>

        {/* Botão de Disparo da IA */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full rounded-full py-5 text-sm font-semibold shadow-md gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              O Coach IA está analisando seus dados e montando a rotina...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Gerar Proposta com IA
            </>
          )}
        </Button>
      </Card>

      {/* Pré-visualização da Rotina Gerada */}
      {routine && (
        <div className="space-y-4 pt-2">
          <div className="p-4 rounded-2xl bg-secondary/30 border border-border/60 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                {routine.title}
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                Divisão {routine.split_type} • {routine.weekly_frequency}x por semana
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {routine.description}
            </p>
            {diagnosisText && (
              <p className="text-[11px] text-muted-foreground/80 italic border-t border-border/40 pt-1.5">
                {diagnosisText}
              </p>
            )}
          </div>

          {/* Lista de Treinos da Proposta */}
          <div className="space-y-3">
            {routine?.workouts?.map((w, wIdx) => {
              const isExpanded = expandedWorkouts[wIdx] ?? false;
              return (
                <Card key={wIdx} className="rounded-2xl border-border/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpand(wIdx)}
                    className="w-full p-3.5 sm:p-4 text-left flex items-center justify-between hover:bg-secondary/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                        {w.letter || String.fromCharCode(65 + wIdx)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{w.name}</p>
                        <p className="text-xs text-muted-foreground">{w.focus}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {w.exercises?.length ?? 0} exercícios
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-3.5 sm:p-4 pt-0 border-t border-border/40 space-y-2">
                      {(w.exercises ?? []).map((ex, exIdx) => (
                        <div
                          key={exIdx}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/20 border border-border/30 text-xs"
                        >
                          <div className="space-y-0.5">
                            <p className="font-medium text-foreground">
                              {exIdx + 1}. {ex.name}
                            </p>
                            {ex.notes && (
                              <p className="text-[11px] text-muted-foreground">{ex.notes}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-semibold text-primary">
                              {ex.sets} × {ex.reps_range}
                            </span>
                            <p className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                              <Timer className="h-3 w-3" />
                              {ex.rest_seconds}s descanso
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Dicas do Treinador */}
          {routine.coach_tips && routine.coach_tips.length > 0 && (
            <Card className="p-4 rounded-2xl bg-primary/5 border-primary/20 space-y-1.5">
              <h4 className="text-xs font-semibold flex items-center gap-1.5 text-primary">
                <Lightbulb className="h-4 w-4" />
                Dicas Estratégicas do Coach para esta Ficha
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1 pl-4 list-disc">
                {routine.coach_tips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Barra de Ações Finais */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <Button
              onClick={() => setApplyDialogOpen(true)}
              className="flex-1 rounded-full py-5 text-sm font-semibold shadow-md gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Aplicar Ficha no Meu App
            </Button>

            <Button
              variant="outline"
              onClick={handleSaveAsTemplates}
              className="rounded-full py-5 text-sm gap-2"
            >
              <Layers className="h-4 w-4" />
              Salvar como Templates (Sem Alterar Grade)
            </Button>
          </div>
        </div>
      )}

      {/* Diálogo de Confirmação: Aplicar no App */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              Aplicar Nova Ficha de Treinos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs text-muted-foreground leading-relaxed">
            <p>
              Ao confirmar, o FitWell Hub atualizará a sua grade de treinos ativos com a nova divisão ({routine?.split_type}).
            </p>
            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-200 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Ponto de Restauração Automático
              </p>
              <p className="text-[11px] text-muted-foreground">
                Um backup completo dos seus treinos anteriores será criado. Se você quiser voltar para o seu treino antigo, basta tocar em <em>"Restaurar Original"</em> a qualquer momento.
              </p>
            </div>
            <p>
              Suas sessões passadas, histórico de cargas e marcas pessoais continuam 100% seguros no banco de dados.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setApplyDialogOpen(false)}
              disabled={isApplying}
              className="rounded-full"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmApply}
              disabled={isApplying}
              className="rounded-full gap-2"
            >
              {isApplying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gravando treinos...
                </>
              ) : (
                "Confirmar e Aplicar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Confirmação: Restaurar Treino Original */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-amber-500" />
              Restaurar Meu Treino Original
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs text-muted-foreground leading-relaxed">
            <p>
              Você possui um ponto de restauração salvo em:
              <strong className="block text-foreground mt-0.5">
                {backupInfo?.created_at
                  ? new Date(backupInfo.created_at).toLocaleString("pt-BR")
                  : "Data anterior"}
              </strong>
            </p>
            <p>
              Ao confirmar, seus treinos ativos voltarão a ser exatamente os {backupInfo?.workouts?.length ?? 0} treinos gravados no backup, com seus respectivos exercícios e séries originais.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setRestoreDialogOpen(false)}
              disabled={isRestoring}
              className="rounded-full"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRestore}
              disabled={isRestoring}
              className="rounded-full gap-2"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Restaurando...
                </>
              ) : (
                "Sim, Restaurar Original"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coach Interativo com Visão 360° */}
      <WorkoutCoachChat routine={routine} />
    </div>
  );
}
