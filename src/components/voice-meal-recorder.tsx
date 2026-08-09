import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mic, MicOff, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { parseAndRecordVoiceMeal, transcribeAudio } from "@/server-fns/audio.functions";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";

interface VoiceMealRecorderProps {
  /** Controlled open state — se omitido, o componente gerencia internamente */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Session opcional — usa useAuth como fallback */
  session?: Session | null;
  /** Chamado após salvar com sucesso */
  onSaved?: () => void;
  mealDate?: string;
  defaultMealType?: "Café da manhã" | "Almoço" | "Jantar" | "Lanche";
}

export function VoiceMealRecorder({
  open: openProp,
  onOpenChange,
  session: sessionProp,
  onSaved,
  mealDate,
  defaultMealType = "Almoço",
}: VoiceMealRecorderProps) {
  const { session: authSession } = useAuth();
  const session = sessionProp ?? authSession;

  // Suporte a modo controlado e não-controlado
  const [openInternal, setOpenInternal] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInternal;
  const setOpen = (val: boolean) => {
    if (!isControlled) setOpenInternal(val);
    onOpenChange?.(val);
  };

  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [text, setText] = useState("");
  const [selectedMealType, setSelectedMealType] = useState<
    "Café da manhã" | "Almoço" | "Jantar" | "Lanche"
  >(defaultMealType);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  // Limpa o timer de gravação ao desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Ao fechar o dialog, para a gravação se ainda estiver ativa
  useEffect(() => {
    if (!open && recording) {
      stopRecording();
    }
    if (!open) {
      setText("");
      setRecordingTime(0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = async () => {
    setText("");
    setRecordingTime(0);
    audioChunksRef.current = [];

    // Tenta primeiro o Web Speech API nativo se disponível (Chrome/Safari)
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = "pt-BR";
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let currentText = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentText += event.results[i][0].transcript;
          }
          setText(currentText);
        };

        recognition.onerror = () => {
          // Se falhar o nativo, usa a gravação via MediaRecorder + Whisper
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch {
        // Fallback silencioso para MediaRecorder
      }
    }

    // Gravação Web Audio API (MediaRecorder)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250);
      setRecording(true);
      // Abre o dialog automaticamente ao iniciar gravação em modo não-controlado
      if (!isControlled) setOpen(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone do dispositivo.");
      setRecording(false);
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      // Para as faixas do microfone
      recorder.stream.getTracks().forEach((t) => t.stop());
    }

    setRecording(false);

    // Se já foi ditado texto via SpeechRecognition nativo, podemos usar direto!
    if (text.trim().length > 3) {
      return;
    }

    // Caso contrário, transcreve com Groq Whisper
    setTranscribing(true);
    try {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const reader = new FileReader();

      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          const res = await transcribeAudio({
            headers: session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : undefined,
            data: {
              audioBase64: base64,
              mimeType: "audio/webm",
            },
          });
          setText(res.text || "");
        } catch (e) {
          console.error(e);
          toast.info("Digite ou revise o relato da refeição abaixo.");
        } finally {
          setTranscribing(false);
        }
      };

      reader.readAsDataURL(blob);
    } catch (e) {
      console.error(e);
      setTranscribing(false);
    }
  };

  const handleProcessMeal = async () => {
    if (!text.trim()) {
      toast.warning("Descreva o que você comeu antes de salvar.");
      return;
    }

    setProcessing(true);
    try {
      const res = await parseAndRecordVoiceMeal({
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        data: {
          text,
          meal_date: mealDate,
          meal_type: selectedMealType,
        },
      });

      if (res.success) {
        toast.success(
          `Refeição salva: ${res.meal_type} (${res.totals.calories} kcal · P${res.totals.protein_g}g)`
        );
        setOpen(false);
        setText("");
        onSaved?.();
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao processar refeição por voz.");
    } finally {
      setProcessing(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Registrar Alimentação por Voz
          </DialogTitle>
          <DialogDescription>
            Fale ou revise o que você comeu. A IA calculará os alimentos e os macros automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Tipo de Refeição
              </label>
              <Select
                value={selectedMealType}
                onValueChange={(val) =>
                  setSelectedMealType(val as "Café da manhã" | "Almoço" | "Jantar" | "Lanche")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Café da manhã">Café da manhã</SelectItem>
                  <SelectItem value="Almoço">Almoço</SelectItem>
                  <SelectItem value="Jantar">Jantar</SelectItem>
                  <SelectItem value="Lanche">Lanche</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recording && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-bold animate-pulse">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                Gravando... {formatSeconds(recordingTime)}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Relato Transcrito
            </label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                transcribing
                  ? "Transcrevendo áudio via IA Whisper..."
                  : "Ex: No almoço comi 200g de arroz integral, 150g de frango grelhado e 1 salada..."
              }
              rows={4}
              className="resize-none"
              disabled={transcribing || processing}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {recording ? (
            <Button variant="destructive" onClick={stopRecording} className="w-full sm:w-auto">
              <MicOff className="h-4 w-4 mr-2" /> Parar Gravação
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={startRecording}
              disabled={processing || transcribing}
            >
              <Mic className="h-4 w-4 mr-1 text-primary" /> {text ? "Regravar" : "Iniciar Gravação"}
            </Button>
          )}

          <Button
            onClick={handleProcessMeal}
            disabled={processing || transcribing || !text.trim()}
            className="w-full sm:w-auto"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processando Macros...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Salvar Refeição
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
