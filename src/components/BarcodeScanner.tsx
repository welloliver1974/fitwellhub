import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ScanLine, Flashlight, FlashlightOff } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

export function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number>(0);
  const lastDetectRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);

    (async () => {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
        }
        streamRef.current = stream;

        // Always offer torch — many devices support it even when
        // getCapabilities() doesn't report it. toggleTorch handles errors.
        setTorchSupported(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setScanning(true);
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
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!scanning || !open) return;
    if (!("BarcodeDetector" in window)) {
      setError("Seu navegador não suporta leitura de código de barras. Digite o código manualmente.");
      setScanning(false);
      return;
    }

    const formats = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"] as BarcodeFormat[];
    const detector = new BarcodeDetector({ formats });
    const video = videoRef.current;

    const detect = async () => {
      if (!video || !video.videoWidth || !video.videoHeight) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      const now = Date.now();
      if (now - lastDetectRef.current < 500) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }
      lastDetectRef.current = now;

      const canvas = canvasRef.current;
      const guideEl = guideRef.current;
      if (!canvas || !guideEl) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;

      // object-fit:cover math: map the guide area to native video coordinates
      const scale = Math.max(vpW / vw, vpH / vh);
      const guideRect = guideEl.getBoundingClientRect();
      const gcX = guideRect.left + guideRect.width / 2;
      const gcY = guideRect.top + guideRect.height / 2;
      const offsetX = (vpW - vw * scale) / 2;
      const offsetY = (vpH - vh * scale) / 2;

      const sx = Math.max(0, (gcX - offsetX) / scale - (guideRect.width / 2) / scale);
      const sy = Math.max(0, (gcY - offsetY) / scale - (guideRect.height / 2) / scale);
      const sw = Math.min(vw - sx, guideRect.width / scale);
      const sh = Math.min(vh - sy, guideRect.height / scale);

      canvas.width = Math.max(80, Math.round(sw));
      canvas.height = Math.max(60, Math.round(sh));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      try {
        const barcodes = await detector.detect(canvas);
        if (barcodes.length > 0) {
          setScanning(false);
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          onDetected(barcodes[0].rawValue);
          return;
        }
      } catch {
        // ignore detection errors, keep scanning
      }

      rafRef.current = requestAnimationFrame(detect);
    };

    rafRef.current = requestAnimationFrame(detect);

    return () => cancelAnimationFrame(rafRef.current);
  }, [scanning, open, onDetected]);

  const toggleTorch = async () => {
    // Method 1: applyConstraints with advanced (Padrão Chrome/Android)
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({
          advanced: [{ torch: !torchOn } as unknown as MediaTrackConstraintSet],
        });
        setTorchOn((prev) => !prev);
        return;
      } catch {}
      try {
        await track.applyConstraints({
          torch: !torchOn,
        } as unknown as MediaTrackConstraints);
        setTorchOn((prev) => !prev);
        return;
      } catch {}
    }

    // Method 2: Restart stream com torch na constraint inicial (Samsung)
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setScanning(false);

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          torch: !torchOn,
        } as unknown as MediaTrackConstraints,
      });
      streamRef.current = newStream;
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await videoRef.current.play();
        setScanning(true);
        setTorchOn((prev) => !prev);
      }
    } catch {
      // torch genuinely not available on this device
    }
  };

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (code.length < 3) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onDetected(code);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 text-white">
        <p className="font-display font-semibold">Escanear código de barras</p>
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

            <canvas ref={canvasRef} className="hidden" />

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div ref={guideRef} className="w-72 h-44 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
                <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-2xl" />
              </div>
            </div>

            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                className="absolute top-6 right-6 z-10 bg-black/60 text-white p-3 rounded-full backdrop-blur-sm hover:bg-black/80 active:scale-95 transition-all"
                title={torchOn ? "Desligar flash" : "Ligar flash"}
              >
                {torchOn ? (
                  <FlashlightOff className="h-5 w-5" />
                ) : (
                  <Flashlight className="h-5 w-5" />
                )}
              </button>
            )}

            <div className="absolute bottom-32 left-0 right-0 flex justify-center">
              <div className="bg-black/70 text-white text-xs px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-sm">
                <ScanLine className="h-3 w-3 animate-pulse" />
                Escaneando... Aproxime o código
              </div>
            </div>

            <div className="absolute bottom-4 left-4 right-4 flex gap-2">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Ou digite o código manualmente"
                className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              />
              <Button
                variant="secondary"
                disabled={manualCode.trim().length < 3}
                onClick={handleManualSubmit}
              >
                OK
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
