import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import { ArrowLeft, Plus, Ruler, Trash2, Sparkles, Loader2 } from "lucide-react";
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

  // Latest value per group (for summary cards)
  const summaryCards = useMemo(() => {
    return groupLabels.map((label) => {
      const arr = groups.get(label)!;
      const last = arr[arr.length - 1];
      return { label, last };
    });
  }, [groups, groupLabels]);

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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/app" })}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-display font-bold">Medidas corporais</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
            onClick={runAiAnalysis}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            Coach IA
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full">
                <Plus className="h-4 w-4 mr-1" />
                Registrar
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova medida</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Data</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Medida</label>
                <Select value={selectedLabel} onValueChange={setSelectedLabel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEASURE_LABELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedLabel === "Outro" && (
                <div>
                  <label className="text-xs text-muted-foreground">Nome da medida</label>
                  <Input
                    placeholder="Ex: Pescoço, Antebraço..."
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">Valor (cm)</label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="80.5"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus={selectedLabel !== "Outro"}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={save}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {entries.length === 0 ? (
        <Card className="p-10 text-center">
          <Ruler className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-1">Nenhuma medida registrada ainda.</p>
          <p className="text-xs text-muted-foreground">
            Registre cintura, quadril, braços e mais para acompanhar sua evolução.
          </p>
        </Card>
      ) : (
        <>
          {/* AI Analysis Result */}
          {aiAnalysis && (
            <Card className="p-4 bg-primary/5 border-primary/20 relative">
              <div className="absolute top-4 right-4">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display font-bold text-primary mb-2">Análise do Coach</h3>
              <div className="text-sm whitespace-pre-wrap text-foreground/90">
                {aiAnalysis}
              </div>
            </Card>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2">
            {summaryCards.map(({ label, last }) => (
              <button
                key={label}
                onClick={() => setActiveGroup(label)}
                className={`rounded-2xl border p-3 text-left transition-all ${
                  activeGroup === label
                    ? "border-primary bg-primary/5"
                    : "bg-card hover:bg-secondary/40"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                  {label}
                </p>
                <p className="text-base font-display font-bold mt-1">
                  {last.value_cm.toFixed(1)}
                  <span className="text-xs font-normal text-muted-foreground ml-0.5">cm</span>
                </p>
              </button>
            ))}
          </div>

          {/* Chart for selected group */}
          {activeGroup && chartData.length >= 2 && (
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Evolução — {activeGroup}
              </p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" fontSize={10} />
                    <YAxis fontSize={10} domain={["auto", "auto"]} />
                    <Tooltip
                      formatter={(v: number) => [`${v.toFixed(1)} cm`, activeGroup]}
                    />
                    <Line
                      type="monotone"
                      dataKey="cm"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Records list for selected group */}
          {activeGroup && (
            <Card className="divide-y">
              <p className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
                {activeGroup} — histórico
              </p>
              {[...activeEntries].reverse().map((e) => (
                <div key={e.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {e.value_cm.toFixed(1)}{" "}
                      <span className="text-sm text-muted-foreground">cm</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.log_date + "T00:00").toLocaleDateString("pt-BR", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(e.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
