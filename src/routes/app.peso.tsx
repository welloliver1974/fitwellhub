import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatLocalDate, getLocalDate } from "@/lib/utils";
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
import { ArrowLeft, Plus, Scale, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/app/peso")({
  component: WeightPage,
});

type Entry = { id: string; log_date: string; weight_kg: number };

function WeightPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(getLocalDate());

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("body_weights")
      .select("id,log_date,weight_kg")
      .eq("user_id", user.id)
      .order("log_date", { ascending: true })
      .limit(180);
    setEntries((data ?? []).map((d) => ({ ...d, weight_kg: Number(d.weight_kg) })));
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user]);

  const save = async () => {
    const v = Number(weight.replace(",", "."));
    if (!user || !v || v <= 0) return;
    const { error } = await supabase.from("body_weights").insert({
      user_id: user.id,
      log_date: date,
      weight_kg: v,
    });
    if (error) return toast.error(error.message);
    toast.success("Peso registrado");
    setWeight("");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    await supabase.from("body_weights").delete().eq("id", id);
    load();
  };

  const last = entries[entries.length - 1];
  const first = entries[0];
  const delta = last && first ? last.weight_kg - first.weight_kg : 0;

  const chartData = entries.map((e) => ({
    date: formatLocalDate(e.log_date, {
      day: "2-digit",
      month: "2-digit",
    }),
    peso: e.weight_kg,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/app" })}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-display font-bold">Peso corporal</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full">
              <Plus className="h-4 w-4 mr-1" />
              Registrar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar peso</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Data</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Peso (kg)</label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="78.5"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  autoFocus
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
          <Scale className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum registro ainda.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Atual" value={`${last.weight_kg.toFixed(1)} kg`} />
            <StatCard label="Início" value={`${first.weight_kg.toFixed(1)} kg`} />
            <StatCard
              label="Variação"
              value={`${delta >= 0 ? "+" : ""}${delta.toFixed(1)} kg`}
              accent={delta < 0 ? "text-emerald-600" : delta > 0 ? "text-amber-600" : ""}
            />
          </div>

          {entries.length >= 2 && (
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Evolução</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" fontSize={10} />
                    <YAxis fontSize={10} domain={["auto", "auto"]} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="peso"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card className="divide-y">
            {[...entries].reverse().map((e) => (
              <div key={e.id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{e.weight_kg.toFixed(1)} kg</p>
                  <p className="text-xs text-muted-foreground">
                    {formatLocalDate(e.log_date, {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                    })}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(e.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = "",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-display font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}
