import { useRef, useState } from "react";
import {
  Camera,
  RefreshCw,
  ScanLine,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Upload,
  FileText,
  User,
  Calendar,
  CreditCard,
  MapPin,
  Shield,
} from "lucide-react";

interface IDCaptureProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  sessionId?: string | null;
  onOcrResult?: (result: OCRResult) => void;
}

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
  error?: string;
}

const BACKEND_URL = "http://localhost:8000";

export const IDCapture = ({ videoRef, sessionId, onOcrResult }: IDCaptureProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Draw mirrored (undo the CSS scaleX(-1) mirror)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    setSnapshot(dataUrl);
    setOcrResult(null);
    setError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setSnapshot(result);
      setOcrResult(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const analyzeDocument = async () => {
    if (!snapshot) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/ocr/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: snapshot,
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const json = await response.json();

      if (json.success && json.data) {
        setOcrResult(json.data);
        onOcrResult?.(json.data);
      } else {
        setError(json.error || "Could not extract data from document.");
      }
    } catch (err: any) {
      setError(
        err.message.includes("fetch")
          ? "Cannot connect to backend. Ensure the server is running on port 8000."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSnapshot(null);
    setOcrResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ScanLine className="w-4 h-4 text-accent" />
          <h2 className="font-semibold tracking-tight">ID Document Capture & OCR</h2>
        </div>
        {snapshot && (
          <button
            onClick={reset}
            className="text-xs font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 transition"
          >
            <RefreshCw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      {/* Preview + capture buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-start">
        <div className="aspect-[1.6/1] rounded-xl border border-dashed border-border bg-background/40 overflow-hidden flex items-center justify-center relative">
          {snapshot ? (
            <img src={snapshot} alt="Captured ID" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-muted-foreground p-4">
              <Camera className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-mono uppercase tracking-wider">No ID captured</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Capture from camera or upload a file
              </p>
            </div>
          )}
          {snapshot && (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-primary/20 border border-primary/40 text-[10px] font-mono text-primary uppercase">
              Captured
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <p className="text-xs font-mono text-accent uppercase tracking-wider">
                Extracting data...
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:w-40">
          <button
            onClick={capture}
            className="px-5 py-3 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:glow-accent transition-all active:scale-[0.98]"
          >
            <Camera className="w-4 h-4" />
            Capture ID
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-3 rounded-xl bg-secondary border border-border text-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-secondary/80 transition-all active:scale-[0.98]"
          >
            <Upload className="w-4 h-4" />
            Upload File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />

          {snapshot && !ocrResult && (
            <button
              onClick={analyzeDocument}
              disabled={loading}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-background font-semibold text-sm flex items-center justify-center gap-2 hover:glow-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ScanLine className="w-4 h-4" />
              )}
              Analyze
            </button>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* OCR Results */}
      {ocrResult && !ocrResult.error && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-primary">Document Extracted</span>
            {ocrResult.confidence !== undefined && (
              <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                {ocrResult.confidence.toFixed(1)}% confidence
              </span>
            )}
          </div>

          {ocrResult.document_type && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20">
              <Shield className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-mono text-accent uppercase tracking-wider">
                {ocrResult.document_type}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ocrResult.name && (
              <OCRField icon={<User className="w-3.5 h-3.5" />} label="Name" value={ocrResult.name} />
            )}
            {ocrResult.dob && (
              <OCRField icon={<Calendar className="w-3.5 h-3.5" />} label="Date of Birth" value={ocrResult.dob} />
            )}
            {ocrResult.id_number && (
              <OCRField icon={<CreditCard className="w-3.5 h-3.5" />} label="ID Number" value={ocrResult.id_number} />
            )}
            {ocrResult.gender && (
              <OCRField icon={<User className="w-3.5 h-3.5" />} label="Gender" value={ocrResult.gender} />
            )}
            {ocrResult.pincode && (
              <OCRField icon={<MapPin className="w-3.5 h-3.5" />} label="PIN Code" value={ocrResult.pincode} />
            )}
          </div>

          {ocrResult.address && (
            <OCRField
              icon={<MapPin className="w-3.5 h-3.5" />}
              label="Address"
              value={ocrResult.address}
              fullWidth
            />
          )}

          {/* Raw text collapsible */}
          {ocrResult.raw_text && (
            <details className="group">
              <summary className="flex items-center gap-2 text-xs font-mono text-muted-foreground cursor-pointer hover:text-foreground transition">
                <FileText className="w-3.5 h-3.5" />
                View raw extracted text
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-background/60 border border-border text-[10px] font-mono text-muted-foreground overflow-auto max-h-32 whitespace-pre-wrap">
                {ocrResult.raw_text}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

// --------------------------------------------------------------------------- //
// OCR Field Component
// --------------------------------------------------------------------------- //
const OCRField = ({
  icon,
  label,
  value,
  fullWidth = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  fullWidth?: boolean;
}) => (
  <div
    className={`flex items-start gap-2 px-3 py-2.5 rounded-lg bg-secondary/60 border border-border/60 ${
      fullWidth ? "sm:col-span-2" : ""
    }`}
  >
    <span className="text-primary mt-0.5 shrink-0">{icon}</span>
    <div className="min-w-0">
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium truncate" title={value}>{value}</p>
    </div>
  </div>
);
