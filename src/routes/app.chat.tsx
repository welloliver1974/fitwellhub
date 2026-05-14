import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Sparkles, Loader2, Trash2, Paperclip, X } from "lucide-react";
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
  const { user, session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [imageFile, setImageFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageFile(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Reset file input so same file can be picked again if removed
    e.target.value = "";
  };

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
    if ((!t && !imageFile) || sending || !user) return;
    console.log("Starting send process for:", t);
    
    const imgToSend = imageFile;
    const payload = imgToSend ? { message: t, image: imgToSend } : { message: t };
    
    setInput("");
    setImageFile(null);
    setSending(true);
    // optimistic
    const userMsg = {
      id: "tmp-" + Date.now(),
      role: "user",
      content: imgToSend ? `[Imagem anexada] ${t}`.trim() : t,
      created_at: new Date().toISOString(),
    };
    setMessages((p) => [...p, userMsg]);

    try {
      console.log("Sending message to server-fn:", t);
      const r = await sendChat({
        data: payload,
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      console.log("Server-fn response:", r);

      setMessages((p) => {
        // Remove optimistic user message and replace with assistant response
        // This ensures we don't have duplicate or missing messages if load() is slow
        return [
          ...p,
          {
            id: "assistant-" + Date.now(),
            role: "assistant",
            content: r.reply,
            created_at: new Date().toISOString(),
          },
        ];
      });
      load();
    } catch (e) {
      console.error("Error in sendChat:", e);
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

      <div className="mt-3 flex flex-col gap-2 sticky bottom-0 bg-background pt-2">
        {imageFile && (
          <div className="relative w-20 h-20 rounded-md border overflow-hidden ml-11">
            <img src={imageFile} className="w-full h-full object-cover" alt="Upload" />
            <button
              type="button"
              onClick={() => setImageFile(null)}
              className="absolute top-0 right-0 bg-black/50 text-white rounded-bl-md p-1 hover:bg-black/70"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleImageSelect}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte algo…"
            disabled={sending}
          />
          <Button type="submit" size="icon" disabled={sending || (!input.trim() && !imageFile)}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
