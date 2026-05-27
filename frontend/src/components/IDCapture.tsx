import { useRef, useState, useEffect } from "react";
import {
  Camera, RefreshCw, ScanLine, Loader2, CheckCircle2,
  AlertCircle, Upload, FileText, User, Calendar,
  CreditCard, MapPin, Shield, AlertTriangle, RotateCcw,
} from "lucide-react";

export interface OCRResult {
  document_type?: string;
  name?: string;
  dob?: string;
  id_number?: string;
  address?: string;
  gender?: string;
  pincode?: string;
  raw_text?: string;
  confidence?: number;
  valid?: boolean;
  error?: string;
  missing_fields?: string[];
}

interface IDCaptureProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  sessionId?: string | null;
  /** Which document the agent is currently requesting */
  currentDocStep?: "request_aadhaar" | "request_pan" | "aadhaar_processing" | "pan_processing" | "done" | string;
  onOcrResult?: (docType: "aadhaar" | "pan", result: OCRResult) => void;
  /** Aadhaar and PAN results collected so far */
  aadhaarResult?: OCRResult | null;
  panResult?: OCRResult | null;
}

const BACKEND_URL = "http://localhost:8000";

// ── Step config ────────────────────────────────────────────────────────────────
const STEP_CONFIG: Record<string, {
  label: string; docType: "aadhaar" | "pan"; hint: string; color: string;
}> = {
  request_aadhaar: {
    label: "Aadhaar Card",
    docType: "aadhaar",
    hint: "Ensure all 12-digit Aadhaar number rows and your name are visible",
    color: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  },
  aadhaar_processing: {
    label: "Aadhaar Card",
    docType: "aadhaar",
    hint: "Reading your Aadhaar...",
    color: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  },
  request_pan: {
    label: "PAN Card",
    docType: "pan",
    hint: "Ensure the 10-character PAN (e.g. ABCDE1234F) is clearly visible",
    color: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  },
  pan_processing: {
    label: "PAN Card",
    docType: "pan",
    hint: "Reading your PAN...",
    color: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  },
};

