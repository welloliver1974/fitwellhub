import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Bell, Trash2, Plus, BellOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/lembretes")({
  component: RemindersPage,
});

type Reminder = { id: string; kind: string; time_of_day: string; days_of_week: number[]; enabled: boolean };

const KINDS = [
  { v: "water", label: "💧 Água" },
  { v: "meal", label: "🍽️ Refeição" },
  { v: "workout", label: "💪 Treino" },
  { v: "weight", label: "⚖️ Peso" },
];
const DAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function RemindersPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Reminder[]>([]);
  const [kind, setKind] = useState("water");
  const [time, setTime] = useState("09:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [perm, setPerm] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) setPerm(Notification.permission);
  }, []);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("reminders").select("*").eq("user_id", user.id).order("time_of_day");
    setItems((data ?? []) as Reminder[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const requestPerm = async () => {
    if (!("Notification" in window)) return toast.error("Navegador não suporta notificações");
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") toast.success("Notificações ativadas");
  };

  const add = async () => {
    if (!user) return;
    if (days.length === 0) return toast.error("Selecione pelo menos 1 dia");
    const { error } = await supabase.from("reminders").insert({
      user_id: user.id, kind, time_of_day: time, days_of_week: days, enabled: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Lembrete criado");
    load();
  };

  const toggle = async (r: Reminder) => {
    await supabase.from("reminders").update({ enabled: !r.enabled }).eq("id", r.id);
    load();
  };

  const del = async (id: string) => {
    await supabase.from("reminders").delete().eq("id", id);
    load();
  };

  const toggleDay = (d: number) => {
    setDays((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort());
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-display font-bold flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" /> Lembretes
        </h1>
        <p className="text-sm text-muted-foreground">Notificações locais quando o app estiver aberto</p>
      </div>

      {perm !== "granted" && (
        <Card className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Permitir notificações</p>
            <p className="text-xs text-muted-foreground">Necessário para receber os alertas</p>
          </div>
          <Button size="sm" onClick={requestPerm}>Ativar</Button>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Novo lembrete</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => <SelectItem key={k.v} value={k.v}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Horário</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Dias</Label>
          <div className="flex gap-1.5 mt-1.5">
            {DAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`h-9 w-9 rounded-full text-sm font-medium ${days.includes(i) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
              >{d}</button>
            ))}
          </div>
        </div>
        <Button onClick={add} className="w-full"><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
      </Card>

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum lembrete cadastrado.</p>
        ) : items.map((r) => {
          const k = KINDS.find((x) => x.v === r.kind);
          return (
            <Card key={r.id} className="p-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium truncate">{k?.label ?? r.kind}</p>
                <p className="text-xs text-muted-foreground">
                  {r.time_of_day.slice(0, 5)} · {r.days_of_week.map((d) => DAYS[d]).join(" ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} />
                <Button variant="ghost" size="icon" onClick={() => del(r.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        <BellOff className="h-3 w-3 inline mr-1" />
        Lembretes só disparam com o app aberto no navegador.
      </p>
    </div>
  );
}