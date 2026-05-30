import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
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
  Sparkles, 
  Loader2, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  ChevronDown, 
  ChevronUp 
} from "lucide-react";
import { analyzeMeasurements } from "@/server-fns/medidas.functions";
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
  "Braço Direito",
  "Braço Esquerdo",
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(MEASURE_LABELS[0]);
  const [customLabel, setCustomLabel] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAiInfo, setShowAiInfo] = useState(false);
  const [activeTab, setActiveTab] = useState("individual");

  const runAiAnalysis = async () => {
    try {
      setIsAnalyzing(true);
      setAiAnalysis(null);
      const res = await analyzeMeasurements();
      setAiAnalysis(res.analysis);
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

  const save = async () => {
    const label = selectedLabel === "Outro" ? customLabel.trim() : selectedLabel;
    const v = Number(value.replace(",", "."));
    if (!user || !label || !v || v <= 0) {
      toast.error("Preencha todos os campos corretamente.");
      return;
    }
    const { error } = await supabase.from("body_measurements").insert({
      user_id: user.id,
      log_date: date,
      label,
      value_cm: v,
    });
    if (error) return toast.error(error.message);
    toast.success("Medida registrada!");
    setValue("");
    setCustomLabel("");
    setOpen(false);
    setActiveGroup(label);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    await supabase.from("body_measurements").delete().eq("id", id);
    load();
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

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]">
              <Plus className="h-4 w-4 mr-1.5 stroke-[2.5]" />
              Registrar
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader>
              <DialogTitle className="font-display font-bold">Nova Medida Corporal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Data da medição</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-xl border-border/80 focus-visible:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Local do corpo</label>
                <Select value={selectedLabel} onValueChange={setSelectedLabel}>
                  <SelectTrigger className="rounded-xl border-border/80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {MEASURE_LABELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedLabel === "Outro" && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="text-xs font-semibold text-muted-foreground">Nome da medida personalizada</label>
                  <Input
                    placeholder="Ex: Pescoço, Antebraço..."
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    className="rounded-xl border-border/80 focus-visible:ring-primary/20"
                    autoFocus
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Valor (em cm)</label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Ex: 80.5"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="rounded-xl border-border/80 focus-visible:ring-primary/20 font-mono"
                  autoFocus={selectedLabel !== "Outro"}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={save} className="rounded-full w-full sm:w-auto font-semibold px-6 shadow-sm">
                Salvar Medida
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
              Cruze dados de medidas físicas com seu histórico de treinos dos últimos 30 dias para obter feedbacks biomecânicos e nutricionais avançados.
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
                    Analisando dados...
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
                <span>Baseado em treinos e medidas</span>
              </div>
            </Card>
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
            <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-secondary/50 p-1 mb-6">
              <TabsTrigger value="individual" className="rounded-xl font-bold text-xs py-2 data-[state=active]:bg-background data-[state=active]:text-primary transition-all">
                <TrendingUp className="h-3.5 w-3.5 mr-1.5 stroke-[2.5]" />
                Evolução Individual
              </TabsTrigger>
              <TabsTrigger value="timeline" className="rounded-xl font-bold text-xs py-2 data-[state=active]:bg-background data-[state=active]:text-primary transition-all">
                <Clock className="h-3.5 w-3.5 mr-1.5 stroke-[2.5]" />
                Linha do Tempo Geral
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
                          <div>
                            <p className="font-bold text-foreground text-sm">
                              {e.value_cm.toFixed(1)}{" "}
                              <span className="text-xs font-normal text-muted-foreground">cm</span>
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(e.log_date + "T00:00").toLocaleDateString("pt-BR", {
                                weekday: "short",
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="rounded-full hover:bg-destructive/10 hover:text-destructive text-muted-foreground/80 h-8 w-8 transition-colors" 
                            onClick={() => remove(e.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
                          <span className="text-[10px] font-extrabold bg-muted text-muted-foreground px-2 py-0.5 rounded-full shrink-0">
                            {dayEntries.length} {dayEntries.length === 1 ? "medida" : "medidas"}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {dayEntries.map((e) => (
                            <div 
                              key={e.id} 
                              className="bg-secondary/35 p-3 rounded-xl flex items-center justify-between gap-2 group/item hover:bg-secondary/50 transition-colors"
                            >
                              <div className="truncate">
                                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider truncate">
                                  {e.label}
                                </p>
                                <p className="text-sm font-extrabold tracking-tight text-foreground mt-0.5">
                                  {e.value_cm.toFixed(1)}{" "}
                                  <span className="text-[10px] font-semibold text-muted-foreground">cm</span>
                                </p>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 rounded-full opacity-60 group-hover/item:opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive text-muted-foreground" 
                                onClick={() => remove(e.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
