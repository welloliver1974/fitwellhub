import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

export function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message.includes("NotAllowedError") || e.message.includes("Permission")
              ? "Permissão de câmera negada. Verifique as configurações do navegador."
              : e.message.includes("NotFoundError")
                ? "Nenhuma câmera encontrada neste dispositivo."
                : "Câmera indisponível: " + e.message
            : "Câmera indisponível",
        );
      }
    })();

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  const handleCapture = useCallback(async () => {
    if (capturing) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Câmera ainda não está pronta. Tente novamente.");
      return;
    }

    setCapturing(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setCapturing(false); return; }
      ctx.drawImage(video, 0, 0);

      if ("BarcodeDetector" in window) {
        const formats = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"] as BarcodeFormat[];
        const detector = new BarcodeDetector({ formats });
        const barcodes = await detector.detect(canvas);

        if (barcodes.length > 0) {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          onDetected(barcodes[0].rawValue);
          return;
        }
        setError("Nenhum código encontrado. Aproxime a câmera e tente novamente.");
        setCapturing(false);
      } else {
        setError("Seu navegador não suporta leitura de código de barras. Digite o código manualmente.");
        setCapturing(false);
      }
    } catch {
      setError("Erro ao processar a imagem. Tente novamente.");
      setCapturing(false);
    }
  }, [capturing, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 text-white">
        <div className="flex items-center gap-2">
          <p className="font-display font-semibold">Escanear código de barras</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 relative flex items-center justify-center">
        {error ? (
          <div className="px-6 text-center space-y-3">
            <p className="text-white/70 text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-72 h-44 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
                <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-2xl" />
              </div>
            </div>

            <div className="absolute bottom-24 left-0 right-0 flex justify-center">
              <div className="bg-black/70 text-white text-xs px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-sm">
                <Camera className="h-3 w-3" />
                Enquadre o código e capture
              </div>
            </div>

            <div className="absolute bottom-10 left-0 right-0 flex justify-center">
              <Button
                size="lg"
                disabled={capturing}
                onClick={handleCapture}
                className="h-14 w-14 rounded-full bg-white hover:bg-white/90"
              >
                {capturing ? (
                  <Loader2 className="h-6 w-6 text-black animate-spin" />
                ) : (
                  <Camera className="h-6 w-6 text-black" />
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
