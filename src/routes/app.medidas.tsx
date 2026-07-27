import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getLocalDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Ruler,
  Trash2,
  PencilLine,
  Sparkles,
  Loader2,
  Calendar,
  TrendingUp,
  TrendingDown,
  Clock,
  ChevronDown,
  ChevronUp,
  Check,
  X
} from "lucide-react";
import { analyzeMeasurements, compareMeasurementsWithAi } from "@/server-fns/medidas.functions";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/app/medidas")({
  component: MedidasPage,
});

const MEASURE_LABELS = [
  "Cintura",
  "Quadril",
  "Peito",
  "Ombros",
  "Costas",
  "Pochete",
  "Braço Direito",
  "Braço Esquerdo",
  "Antebraço Direito",
  "Antebraço Esquerdo",
  "Coxa Direita",
  "Coxa Esquerda",
  "Panturrilha Direita",
  "Panturrilha Esquerda",
  "Outro",
];

type Entry = {
  id: string;
  log_date: string;
  label: string;
  value_cm: number;
};

function MedidasPage() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [sessionDate, setSessionDate] = useState(getLocalDate());
  const [sessionValues, setSessionValues] = useState<Record<string, string>>({});
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiSnapshot, setAiSnapshot] = useState<{
    confidence: "baixa" | "media" | "alta";
    nextAction: string;
    sources: string[];
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAiInfo, setShowAiInfo] = useState(false);
  const [activeTab, setActiveTab] = useState("individual");
  const [dateA, setDateA] = useState<string>("");
  const [dateB, setDateB] = useState<string>("");
  const [comparisonAnalysis, setComparisonAnalysis] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonWeights, setComparisonWeights] = useState<{ weightA: number | null; weightB: number | null }>({ weightA: null, weightB: null });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [isLoadingWeights, setIsLoadingWeights] = useState(false);

  // Extrai todas as datas únicas que possuem alguma medida cadastrada
  const availableDates = useMemo(() => {
    const dates = [...new Set(entries.map((e) => e.log_date))];
    // Ordenar da mais recente para a mais antiga
    return dates.sort((a, b) => b.localeCompare(a));
  }, [entries]);

  useEffect(() => {
    if (availableDates.length > 0) {
      if (!dateA) setDateA(availableDates[0]);
      if (!dateB && availableDates.length > 1) setDateB(availableDates[1]);
    }
  }, [availableDates, dateA, dateB]);

  // Carrega pesos correspondentes para as datas A e B para mostrar na tela
  useEffect(() => {
    async function fetchWeightsForComparison() {
      if (!user) return;
      setIsLoadingWeights(true);
      try {
        let wA: number | null = null;
        let wB: number | null = null;

        if (dateA) {
          const { data } = await supabase
            .from("body_weights")
            .select("weight_kg")
            .eq("user_id", user.id)
            .lte("log_date", dateA)
            .order("log_date", { ascending: false })
            .limit(1);
          if (data && data.length > 0) wA = Number(data[0].weight_kg);
        }

        if (dateB) {
          const { data } = await supabase
            .from("body_weights")
            .select("weight_kg")
            .eq("user_id", user.id)
            .lte("log_date", dateB)
            .order("log_date", { ascending: false })
            .limit(1);
          if (data && data.length > 0) wB = Number(data[0].weight_kg);
        }

        setComparisonWeights({ weightA: wA, weightB: wB });
      } catch (e) {
        console.error("Erro ao buscar pesos do comparador", e);
      } finally {
        setIsLoadingWeights(false);
      }
    }
    fetchWeightsForComparison();
  }, [dateA, dateB, user]);

  const runComparisonAnalysis = async () => {
    if (!dateA || !dateB) {
      toast.error("Por favor, selecione duas datas.");
      return;
    }
    if (dateA === dateB) {
      toast.error("As datas de comparação devem ser diferentes.");
      return;
    }
    try {
      setIsComparing(true);
      setComparisonAnalysis(null);
      const res = await compareMeasurementsWithAi({
        data: { dateA, dateB },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      setComparisonAnalysis(res.analysis);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao comparar medidas");
    } finally {
      setIsComparing(false);
    }
  };

  const confidenceLabel: Record<"baixa" | "media" | "alta", string> = {
    baixa: "Baixa",
    media: "Média",
    alta: "Alta",
  };

  const runAiAnalysis = async () => {
    try {
      setIsAnalyzing(true);
      setAiAnalysis(null);
      setAiSnapshot(null);
      const res = await analyzeMeasurements({
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      setAiAnalysis(res.analysis);
      setAiSnapshot(res.snapshot ?? null);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao analisar");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("body_measurements")
      .select("id,log_date,label,value_cm")
      .eq("user_id", user.id)
      .order("log_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(500);
    setEntries(
      (data ?? []).map((d) => ({ ...d, value_cm: Number(d.value_cm) })),
    );
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user]);

  // Set default active group once data loads
  useEffect(() => {
    if (!activeGroup && entries.length > 0) {
      const labels = [...new Set(entries.map((e) => e.label))];
      if (labels.length > 0) setActiveGroup(labels[0]);
    }
  }, [entries, activeGroup]);

  const saveSession = async () => {
    if (!user) return;

    const toInsert: Array<{
      user_id: string;
      log_date: string;
      label: string;
      value_cm: number;
    }> = [];

    // Collect from grid
    for (const [label, val] of Object.entries(sessionValues)) {
      const v = Number(val.replace(",", "."));
      if (val.trim() && v > 0) {
        toInsert.push({ user_id: user.id, log_date: sessionDate, label, value_cm: v });
      }
    }

    // Collect custom "Outro"
    const customLabelTrimmed = customLabel.trim();
    const customVal = Number(customValue.replace(",", "."));
    if (customLabelTrimmed && customVal > 0) {
      toInsert.push({ user_id: user.id, log_date: sessionDate, label: customLabelTrimmed, value_cm: customVal });
    }

    if (toInsert.length === 0) {
      toast.error("Preencha pelo menos uma medida.");
      return;
    }

    const { error } = await supabase.from("body_measurements").insert(toInsert);
    if (error) return toast.error(error.message);

    const firstLabel = toInsert[0].label;
    toast.success(`${toInsert.length} ${toInsert.length === 1 ? "medida registrada" : "medidas registradas"}!`);
    setOpen(false);
    if (firstLabel) setActiveGroup(firstLabel);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    await supabase.from("body_measurements").delete().eq("id", id);
    load();
  };

  const startEditing = (id: string, currentValue: number) => {
    setEditingId(id);
    setEditValue(String(currentValue));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEdit = async (id: string) => {
    if (!user) return;
    const v = Number(editValue.replace(",", "."));
    if (!v || v <= 0) {
      toast.error("Valor inválido.");
      return;
    }
    const { error } = await supabase
      .from("body_measurements")
      .update({ value_cm: v })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Medida atualizada!");
    cancelEditing();
    load();
  };

  const openForDate = (dateStr: string) => {
    setSessionDate(dateStr);
    setSessionValues({});
    setCustomLabel("");
    setCustomValue("");
    setOpen(true);
  };

  // Group entries by label
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      if (!map.has(e.label)) map.set(e.label, []);
      map.get(e.label)!.push(e);
    }
    return map;
  }, [entries]);

  const groupLabels = [...groups.keys()];

  // Last recorded value per label for quick reference in multi-entry form
  const lastValues = useMemo(() => {
    const map = new Map<string, { value: number; date: string }>();
    for (const e of entries) {
      map.set(e.label, { value: e.value_cm, date: e.log_date });
    }
    return map;
  }, [entries]);

  // Latest value per group with detailed evolution analysis
  const summaryCards = useMemo(() => {
    return groupLabels.map((label) => {
      const arr = groups.get(label)!;
      const last = arr[arr.length - 1];
      const prev = arr.length > 1 ? arr[arr.length - 2] : null;
      
      const diff = prev ? last.value_cm - prev.value_cm : 0;
      
      // Hypertrophy vs Fat Loss metrics
      const hypertrophyLabels = [
        "Peito", "Ombros", "Braço Direito", "Braço Esquerdo", 
        "Coxa Direita", "Coxa Esquerda", "Panturrilha Direita", "Panturrilha Esquerda"
      ];
      const fatLossLabels = ["Cintura", "Quadril"];
      
      let status: "positive" | "negative" | "neutral" = "neutral";
      if (prev) {
        if (hypertrophyLabels.some(l => label.toLowerCase().includes(l.toLowerCase()))) {
          status = diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral";
        } else if (fatLossLabels.some(l => label.toLowerCase().includes(l.toLowerCase()))) {
          status = diff < 0 ? "positive" : diff > 0 ? "negative" : "neutral";
        }
      }
      
      return { label, last, prev, diff, status };
    });
  }, [groups, groupLabels]);

  // Group all entries by date for the general Timeline view
  const timelineDays = useMemo(() => {
    const map = new Map<string, Entry[]>();
    const sortedEntries = [...entries].sort((a, b) => b.log_date.localeCompare(a.log_date));
    for (const e of sortedEntries) {
      if (!map.has(e.log_date)) map.set(e.log_date, []);
      map.get(e.log_date)!.push(e);
    }
    return [...map.entries()];
  }, [entries]);

  // Chart data for selected group
  const chartData = useMemo(() => {
    if (!activeGroup) return [];
    return (groups.get(activeGroup) ?? []).map((e) => ({
      date: new Date(e.log_date + "T00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      cm: e.value_cm,
    }));
  }, [activeGroup, groups]);

  const activeEntries = activeGroup ? (groups.get(activeGroup) ?? []) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate({ to: "/app" })}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-black tracking-tight text-foreground">Medidas</h1>
            <p className="text-xs text-muted-foreground">Acompanhe suas variações físicas</p>
          </div>
        </div>

        <Dialog open={open} onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setSessionValues({});
            setCustomLabel("");
            setCustomValue("");
            setSessionDate(getLocalDate());
          }
        }}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]">
              <Plus className="h-4 w-4 mr-1.5 stroke-[2.5]" />
              Registrar Medidas
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-display font-bold">Sessão de Medidas</DialogTitle>
              <p className="text-xs text-muted-foreground">Preencha os locais que mediu. Todos serão salvos de uma vez na data selecionada.</p>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Date — applies to all */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Data da medição</label>
                <Input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  className="rounded-xl border-border/80 focus-visible:ring-primary/20"
                />
              </div>

              {/* Grid of all body parts with inline inputs */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Locais medidos</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-1 -mr-1">
                  {MEASURE_LABELS.filter(l => l !== "Outro").map(label => {
                    const last = lastValues.get(label);
                    return (
                      <div key={label} className="space-y-1">
                        <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
                          {label}
                        </label>
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder={last ? `últ: ${last.value.toFixed(1)}` : "cm"}
                            value={sessionValues[label] ?? ""}
                            onChange={(e) => setSessionValues(prev => ({ ...prev, [label]: e.target.value }))}
                            className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono text-sm h-9 pr-7"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground/50 pointer-events-none">
                            cm
                          </span>
                        </div>
                        {last && (
                          <p className="text-[8px] text-muted-foreground/40 font-mono truncate">
                            {last.date.slice(5)}: {last.value.toFixed(1)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom "Outro" section */}
              <div className="border-t border-border/50 pt-3">
                <div className="grid grid-cols-[1fr_100px] gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Outro local</label>
                    <Input
                      placeholder="Ex: Pescoço"
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      className="rounded-xl border-border/80 focus-visible:ring-primary/20 h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Valor</label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="cm"
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono h-9 text-sm pr-7"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground/50 pointer-events-none">
                        cm
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={saveSession}
                className="rounded-full w-full sm:w-auto font-semibold px-6 shadow-sm"
              >
                Salvar Medidas
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* AI Coach Banner explaining what it does */}
      <Card className="overflow-hidden border border-primary/15 bg-gradient-to-br from-primary/5 via-primary/[0.02] to-background relative p-5 rounded-3xl shadow-sm">
        <div className="absolute top-0 right-0 h-40 w-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-extrabold text-foreground text-sm flex items-center gap-1.5">
                Coach de Evolução Corporal IA
              </h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowAiInfo(!showAiInfo)}
                className="text-xs text-primary font-bold hover:bg-primary/5 px-2.5 py-1 h-7 rounded-full flex items-center gap-1 transition-colors"
              >
                {showAiInfo ? "Ocultar detalhes" : "Como funciona?"}
                {showAiInfo ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cruze dados de medidas físicas com seu histórico de treinos dos últimos 30 dias para receber uma leitura mais clara da sua evolução.
            </p>

            {showAiInfo && (
              <div className="pt-3 border-t border-primary/10 mt-3 space-y-2 text-xs text-muted-foreground leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                <p>
                  O Coach IA realiza um diagnóstico avançado integrando as seguintes informações:
                </p>
                <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground/90">
                  <li><strong className="text-foreground">Variação de Medidas:</strong> Acompanha a taxa de variação exata em centímetros de cada membro, computando ganhos ou reduções ao longo do tempo.</li>
                  <li><strong className="text-foreground">Frequência e Volume de Treino:</strong> Analisa quais grupos musculares foram exercitados nos últimos 30 dias, volumes de séries e repetições cadastrados.</li>
                  <li><strong className="text-foreground">Conselhos de Direcionamento:</strong> Explica se o seu corpo está respondendo corretamente aos treinos (hipertrofia ou oxidação de gorduras) e sugere readequações estratégicas.</li>
                </ul>
              </div>
            )}

            <div className="pt-3 flex items-center gap-3">
              <Button
                size="sm"
                onClick={runAiAnalysis}
                disabled={isAnalyzing}
                className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 text-xs h-9 flex items-center gap-1.5 shadow-md shadow-primary/10 transition-all hover:scale-[1.01]"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Analisando medidas e treinos...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {aiAnalysis ? "Recalcular Análise" : "Gerar Análise Evolutiva"}
                  </>
                )}
              </Button>
              {aiAnalysis && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAiAnalysis(null)}
                  className="rounded-full text-xs h-9 px-3 border-muted-foreground/20 text-muted-foreground hover:bg-secondary/40"
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {entries.length === 0 ? (
        <Card className="p-12 text-center rounded-3xl border-dashed">
          <Ruler className="h-12 w-12 mx-auto text-muted-foreground/60 mb-4" />
          <h3 className="font-display font-bold text-lg text-foreground mb-1">Nenhuma medida registrada</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
            Registre cintura, quadril, braços, peito e outros locais para monitorar suas mudanças corporais com relatórios inteligentes.
          </p>
        </Card>
      ) : (
        <>
          {/* AI Analysis Result */}
          {aiAnalysis && (
            <Card className="p-5 border border-primary/20 bg-gradient-to-b from-primary/[0.04] to-card relative rounded-3xl shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="absolute top-0 right-0 h-32 w-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center gap-2 mb-4 border-b border-primary/15 pb-3">
                <Sparkles className="h-4.5 w-4.5 text-primary" />
                <h4 className="font-display font-black text-foreground tracking-tight text-sm">
                  Relatório Evolutivo do Coach
                </h4>
                <span className="ml-auto text-[9px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                  Coach AI
                </span>
              </div>
              <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 font-medium">
                {aiAnalysis}
              </div>
              <div className="mt-4 border-t border-muted/50 pt-3 text-[10px] text-muted-foreground flex items-center justify-between font-mono">
                <span>FitWell Hub AI Engine</span>
                <span>Baseado em medidas registradas e treinos recentes</span>
              </div>
            </Card>
          )}

          {aiSnapshot && (
            <div className="grid gap-2.5 sm:grid-cols-3">
              <Card className="rounded-3xl border-border/70 p-4 shadow-sm">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">Confiança</p>
                <p className="mt-2 text-base font-black font-display text-foreground">{confidenceLabel[aiSnapshot.confidence]}</p>
                <p className="mt-1 text-xs text-muted-foreground">Baseada na quantidade de medições e treinos recentes.</p>
              </Card>
              <Card className="rounded-3xl border-border/70 p-4 shadow-sm">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">Próxima ação</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-foreground">{aiSnapshot.nextAction}</p>
              </Card>
              <Card className="rounded-3xl border-border/70 p-4 shadow-sm">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground">Base usada</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {aiSnapshot.sources.map((source) => (
                    <li key={source}>• {source}</li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {/* Bento Grid Summary cards with timestamps and evolution tags */}
          <div className="space-y-2">
            <h2 className="text-xs uppercase tracking-wider font-extrabold text-muted-foreground pl-1">Selecione uma Medida</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {summaryCards.map(({ label, last, prev, diff, status }) => {
                const isSelected = activeGroup === label;
                const formattedDate = new Date(last.log_date + "T00:00").toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                });

                return (
                  <button
                    key={label}
                    onClick={() => setActiveGroup(label)}
                    className={`rounded-2xl border p-4 text-left transition-all relative flex flex-col justify-between h-28 overflow-hidden group/card ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm"
                        : "bg-card border-border/60 hover:bg-secondary/20 hover:border-border"
                    }`}
                  >
                    <div className="w-full">
                      <div className="flex items-center justify-between gap-1 w-full">
                        <p className="text-[10px] uppercase font-extrabold tracking-wider text-muted-foreground truncate max-w-[70%] group-hover/card:text-foreground transition-colors">
                          {label}
                        </p>
                        {prev && diff !== 0 && (
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shrink-0 ${
                            status === "positive" 
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                              : status === "negative"
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {diff > 0 ? (
                              <TrendingUp className="h-2.5 w-2.5 stroke-[2.5]" />
                            ) : (
                              <TrendingDown className="h-2.5 w-2.5 stroke-[2.5]" />
                            )}
                            {Math.abs(diff).toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-xl font-display font-black mt-2 flex items-baseline tracking-tight text-foreground">
                        {last.value_cm.toFixed(1)}
                        <span className="text-[10px] font-semibold text-muted-foreground ml-0.5">cm</span>
                      </p>
                    </div>
                    <div className="w-full flex items-center justify-between border-t border-muted/50 pt-2 mt-auto">
                      <p className="text-[9px] text-muted-foreground/80 flex items-center gap-1 font-semibold">
                        <Calendar className="h-2.5 w-2.5 shrink-0" />
                        {formattedDate}
                      </p>
                      {prev && (
                        <p className="text-[9px] text-muted-foreground/60 font-mono">
                          ant. {prev.value_cm.toFixed(1)}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tabs System for detailed data navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full pt-4">
            <TabsList className="grid w-full grid-cols-3 gap-1 rounded-2xl bg-secondary/50 p-1 mb-6">
              <TabsTrigger 
                value="individual" 
                className="rounded-xl font-bold text-xs py-2 flex items-center justify-center gap-1.5 data-[state=active]:bg-background data-[state=active]:text-primary transition-all px-1 sm:px-3 text-center cursor-pointer"
              >
                <TrendingUp className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
                <span className="truncate">
                  <span className="sm:hidden">Evolução</span>
                  <span className="hidden sm:inline">Evolução Individual</span>
                </span>
              </TabsTrigger>
              <TabsTrigger 
                value="timeline" 
                className="rounded-xl font-bold text-xs py-2 flex items-center justify-center gap-1.5 data-[state=active]:bg-background data-[state=active]:text-primary transition-all px-1 sm:px-3 text-center cursor-pointer"
              >
                <Clock className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
                <span className="truncate">
                  <span className="sm:hidden">Histórico</span>
                  <span className="hidden sm:inline">Linha do Tempo Geral</span>
                </span>
              </TabsTrigger>
              <TabsTrigger 
                value="comparador" 
                className="rounded-xl font-bold text-xs py-2 flex items-center justify-center gap-1.5 data-[state=active]:bg-background data-[state=active]:text-primary transition-all px-1 sm:px-3 text-center cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
                <span className="truncate">
                  <span className="sm:hidden">Comparador</span>
                  <span className="hidden sm:inline">Comparador IA</span>
                </span>
              </TabsTrigger>
            </TabsList>

            {/* Individual Evolution Tab (Chart & Specific History) */}
            <TabsContent value="individual" className="space-y-4 focus-visible:outline-none">
              {activeGroup ? (
                <>
                  {chartData.length >= 2 ? (
                    <Card className="p-5 rounded-3xl shadow-sm border-border/70">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-[10px] uppercase font-extrabold tracking-wider text-muted-foreground">Evolução do Progresso</p>
                          <h3 className="font-display font-black text-lg text-foreground mt-0.5">{activeGroup}</h3>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full">
                          {chartData.length} registros
                        </span>
                      </div>
                      <div className="h-52 w-full mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                            <XAxis 
                              dataKey="date" 
                              fontSize={9} 
                              fontWeight={600} 
                              tickLine={false} 
                              axisLine={false} 
                              dy={8}
                            />
                            <YAxis 
                              fontSize={9} 
                              fontWeight={600} 
                              domain={["auto", "auto"]} 
                              tickLine={false} 
                              axisLine={false}
                              dx={-4}
                            />
                            <Tooltip
                              contentStyle={{ 
                                borderRadius: "16px", 
                                border: "1px solid hsl(var(--border))", 
                                background: "hsl(var(--card))",
                                fontSize: "12px",
                                fontWeight: 600,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                              }}
                              formatter={(v: number) => [`${v.toFixed(1)} cm`, "Medida"]}
                            />
                            <Line
                              type="monotone"
                              dataKey="cm"
                              stroke="hsl(var(--primary))"
                              strokeWidth={3}
                              dot={{ r: 4, stroke: "hsl(var(--background))", strokeWidth: 2, fill: "hsl(var(--primary))" }}
                              activeDot={{ r: 6, strokeWidth: 0 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  ) : (
                    <Card className="p-8 text-center rounded-3xl border-dashed">
                      <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2.5" />
                      <p className="text-sm font-semibold text-muted-foreground mb-1">
                        Histórico insuficiente para gráfico
                      </p>
                      <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                        Registre pelo menos 2 medições de <strong className="text-foreground">{activeGroup}</strong> em datas diferentes para exibir a linha evolutiva.
                      </p>
                    </Card>
                  )}

                  {/* Records list for selected group */}
                  <Card className="rounded-3xl border-border/70 overflow-hidden shadow-sm">
                    <div className="px-5 py-4 border-b border-border/60 bg-muted/30 flex items-center justify-between">
                      <h4 className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground">
                        Histórico — {activeGroup}
                      </h4>
                    </div>
                    <div className="divide-y divide-border/50 max-h-[300px] overflow-y-auto">
                      {[...activeEntries].reverse().map((e) => (
                        <div key={e.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-secondary/5 transition-colors">
                          <div className="flex-1 min-w-0">
                            {editingId === e.id ? (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={editValue}
                                  onChange={(e2) => setEditValue(e2.target.value)}
                                  onKeyDown={(e2) => {
                                    if (e2.key === "Enter") saveEdit(e.id);
                                    if (e2.key === "Escape") cancelEditing();
                                  }}
                                  onBlur={() => saveEdit(e.id)}
                                  className="h-8 w-24 rounded-xl font-mono text-sm"
                                  autoFocus
                                />
                                <span className="text-xs font-normal text-muted-foreground">cm</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-full h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                                  onMouseDown={(e2) => { e2.preventDefault(); saveEdit(e.id); }}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-full h-7 w-7 text-muted-foreground hover:bg-muted"
                                  onMouseDown={(e2) => { e2.preventDefault(); cancelEditing(); }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <p className="font-bold text-foreground text-sm">
                                {e.value_cm.toFixed(1)}{" "}
                                <span className="text-xs font-normal text-muted-foreground">cm</span>
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(e.log_date + "T00:00").toLocaleDateString("pt-BR", {
                                weekday: "short",
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full hover:bg-primary/10 hover:text-primary text-muted-foreground/60 h-8 w-8 transition-colors"
                              onClick={() => startEditing(e.id, e.value_cm)}
                            >
                              <PencilLine className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full hover:bg-destructive/10 hover:text-destructive text-muted-foreground/60 h-8 w-8 transition-colors"
                              onClick={() => remove(e.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </>
              ) : (
                <div className="text-center text-xs text-muted-foreground py-8">
                  Nenhuma medida ativa selecionada.
                </div>
              )}
            </TabsContent>

            {/* General Timeline Tab (Grouped by Date) */}
            <TabsContent value="timeline" className="focus-visible:outline-none pt-2">
              <div className="space-y-5 relative pl-4 before:absolute before:inset-y-1 before:left-[19px] before:w-0.5 before:bg-border/60">
                {timelineDays.map(([dateStr, dayEntries]) => {
                  const dateObj = new Date(dateStr + "T00:00");
                  const weekday = dateObj.toLocaleDateString("pt-BR", { weekday: "short" });
                  const day = dateObj.toLocaleDateString("pt-BR", { day: "2-digit" });
                  const monthYear = dateObj.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
                  
                  return (
                    <div key={dateStr} className="flex gap-4 relative animate-in fade-in slide-in-from-bottom-2 duration-300">
                      {/* Timeline Dot Connector */}
                      <div className="absolute left-[3px] top-[7px] h-3 w-3 rounded-full border-[2.5px] border-primary bg-background z-10 shrink-0 shadow-sm" />

                      {/* Content Card with details of measurements taken that day */}
                      <Card className="flex-1 p-4 bg-card border border-border/60 hover:border-border transition-all rounded-2xl shadow-sm ml-6">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/40 justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs uppercase font-extrabold text-foreground">{weekday}</span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                            <span className="text-xs font-semibold text-muted-foreground">{day} {monthYear}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-extrabold bg-muted text-muted-foreground px-2 py-0.5 rounded-full shrink-0">
                              {dayEntries.length} {dayEntries.length === 1 ? "medida" : "medidas"}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-full text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-all"
                              onClick={() => openForDate(dateStr)}
                              title="Adicionar medida neste dia"
                            >
                              <Plus className="h-3 w-3 stroke-[3]" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {dayEntries.map((e) => (
                            <div
                              key={e.id}
                              className="bg-secondary/35 p-3 rounded-xl flex items-center justify-between gap-2 group/item hover:bg-secondary/50 transition-colors"
                            >
                              <div className="truncate flex-1 min-w-0">
                                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider truncate">
                                  {e.label}
                                </p>
                                {editingId === e.id ? (
                                  <div className="flex items-center gap-1 mt-1">
                                    <Input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      value={editValue}
                                      onChange={(e2) => setEditValue(e2.target.value)}
                                      onKeyDown={(e2) => {
                                        if (e2.key === "Enter") saveEdit(e.id);
                                        if (e2.key === "Escape") cancelEditing();
                                      }}
                                      onBlur={() => saveEdit(e.id)}
                                      className="h-7 w-20 rounded-xl font-mono text-xs"
                                      autoFocus
                                    />
                                    <span className="text-[10px] font-semibold text-muted-foreground">cm</span>
                                  </div>
                                ) : (
                                  <p className="text-sm font-extrabold tracking-tight text-foreground mt-0.5">
                                    {e.value_cm.toFixed(1)}{" "}
                                    <span className="text-[10px] font-semibold text-muted-foreground">cm</span>
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-full opacity-0 group-hover/item:opacity-60 hover:!opacity-100 transition-all hover:bg-primary/10 hover:text-primary text-muted-foreground"
                                  onClick={() => startEditing(e.id, e.value_cm)}
                                >
                                  <PencilLine className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-full opacity-60 group-hover/item:opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                                  onClick={() => remove(e.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* Comparador IA Tab */}
            <TabsContent value="comparador" className="space-y-4 focus-visible:outline-none">
              {availableDates.length < 2 ? (
                <Card className="p-8 text-center rounded-3xl border-dashed">
                  <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2.5" />
                  <p className="text-sm font-semibold text-muted-foreground mb-1">
                    Registros insuficientes para comparação
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Você precisa ter medidas registradas em pelo menos <strong className="text-foreground">duas datas diferentes</strong> para usar o comparador.
                  </p>
                </Card>
              ) : (
                <div className="space-y-5">
                  {/* Selects for Dates */}
                  <Card className="p-5 rounded-3xl border-border/70 shadow-sm space-y-4">
                    <div>
                      <h3 className="font-display font-extrabold text-sm text-foreground">Escolha as datas para comparar</h3>
                      <p className="text-[10px] text-muted-foreground">Selecione uma data base e uma data posterior para cruzar medidas e peso.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Data A */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-primary" />
                          Data Base (Anterior)
                        </label>
                        <Select value={dateA} onValueChange={setDateA}>
                          <SelectTrigger className="rounded-xl border-border/80">
                            <SelectValue placeholder="Selecione a data base" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {availableDates.map((d) => (
                              <SelectItem key={d} value={d}>
                                {new Date(d + "T00:00").toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "long",
                                  year: "numeric",
                                })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Data B */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-primary" />
                          Data Comparação (Nova)
                        </label>
                        <Select value={dateB} onValueChange={setDateB}>
                          <SelectTrigger className="rounded-xl border-border/80">
                            <SelectValue placeholder="Selecione a data de comparação" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {availableDates.map((d) => (
                              <SelectItem key={d} value={d}>
                                {new Date(d + "T00:00").toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "long",
                                  year: "numeric",
                                })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {dateA === dateB && dateA !== "" && (
                      <p className="text-xs text-rose-500 font-semibold animate-pulse">
                        Por favor, selecione duas datas diferentes para a comparação.
                      </p>
                    )}

                    <Button
                      onClick={runComparisonAnalysis}
                      disabled={isComparing || dateA === dateB || !dateA || !dateB}
                      className="rounded-full w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-6 shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] h-10 flex items-center justify-center gap-2"
                    >
                      {isComparing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processando comparativo de evolução...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Gerar Diagnóstico de Evolução com IA
                        </>
                      )}
                    </Button>
                  </Card>

                  {/* Resumos rápidos lado a lado */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Resumo A */}
                    {dateA && (
                      <Card className="rounded-3xl border-border/70 overflow-hidden shadow-sm">
                        <div className="px-5 py-3 border-b border-border/60 bg-muted/40 flex items-center justify-between">
                          <span className="text-xs uppercase font-extrabold text-foreground">
                            Resumo de {new Date(dateA + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="bg-secondary/40 p-3 rounded-xl flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">Peso Corporal</span>
                            <span className="text-sm font-extrabold text-foreground font-mono">
                              {isLoadingWeights ? (
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                              ) : comparisonWeights.weightA ? (
                                `${comparisonWeights.weightA.toFixed(1)} kg`
                              ) : (
                                "Não registrado"
                              )}
                            </span>
                          </div>
                          
                          <div className="max-h-[220px] overflow-y-auto space-y-2">
                            {entries
                              .filter((e) => e.log_date === dateA)
                              .map((e) => (
                                <div key={e.id} className="flex justify-between items-center text-xs py-1.5 border-b border-border/40 last:border-0 font-medium">
                                  <span className="text-muted-foreground">{e.label}</span>
                                  <span className="text-foreground font-mono">{e.value_cm.toFixed(1)} cm</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* Resumo B */}
                    {dateB && (
                      <Card className="rounded-3xl border-border/70 overflow-hidden shadow-sm">
                        <div className="px-5 py-3 border-b border-border/60 bg-muted/40 flex items-center justify-between">
                          <span className="text-xs uppercase font-extrabold text-foreground">
                            Resumo de {new Date(dateB + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="bg-secondary/40 p-3 rounded-xl flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground">Peso Corporal</span>
                            <span className="text-sm font-extrabold text-foreground font-mono">
                              {isLoadingWeights ? (
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                              ) : comparisonWeights.weightB ? (
                                `${comparisonWeights.weightB.toFixed(1)} kg`
                              ) : (
                                "Não registrado"
                              )}
                            </span>
                          </div>
                          
                          <div className="max-h-[220px] overflow-y-auto space-y-2">
                            {entries
                              .filter((e) => e.log_date === dateB)
                              .map((e) => (
                                <div key={e.id} className="flex justify-between items-center text-xs py-1.5 border-b border-border/40 last:border-0 font-medium">
                                  <span className="text-muted-foreground">{e.label}</span>
                                  <span className="text-foreground font-mono">{e.value_cm.toFixed(1)} cm</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>

                  {/* Diagnóstico da IA */}
                  {comparisonAnalysis && (
                    <Card className="p-5 border border-primary/20 bg-gradient-to-b from-primary/[0.04] to-card relative rounded-3xl shadow-sm overflow-hidden animate-in fade-in duration-300">
                      <div className="absolute top-0 right-0 h-32 w-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
                      <div className="flex items-center gap-2 mb-4 border-b border-primary/15 pb-3">
                        <Sparkles className="h-4.5 w-4.5 text-primary" />
                        <h4 className="font-display font-black text-foreground tracking-tight text-sm">
                          Diagnóstico Evolutivo AI
                        </h4>
                        <span className="ml-auto text-[9px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          Comparação Direta
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 font-medium">
                        {comparisonAnalysis}
                      </div>
                      <div className="mt-4 border-t border-muted/50 pt-3 text-[10px] text-muted-foreground flex items-center justify-between font-mono">
                        <span>FitWell Hub AI Engine</span>
                        <span>Medidas & Peso: {new Date(dateA + "T00:00").toLocaleDateString("pt-BR")} vs {new Date(dateB + "T00:00").toLocaleDateString("pt-BR")}</span>
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
