import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getAiSettingsLocal } from "@/lib/ai-settings";
import { consultWorkoutCoach, type WorkoutCoachResponse } from "@/server-fns/workout-coach.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Send,
  Loader2,
  Flame,
  Zap,
  Droplets,
  Dumbbell,
  Scale,
  MessageCircle,
  X,
  ChevronRight,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface WorkoutCoachChatProps {
  routine?: any; // Rotina atualmente gerada na tela
}

const QUICK_PROMPTS = [
  "Como adequar esse treino ao que comi hoje?",
  "Por que essa ordem específica de exercícios?",
  "Posso substituir algum exercício por desconforto?",
  "Esse volume está compatível com minha TMB e gasto diário?",
];

export function WorkoutCoachChat({ routine }: WorkoutCoachChatProps) {
  const { user, session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userStats, setUserStats] = useState<WorkoutCoachResponse["userStats"] | null>(null);

  const initialGreeting: Message = {
    id: "welcome-coach",
    role: "assistant",
    content: `Fala! Tô acompanhando tudo por aqui em tempo real: seu gasto calórico, sua hidratação, o que você comeu hoje e essa rotina montada na tela.

Quer entender o porquê de cada exercício, ajustar alguma série ou tirar qualquer dúvida biomecânica? Pode mandar!`,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };

  const [messages, setMessages] = useState<Message[]>([initialGreeting]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll para o final das mensagens
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Foco no input ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const local = getAiSettingsLocal();
      const historyForApi = messages
        .filter((m) => m.id !== "welcome-coach")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await consultWorkoutCoach({
        data: {
          message: text,
          history: historyForApi,
          routine: routine || undefined,
          clientProvider: local.provider,
          clientApiKey: local.apiKey,
          clientModel: local.textModel,
          clientBaseUrl: local.baseUrl,
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (res.userStats) {
        setUserStats(res.userStats);
      }

      const coachMsg: Message = {
        id: `coach-${Date.now()}`,
        role: "assistant",
        content: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, coachMsg]);
    } catch (err: any) {
      console.error("Erro ao conversar com o Coach:", err);
      toast.error("Não foi possível conectar ao Coach no momento.");
      setMessages((prev) => [
        ...prev,
        {
          id: `coach-err-${Date.now()}`,
          role: "assistant",
          content:
            "Tive uma falha momentânea de comunicação. Verifique sua chave de IA na tela /app/ia ou tente reenviar sua pergunta.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Botão Flutuante Amigável */}
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40">
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2.5 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-xl hover:shadow-primary/30 hover:shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 border border-primary/20 backdrop-blur-md"
          aria-label="Tirar dúvida com o Coach"
        >
          {/* Indicador pulsante de Online */}
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>

          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
            <span className="text-sm font-semibold tracking-tight">Coach FitWell</span>
          </div>

          <span className="hidden md:inline-block text-xs opacity-90 font-normal pl-1 border-l border-primary-foreground/20">
            Perguntar sobre o treino
          </span>
        </button>
      </div>

      {/* Dialog / Drawer de Conversa com o Coach */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] h-[85vh] flex flex-col p-0 overflow-hidden border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl rounded-3xl">
          {/* Header */}
          <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-border/50 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                    <Dumbbell className="h-5 w-5" />
                  </div>
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background"></span>
                </div>
                <div>
                  <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                    Coach FitWell
                    <Badge variant="outline" className="text-[10px] font-medium border-primary/30 text-primary py-0 px-1.5">
                      Visão 360°
                    </Badge>
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Treinador de Força & Fisiologista do Exercício
                  </p>
                </div>
              </div>
            </div>

            {/* Pílulas de Contexto 360 do Usuário */}
            {userStats && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
                {userStats.bmr && (
                  <span className="inline-flex items-center gap-1 bg-background/80 px-2 py-0.5 rounded-full border border-border/50">
                    <Flame className="h-3 w-3 text-orange-500" />
                    TMB: <strong className="text-foreground">{userStats.bmr} kcal</strong>
                  </span>
                )}
                {userStats.tdee && (
                  <span className="inline-flex items-center gap-1 bg-background/80 px-2 py-0.5 rounded-full border border-border/50">
                    <Zap className="h-3 w-3 text-amber-500" />
                    Gasto: <strong className="text-foreground">{userStats.tdee} kcal</strong>
                  </span>
                )}
                <span className="inline-flex items-center gap-1 bg-background/80 px-2 py-0.5 rounded-full border border-border/50">
                  <Dumbbell className="h-3 w-3 text-primary" />
                  Prot: <strong className="text-foreground">{userStats.todayProtein}g</strong>/{userStats.targetProtein}g
                </span>
                <span className="inline-flex items-center gap-1 bg-background/80 px-2 py-0.5 rounded-full border border-border/50">
                  <Droplets className="h-3 w-3 text-blue-500" />
                  Água: <strong className="text-foreground">{userStats.todayWater} ml</strong>
                </span>
                {userStats.weight && (
                  <span className="inline-flex items-center gap-1 bg-background/80 px-2 py-0.5 rounded-full border border-border/50">
                    <Scale className="h-3 w-3 text-emerald-500" />
                    Peso: <strong className="text-foreground">{userStats.weight} kg</strong>
                  </span>
                )}
              </div>
            )}
          </DialogHeader>

          {/* Área de Mensagens */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 scroll-smooth"
          >
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-xs leading-relaxed whitespace-pre-line ${
                      isUser
                        ? "bg-primary text-primary-foreground rounded-br-xs font-medium"
                        : "bg-muted/80 text-foreground border border-border/40 rounded-bl-xs"
                    }`}
                  >
                    {m.content}
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 mt-1 px-1">
                    {m.timestamp}
                  </span>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex flex-col items-start space-y-1">
                <div className="bg-muted/80 text-muted-foreground border border-border/40 rounded-2xl rounded-bl-xs px-4 py-3 max-w-[80%] text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Coach analisando sua fisiologia e treino...</span>
                </div>
              </div>
            )}
          </div>

          {/* Chips de Perguntas Rápidas */}
          <div className="px-4 py-2 bg-muted/20 border-t border-border/40 overflow-x-auto flex items-center gap-2 no-scrollbar">
            <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" /> Sugestões:
            </span>
            {QUICK_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                disabled={isLoading}
                className="text-xs bg-background hover:bg-muted text-foreground border border-border/60 hover:border-primary/40 px-3 py-1.5 rounded-full whitespace-nowrap transition-colors disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input de Envio */}
          <div className="p-3 sm:p-4 bg-background border-t border-border/50 flex items-center gap-2">
            <Input
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre exercícios, ordem, descanso ou nutrição..."
              disabled={isLoading}
              className="flex-1 rounded-full px-4 text-sm bg-muted/40 border-border/60 focus-visible:ring-primary/30"
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              size="icon"
              className="rounded-full h-10 w-10 shrink-0 shadow-sm"
              aria-label="Enviar mensagem ao Coach"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
