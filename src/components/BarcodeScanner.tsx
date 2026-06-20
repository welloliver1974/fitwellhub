import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ScanLine, ZoomIn, ZoomOut } from "lucide-react";

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
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [hint, setHint] = useState("Aponte o codigo para a moldura");
  const [photoHint, setPhotoHint] = useState(false);

  const updateZoom = async (delta: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    const capabilities = track.getCapabilities() as any;
    if (!capabilities.zoom) return;

    const newZoom = Math.max(capabilities.zoom.min, Math.min(capabilities.zoom.max, zoom + delta));
    try {
      await track.applyConstraints({ advanced: [{ zoom: newZoom }] });
      setZoom(newZoom);
    } catch (e) {
      console.error("Failed to apply zoom:", e);
    }
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    setHint("Aponte o codigo para a moldura");
    setPhotoHint(false);

    (async () => {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              frameRate: { ideal: 24, max: 30 },
              resizeMode: "crop-and-scale",
            },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();

          const track = stream.getVideoTracks()[0];
          const capabilities = track.getCapabilities() as any;

          try {
            await track.applyConstraints({
              advanced: [
                {
                  focusMode: "continuous",
                  exposureMode: "continuous",
                  whiteBalanceMode: "continuous",
                },
              ],
            });
          } catch (e) {
            console.error("Failed to set continuous camera controls:", e);
          }

          if (capabilities.focusMode && capabilities.focusMode.includes("continuous")) {
            try {
              await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
            } catch (e) {
              console.error("Failed to set continuous focus:", e);
            }
          }

          if (capabilities.zoom) {
            setMaxZoom(capabilities.zoom.max);
            setZoom(capabilities.zoom.min || 1);
          }

          setScanning(true);
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message.includes("NotAllowedError") || e.message.includes("Permission")
              ? "Permissao de camera negada. Verifique as configuracoes do navegador."
              : e.message.includes("NotFoundError")
                ? "Nenhuma camera encontrada neste dispositivo."
                : "Camera indisponivel: " + e.message
            : "Camera indisponivel",
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
      setError("Seu navegador nao suporta leitura de codigo de barras. Digite o codigo manualmente.");
      setScanning(false);
      return;
    }

    const formats = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"] as BarcodeFormat[];
    const detector = new BarcodeDetector({ formats });
    const video = videoRef.current;
    let frameAttempts = 0;
    let photoAttempts = 0;

    const detectSource = async (source: CanvasImageSource) => {
      const barcodes = await detector.detect(source);
      if (barcodes.length > 0) {
        setScanning(false);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        onDetected(barcodes[0].rawValue);
        return true;
      }
      return false;
    };

    const detect = async () => {
      if (!video || !video.videoWidth || !video.videoHeight) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      const now = Date.now();
      if (now - lastDetectRef.current < 350) {
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

      // object-fit: cover math: map the guide area to native video coordinates
      const scale = Math.max(vpW / vw, vpH / vh);
      const guideRect = guideEl.getBoundingClientRect();
      const gcX = guideRect.left + guideRect.width / 2;
      const gcY = guideRect.top + guideRect.height / 2;
      const offsetX = (vpW - vw * scale) / 2;
      const offsetY = (vpH - vh * scale) / 2;

      const scanWidth = Math.min(vw, (guideRect.width / scale) * 1.8);
      const scanHeight = Math.min(vh, (guideRect.height / scale) * 2.4);
      const sx = Math.max(0, Math.min(vw - scanWidth, (gcX - offsetX) / scale - scanWidth / 2));
      const sy = Math.max(0, Math.min(vh - scanHeight, (gcY - offsetY) / scale - scanHeight / 2));

      canvas.width = Math.max(80, Math.round(scanWidth));
      canvas.height = Math.max(60, Math.round(scanHeight));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, sx, sy, scanWidth, scanHeight, 0, 0, canvas.width, canvas.height);

      try {
        if (await detectSource(canvas)) return;
      } catch {
        // keep scanning
      }

      frameAttempts += 1;
      if (frameAttempts % 4 === 0) {
        try {
          if (await detectSource(video)) return;
        } catch {
          // keep scanning
        }
      }

      photoAttempts += 1;
      if (photoAttempts % 10 === 0 && streamRef.current && "ImageCapture" in window) {
        try {
          const track = streamRef.current.getVideoTracks()[0];
          const imageCapture = new ImageCapture(track);
          const blob = await imageCapture.takePhoto();
          const bitmap = await createImageBitmap(blob);
          setPhotoHint(true);
          const photoCanvas = canvasRef.current;
          if (photoCanvas) {
            photoCanvas.width = bitmap.width;
            photoCanvas.height = bitmap.height;
            const photoCtx = photoCanvas.getContext("2d", { willReadFrequently: true });
            if (photoCtx) {
              photoCtx.drawImage(bitmap, 0, 0);
              if (await detectSource(photoCanvas)) {
                bitmap.close?.();
                return;
              }
            }
          }
          bitmap.close?.();
        } catch {
          // keep scanning
        }
      }

      rafRef.current = requestAnimationFrame(detect);
    };

    rafRef.current = requestAnimationFrame(detect);

    return () => cancelAnimationFrame(rafRef.current);
  }, [scanning, open, onDetected]);

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
              <div
                ref={guideRef}
                className="w-72 h-44 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
              >
                <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-2xl" />
              </div>
            </div>

            <div className="absolute bottom-32 left-0 right-0 flex flex-col items-center gap-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="secondary"
                  size="icon"
                  className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm"
                  onClick={() => updateZoom(-0.5)}
                  disabled={zoom <= 1}
                >
                  <ZoomOut className="h-5 w-5" />
                </Button>

                <div className="bg-black/70 text-white text-xs px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-sm">
                  <ScanLine className="h-3 w-3 animate-pulse" />
                  {zoom > 1 ? `Zoom: ${zoom.toFixed(1)}x` : photoHint ? "Foto em alta resolucao sendo testada" : hint}
                </div>

                <Button
                  variant="secondary"
                  size="icon"
                  className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm"
                  onClick={() => updateZoom(0.5)}
                  disabled={zoom >= maxZoom}
                >
                  <ZoomIn className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="absolute bottom-4 left-4 right-4 flex gap-2">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Ou digite o codigo manualmente"
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