export const IDCapture = ({
  videoRef, sessionId, currentDocStep, onOcrResult,
  aadhaarResult, panResult,
}: IDCaptureProps) => {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [snapshot, setSnapshot]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const stepCfg   = STEP_CONFIG[currentDocStep ?? ""] ?? null;
  const isActive  = !!stepCfg && !loading;
  const isProcessing = currentDocStep === "aadhaar_processing" || currentDocStep === "pan_processing";

  // Auto-clear snapshot when step changes (new document requested)
  useEffect(() => {
    setSnapshot(null);
    setError(null);
  }, [currentDocStep]);

  // ── Capture from video ──────────────────────────────────────────────────────
  const capture = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Un-mirror the CSS scaleX(-1) for correct OCR
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    setSnapshot(canvas.toDataURL("image/png"));
    setError(null);
  };

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setSnapshot(ev.target?.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  // ── Analyze ─────────────────────────────────────────────────────────────────
  const analyze = async () => {
    if (!snapshot || !stepCfg) return;
    setLoading(true);
    setError(null);

    try {
      const ws = (window as any).__kyc_ws as WebSocket | null;
      // Send via WebSocket (backend handles it in the step-aware flow)
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "ID_CAPTURED",
          doc_type: stepCfg.docType,
          image: snapshot,
        }));
        // Also call REST endpoint directly so IDCapture can show results
        const res = await fetch(`${BACKEND_URL}/ocr/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: snapshot, session_id: sessionId }),
        });
        const json = await res.json();
        if (json.success && json.data) {
          onOcrResult?.(stepCfg.docType, json.data);
        }
      } else {
        // Offline — just call REST
        const res = await fetch(`${BACKEND_URL}/ocr/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: snapshot, session_id: sessionId }),
        });
        const json = await res.json();
        if (json.success && json.data) {
          onOcrResult?.(stepCfg.docType, json.data);
        } else {
          setError(json.error || "Could not extract data.");
        }
      }
    } catch (err: any) {
      setError(err.message?.includes("fetch")
        ? "Cannot connect to backend. Ensure server is running on port 8000."
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setSnapshot(null); setError(null); if (fileInputRef.current) fileInputRef.current.value = ""; };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ScanLine className="w-4 h-4 text-accent" />
          <h2 className="font-semibold tracking-tight">Document Capture & OCR</h2>
        </div>
        {snapshot && (
          <button onClick={reset}
            className="text-xs font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 transition">
            <RefreshCw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      {/* Step indicator */}
      {stepCfg && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono uppercase tracking-wider ${stepCfg.color}`}>
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Now scanning: <strong>{stepCfg.label}</strong></span>
          {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" />}
        </div>
      )}

      {!stepCfg && !aadhaarResult && !panResult && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-secondary/30 text-xs font-mono text-muted-foreground uppercase tracking-wider">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          Waiting for agent instructions...
        </div>
      )}

      {/* Preview */}
      {stepCfg && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-start">
          <div className="aspect-[1.6/1] rounded-xl border border-dashed border-border bg-background/40 overflow-hidden flex items-center justify-center relative">
            {snapshot ? (
              <img src={snapshot} alt="Captured document" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-muted-foreground p-4">
                <Camera className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-mono uppercase tracking-wider">
                  {stepCfg.label}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">{stepCfg.hint}</p>
              </div>
            )}
            {snapshot && (
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-primary/20 border border-primary/40 text-[10px] font-mono text-primary uppercase">
                Ready
              </div>
            )}
            {loading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
                <p className="text-xs font-mono text-accent uppercase">Analyzing...</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:w-40">
            <button onClick={capture} disabled={!isActive}
              className="px-4 py-2.5 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:glow-accent transition-all active:scale-[0.98] disabled:opacity-40">
              <Camera className="w-4 h-4" /> Capture
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={!isActive}
              className="px-4 py-2.5 rounded-xl bg-secondary border border-border font-semibold text-sm flex items-center justify-center gap-2 hover:bg-secondary/80 transition-all disabled:opacity-40">
              <Upload className="w-4 h-4" /> Upload
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            {snapshot && !loading && (
              <button onClick={analyze}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-background font-semibold text-sm flex items-center justify-center gap-2 hover:glow-primary transition-all active:scale-[0.98]">
                <ScanLine className="w-4 h-4" /> Analyze
              </button>
            )}
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Results summary */}
      <div className="space-y-2">
        {aadhaarResult && (
          <DocResultCard
            title="Aadhaar Card"
            result={aadhaarResult}
            color="blue"
          />
        )}
        {panResult && (
          <DocResultCard
            title="PAN Card"
            result={panResult}
            color="orange"
          />
        )}
      </div>
    </div>
  );
};

// ── Document result card ───────────────────────────────────────────────────────
const DocResultCard = ({
  title, result, color,
}: { title: string; result: OCRResult; color: "blue" | "orange" }) => {
  const [expanded, setExpanded] = useState(false);
  const ok = result.valid !== false && !result.error;
  const colorMap = {
    blue: { badge: "bg-blue-400/15 border-blue-400/30 text-blue-300", icon: "text-blue-400" },
    orange: { badge: "bg-orange-400/15 border-orange-400/30 text-orange-300", icon: "text-orange-400" },
  };
  const c = colorMap[color];

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${ok ? "border-primary/20 bg-primary/5" : "border-amber-500/20 bg-amber-500/5"}`}>
      <div className="flex items-center gap-2">
        {ok
          ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
          : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        }
        <span className="text-sm font-semibold">{title}</span>
        {result.confidence !== undefined && (
          <span className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border ${c.badge}`}>
            {result.confidence.toFixed(1)}%
          </span>
        )}
        <button onClick={() => setExpanded(e => !e)} className="text-[10px] font-mono text-muted-foreground hover:text-foreground ml-1">
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {(result.name || result.id_number) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {result.name && <OCRField icon={<User className="w-3 h-3" />} label="Name" value={result.name} />}
          {result.id_number && <OCRField icon={<CreditCard className="w-3 h-3" />} label="ID Number" value={result.id_number} />}
          {result.dob && <OCRField icon={<Calendar className="w-3 h-3" />} label="DOB" value={result.dob} />}
          {result.gender && <OCRField icon={<User className="w-3 h-3" />} label="Gender" value={result.gender} />}
        </div>
      )}

      {expanded && result.raw_text && (
        <details open>
          <summary className="text-[10px] font-mono text-muted-foreground cursor-pointer flex items-center gap-1">
            <FileText className="w-3 h-3" /> Raw text
          </summary>
          <pre className="mt-1 p-2 rounded bg-background/60 border border-border text-[9px] font-mono overflow-auto max-h-24 whitespace-pre-wrap text-muted-foreground">
            {result.raw_text}
          </pre>
        </details>
      )}

      {result.error && (
        <p className="text-xs text-amber-400">⚠ {result.error.replace(/_/g, " ")}</p>
      )}
    </div>
  );
};

const OCRField = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-secondary/40 border border-border/40">
    <span className="text-primary mt-0.5 shrink-0">{icon}</span>
    <div className="min-w-0">
      <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-xs font-medium truncate">{value}</p>
    </div>
  </div>
);
