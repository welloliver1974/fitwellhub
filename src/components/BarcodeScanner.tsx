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
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const capturingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCapturing(false);
    capturingRef.current = false;

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

    const reader = new BrowserMultiFormatReader(hints);

    (async () => {
      try {
        if (!videoRef.current) return;

        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result) => {
            if (result && !capturingRef.current) {
              capturingRef.current = true;
              controls.stop();
              onDetected(result.getText());
            }
          },
        );
        controlsRef.current = controls;
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
      controlsRef.current?.stop();
    };
  }, [open, onDetected]);

  const handleCapture = useCallback(() => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);

    try {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) {
        setError("Aguardando a câmera estabilizar. Tente novamente.");
        capturingRef.current = false;
        setCapturing(false);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);

      controlsRef.current?.stop();

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
      ]);

      const result = new BrowserMultiFormatReader(hints).decodeFromCanvas(canvas);
      onDetected(result.getText());
    } catch {
      setError("Nenhum código encontrado. Aproxime e tente novamente.");
      capturingRef.current = false;
      setCapturing(false);
    }
  }, [onDetected]);

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
                Aponte para o código de barras
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
