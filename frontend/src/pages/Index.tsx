import { useRef, useState } from "react";
import { CheckCircle2, PlayCircle, ShieldCheck, Sparkles } from "lucide-react";
import { VideoCapture } from "@/components/VideoCapture";
import { ChatAgent } from "@/components/ChatAgent";
import { IDCapture } from "@/components/IDCapture";
import { toast } from "sonner";

const Index = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const startInterview = () => {
    setInterviewStarted(true);
    toast.success("Interview session started", {
      description: "AI agent is now live. Please answer the questions.",
    });
  };

  const submitKYC = () => {
    setSubmitted(true);
    toast.success("KYC submitted successfully", {
      description: "Your application is being reviewed by Cortex AI.",
    });
  };

  return (
    <div className="min-h-screen text-foreground">
      <header className="border-b border-border/60 backdrop-blur-xl bg-background/40 sticky top-0 z-30">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary">
              <ShieldCheck className="w-5 h-5 text-background" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight gradient-text">
                KYCortex AI
              </h1>
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                AI Video KYC & Loan Onboarding
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-full bg-secondary/60 border border-border/60">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-mono text-muted-foreground">
              Session ID: <span className="text-foreground">KYC-{Date.now().toString().slice(-6)}</span>
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <VideoCapture ref={videoRef} />
            <IDCapture videoRef={videoRef} />
          </div>

          <div className="space-y-6">
            <ChatAgent />
          </div>
        </div>

        <div className="mt-8 glass-card rounded-2xl p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${submitted ? 'bg-primary/20' : 'bg-secondary'}`}>
              <CheckCircle2 className={`w-5 h-5 ${submitted ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="font-semibold">Verification Status</p>
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                {submitted ? "Submitted · Under Review" : interviewStarted ? "Interview in progress" : "Awaiting start"}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={startInterview}
              disabled={interviewStarted}
              className="px-6 py-3 rounded-xl bg-secondary border border-border text-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <PlayCircle className="w-4 h-4" />
              Start Interview
            </button>
            <button
              onClick={submitKYC}
              disabled={submitted}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-background font-semibold text-sm flex items-center justify-center gap-2 hover:glow-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              <ShieldCheck className="w-4 h-4" />
              Submit KYC
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
