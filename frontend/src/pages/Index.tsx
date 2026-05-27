import { useRef, useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, ShieldCheck, Sparkles, Loader2,
  FileCheck, ScanFace, CreditCard, PlayCircle,
} from "lucide-react";
import { VideoCapture } from "@/components/VideoCapture";
import { ChatAgent } from "@/components/ChatAgent";
import { IDCapture, type OCRResult } from "@/components/IDCapture";
import { toast } from "sonner";
import { BACKEND_HTTP } from "@/lib/config";

const BACKEND_URL = BACKEND_HTTP;

// ── KYC progress steps shown in UI ────────────────────────────────────────────
const PROGRESS_STEPS = [
  { id: "aadhaar", label: "Aadhaar",  icon: CreditCard },
  { id: "pan",     label: "PAN Card", icon: FileCheck  },
  { id: "face",    label: "Face Scan",icon: ScanFace   },
  { id: "done",    label: "Complete", icon: CheckCircle2 },
];

function getProgressIndex(step: string): number {
  if (step.includes("aadhaar")) return 0;
  if (step.includes("pan"))     return 1;
  if (step.includes("face") || step === "request_face") return 2;
  if (step === "confirm" || step === "done") return 3;
  return -1;
}

const Index = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sessionId, setSessionId]       = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [currentStep, setCurrentStep]   = useState("welcome");
  const [submitted, setSubmitted]       = useState(false);
  const [aadhaarResult, setAadhaarResult] = useState<OCRResult | null>(null);
  const [panResult, setPanResult]         = useState<OCRResult | null>(null);

  // ── Start session on mount ─────────────────────────────────────────────
  useEffect(() => {
    // cancelled guard: React StrictMode double-invokes effects in dev.
    // The cleanup function sets cancelled=true so only the second (real) run proceeds.
    let cancelled = false;
    let created   = false;

    const init = async () => {
      try {
        const res  = await fetch(`${BACKEND_URL}/kyc/start`, { method: "POST" });
        if (cancelled) return; // strict mode cleanup fired — discard
        const data = await res.json();
        created = true;
        setSessionId(data.session_id);
      } catch {
        if (cancelled) return;
        toast.error("Backend offline", {
          description: "Running in demo mode. Start backend for full KYC flow.",
        });
        setSessionId(null);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Handle step changes from ChatAgent ─────────────────────────────────────
  // useCallback with [] so the reference never changes → no WS reconnect
  const handleStepChange = useCallback((step: string, _data?: any) => {
    setCurrentStep(step);
  }, []);

  // ── Handle OCR results ──────────────────────────────────────────────────────
  const handleOcrResult = useCallback((docType: "aadhaar" | "pan", result: OCRResult) => {
    if (docType === "aadhaar") {
      setAadhaarResult(result);
      toast.success("Aadhaar scanned", {
        description: result.name ? `Name: ${result.name}` : "Aadhaar data extracted",
      });
    } else {
      setPanResult(result);
      toast.success("PAN scanned", {
        description: result.id_number ? `PAN: ${result.id_number}` : "PAN data extracted",
      });
    }
  }, []);

  // ── Submit KYC ───────────────────────────────────────────────────────────────
  const submitKYC = async () => {
    const ws = (window as any).__kyc_ws as WebSocket | null;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "SUBMIT_KYC" }));
    }
    if (sessionId) {
      try {
        await fetch(`${BACKEND_URL}/loan/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
      } catch { /* ignore */ }
    }
    setSubmitted(true);
    setCurrentStep("done");
    toast.success("KYC submitted!", {
      description: "Your application is under review. We will get back to you soon.",
    });
  };

  // ── Progress index ───────────────────────────────────────────────────────────
  const progressIdx = getProgressIndex(currentStep);

  const statusText = () => {
    if (submitted || currentStep === "done") return "Submitted · Under Review";
    if (currentStep === "confirm")           return "All checks passed · Review and submit";
    if (currentStep.includes("face"))        return "Step 3/3 · Face verification";
    if (currentStep.includes("pan"))         return "Step 2/3 · PAN card scan";
    if (currentStep.includes("aadhaar"))     return "Step 1/3 · Aadhaar scan";
    if (sessionLoading)                       return "Initializing session...";
    return "Awaiting start";
  };

  return (
    <div className="min-h-screen text-foreground">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header className="border-b border-border/60 backdrop-blur-xl bg-background/40 sticky top-0 z-30">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary">
              <ShieldCheck className="w-5 h-5 text-background" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight gradient-text">KYCortex AI</h1>
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                AI Video KYC & Loan Onboarding
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-full bg-secondary/60 border border-border/60">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-mono text-muted-foreground">
              Session:{" "}
              {sessionLoading
                ? <Loader2 className="w-3 h-3 inline animate-spin ml-1" />
                : <span className="text-foreground">{sessionId ?? "DEMO"}</span>
              }
            </span>
          </div>
        </div>

        {/* ── Progress bar ──────────────────────────────────────────────────── */}
        <div className="container mx-auto px-6 pb-3">
          <div className="flex items-center gap-0">
            {PROGRESS_STEPS.map((s, i) => {
              const Icon = s.icon;
              const done    = i < progressIdx;
              const active  = i === progressIdx;
              const pending = i > progressIdx;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono transition-all
                    ${done   ? "bg-primary/20 text-primary border border-primary/30"
                    : active ? "bg-accent/20 text-accent border border-accent/30 animate-pulse"
                    : "bg-secondary/30 text-muted-foreground border border-border/30"}`}
                  >
                    <Icon className="w-3 h-3" />
                    {s.label}
                    {done && <CheckCircle2 className="w-3 h-3 ml-0.5" />}
                  </div>
                  {i < PROGRESS_STEPS.length - 1 && (
                    <div className={`flex-1 h-px mx-1 transition-colors ${i < progressIdx ? "bg-primary/40" : "bg-border/40"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────────────── */}
      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            <VideoCapture ref={videoRef} />
            <IDCapture
              videoRef={videoRef}
              sessionId={sessionId}
              currentDocStep={currentStep}
              onOcrResult={handleOcrResult}
              aadhaarResult={aadhaarResult}
              panResult={panResult}
            />
          </div>
          {/* Right column */}
          <div className="space-y-6">
            <ChatAgent
              sessionId={sessionId}
              onStepChange={handleStepChange}
              onOcrResult={handleOcrResult}
            />
          </div>
        </div>

        {/* ── Status bar ──────────────────────────────────────────────────────── */}
        <div className="mt-8 glass-card rounded-2xl p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              submitted || currentStep === "done"
                ? "bg-primary/20"
                : currentStep === "confirm"
                ? "bg-accent/20"
                : "bg-secondary"
            }`}>
              <CheckCircle2 className={`w-5 h-5 transition-colors ${
                submitted || currentStep === "done"
                  ? "text-primary"
                  : currentStep === "confirm"
                  ? "text-accent"
                  : "text-muted-foreground"
              }`} />
            </div>
            <div>
              <p className="font-semibold">Verification Status</p>
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{statusText()}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={submitKYC}
              disabled={submitted || currentStep !== "confirm"}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-background font-semibold text-sm flex items-center justify-center gap-2 hover:glow-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              <ShieldCheck className="w-4 h-4" />
              {submitted ? "Submitted ✓" : "Submit KYC"}
            </button>
          </div>
        </div>

        <footer className="mt-10 text-center text-xs font-mono text-muted-foreground/60 uppercase tracking-widest">
          KYCortex AI · End-to-end encrypted · Powered by Cortex Engine
        </footer>
      </main>
    </div>
  );
};

export default Index;
