import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

export function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setScanning(false);

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

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { exact: "environment" },
            width: { min: 640, ideal: 1280 },
            height: { min: 480, ideal: 720 },
            focusMode: "continuous",
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        await reader.decodeFromVideoElement(
          videoRef.current,
          (result, err) => {
            if (result) {
              setScanning(true);
              setTimeout(() => {
                stream.getTracks().forEach((t) => t.stop());
                onDetected(result.getText());
              }, 150);
            }
          },
        );
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
      if (videoRef.current?.srcObject instanceof MediaStream) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
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

      {/* Camera area */}
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
            {/* Full video feed */}
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />

            {/* Dark overlay with cutout via box-shadow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`w-72 h-44 rounded-2xl transition-all duration-150 ${
                  scanning
                    ? "border-4 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.6),0_0_20px_4px_hsl(var(--primary))]"
                    : "border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
                }`}
              >
                {/* Corner accents */}
                <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-2xl" />

                {/* Animated scan line */}
                {!scanning && (
                  <span className="absolute left-2 right-2 h-0.5 bg-primary/80 rounded-full animate-[scanline_2s_ease-in-out_infinite]" />
                )}
              </div>
            </div>

            {/* Status pill */}
            <div className="absolute bottom-10 left-0 right-0 flex justify-center">
              <div className="bg-black/70 text-white text-xs px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-sm">
                {scanning ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                    Código detectado!
                  </>
                ) : (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Aponte a câmera para o código de barras
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
