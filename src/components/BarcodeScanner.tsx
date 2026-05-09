import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

export function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    (async () => {
      try {
        if (!videoRef.current) return;
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (result) {
              const code = result.getText();
              controls.stop();
              onDetected(code);
            }
          },
        );
        controlsRef.current = controls;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Câmera indisponível");
      }
    })();
    return () => {
      controlsRef.current?.stop();
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 text-white">
        <p className="font-display font-semibold">Escanear código</p>
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
          <p className="text-white/70 text-sm px-6 text-center">{error}</p>
        ) : (
          <>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-40 border-2 border-primary rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
            </div>
            <div className="absolute bottom-8 left-0 right-0 flex justify-center">
              <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Aponte para o código de barras
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
