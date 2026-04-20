import { useRef, useState } from "react";
import { Camera, RefreshCw, ScanLine } from "lucide-react";

interface IDCaptureProps {
  videoRef: React.RefObject<HTMLVideoElement>;
}

export const IDCapture = ({ videoRef }: IDCaptureProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSnapshot(canvas.toDataURL("image/png"));
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <ScanLine className="w-4 h-4 text-accent" />
          <h2 className="font-semibold tracking-tight">Upload or Capture ID Card</h2>
        </div>
        {snapshot && (
          <button
            onClick={() => setSnapshot(null)}
            className="text-xs font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 transition"
          >
            <RefreshCw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
        <div className="aspect-[1.6/1] rounded-xl border border-dashed border-border bg-background/40 overflow-hidden flex items-center justify-center relative">
          {snapshot ? (
            <img src={snapshot} alt="Captured ID" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-muted-foreground p-4">
              <Camera className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-mono uppercase tracking-wider">No ID captured</p>
            </div>
          )}
          {snapshot && (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-primary/20 border border-primary/40 text-[10px] font-mono text-primary uppercase">
              Captured
            </div>
          )}
        </div>

        <button
          onClick={capture}
          className="h-full min-h-[60px] sm:w-40 px-5 py-3 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:glow-accent transition-all active:scale-[0.98]"
        >
          <Camera className="w-4 h-4" />
          Capture ID
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
