import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Sparkles, Loader2, Trash2, Paperclip, X } from "lucide-react";
import { sendChat } from "@/server-fns/chat.functions";
import type { CoachPlan } from "@/lib/coach-plan";
import { PlanCard } from "@/components/plan-card";
import { toast } from "sonner";
import { useAiStage } from "@/lib/use-ai-stage";
import { AI_STAGE_LABEL } from "@/lib/ai-stage";

export const Route = createFileRoute("/app/chat")({
  component: ChatPage,
});

type Msg = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  // Só presentes na última resposta ao vivo (não são persistidos no banco).
  confidence?: "baixa" | "media" | "alta";
  nextAction?: string;
  plan?: CoachPlan;
};

const SUGGESTIONS = [
  "Como estou na meta de proteína?",
  "Posso comer pizza hoje?",
  "Sugira um lanche pré-treino",
  "Análise dos meus últimos 7 dias",
];

const CONFIDENCE_LABEL: Record<NonNullable<Msg["confidence"]>, string> = {
  baixa: "Confiança baixa",
  media: "Confiança média",
  alta: "Confiança alta",
};

const CONFIDENCE_STYLE: Record<NonNullable<Msg["confidence"]>, string> = {
  baixa: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  media: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  alta: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

// Card recolhível do plano semanal — extraído para src/components/plan-card.tsx.
function ChatPage() {
  const { user, session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  // Snapshot de "tinha imagem?" no envio: images é limpo junto com setSending(true),
  // então o estágio granular precisa saber do payload original durante o loading.
  const [hadImages, setHadImages] = useState(false);
  const stage = useAiStage(sending, { hasImages: hadImages });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.src = reader.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800; // Resolução ideal para IA sem gastar muito token
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          const resized = canvas.toDataURL("image/jpeg", 0.7); // 70% de qualidade
          setImages(prev => [...prev, resized].slice(-4));
        };
      };
      reader.readAsDataURL(file);
    });
    
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
    if ((!t && images.length === 0) || sending || !user) return;
    console.log("Starting send process for:", t, "with", images.length, "images");
    
    const currentImages = [...images];
    const payload = currentImages.length > 0 ? { message: t, images: currentImages } : { message: t };

    setInput("");
    setImages([]);
    setHadImages(currentImages.length > 0);
    setSending(true);
    // optimistic
    const userMsg = {
      id: "tmp-" + Date.now(),
      role: "user",
      content: currentImages.length > 0 ? `[${currentImages.length} Imagens anexadas] ${t}`.trim() : t,
      created_at: new Date().toISOString(),
    };
    setMessages((p) => [...p, userMsg]);

    try {
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
            confidence: r.confidence,
            nextAction: r.nextAction,
            plan: r.plan,
          },
        ];
      });
      load();
    } catch (e) {
      console.error(e);
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
        <Link to="/app/coach">
          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            Análise Semanal
          </Button>
        </Link>
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
            <div className="max-w-[85%]">
              <div
                className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"}`}
              >
                {m.content}
              </div>
              {m.confidence && m.role === "assistant" && (
                <div className="mt-1.5 space-y-0.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CONFIDENCE_STYLE[m.confidence]}`}
                  >
                    {CONFIDENCE_LABEL[m.confidence]}
                  </span>
                  {m.nextAction && (
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {m.nextAction}
                    </p>
                  )}
                </div>
              )}
              {m.plan && m.role === "assistant" && <PlanCard plan={m.plan} />}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-card border rounded-2xl px-3.5 py-2 text-sm flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
              {stage ? AI_STAGE_LABEL[stage] : "pensando…"}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="mt-3 flex flex-col gap-2 sticky bottom-0 bg-background pt-2">
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-1 ml-11">
            {images.map((img, idx) => (
              <div key={idx} className="relative w-16 h-16 rounded-md border overflow-hidden shrink-0 group">
                <img src={img} className="w-full h-full object-cover" alt={`Upload ${idx}`} />
                <button
                  type="button"
                  onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                  className="absolute top-0 right-0 bg-black/50 text-white rounded-bl-md p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
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
            multiple
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
          <Button type="submit" size="icon" disabled={sending || (!input.trim() && images.length === 0)}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
