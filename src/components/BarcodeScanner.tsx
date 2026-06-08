import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
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
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.QR_CODE,
    ]);

    readerRef.current = new BrowserMultiFormatReader(hints);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
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
    if (!videoRef.current || !readerRef.current || capturing) return;
    setCapturing(true);
    try {
      const result = await readerRef.current.decodeOnceFromVideoElement(videoRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      onDetected(result.getText());
    } catch {
      setError("Não foi possível ler o código. Aproxime a câmera e tente novamente.");
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

                {!capturing && (
                  <span className="absolute left-2 right-2 h-0.5 bg-primary/80 rounded-full animate-[scanline_2s_ease-in-out_infinite]" />
                )}
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
