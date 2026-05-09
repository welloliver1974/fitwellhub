import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Sparkles, Loader2, Trash2 } from "lucide-react";
import { sendChat } from "@/server-fns/chat.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/chat")({
  component: ChatPage,
});

type Msg = { id: string; role: string; content: string; created_at: string };

const SUGGESTIONS = [
  "Como estou na meta de proteína?",
  "Posso comer pizza hoje?",
  "Sugira um lanche pré-treino",
  "Análise dos meus últimos 7 dias",
];

function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chat_messages")
      .select("id,role,content,created_at")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(100);
    setMessages((data ?? []) as Msg[]);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || sending || !user) return;
    setInput("");
    setSending(true);
    // optimistic
    setMessages((p) => [
      ...p,
      { id: "tmp-" + Date.now(), role: "user", content: t, created_at: new Date().toISOString() },
    ]);
    try {
      const r = await sendChat({ data: { message: t } });
      setMessages((p) => [
        ...p,
        {
          id: "tmp-r-" + Date.now(),
          role: "assistant",
          content: r.reply,
          created_at: new Date().toISOString(),
        },
      ]);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSending(false);
    }
  };

  const clearAll = async () => {
    if (!user || !confirm("Apagar todo o histórico do chat?")) return;
    await supabase.from("chat_messages").delete().eq("user_id", user.id);
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] -mt-2">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Coach IA
          </h1>
          <p className="text-xs text-muted-foreground">Chat com seus dados reais</p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="icon" onClick={clearAll} title="Limpar histórico">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && !sending && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pergunte qualquer coisa sobre nutrição, treino ou seus dados:
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-2 rounded-full bg-secondary hover:bg-secondary/80"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"}`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-card border rounded-2xl px-3.5 py-2 text-sm flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> pensando…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2 sticky bottom-0 bg-background pt-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte algo…"
          disabled={sending}
        />
        <Button type="submit" size="icon" disabled={sending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
