import { useEffect, useRef, useState, useCallback } from "react";
import {
  Bot, Mic, Send, User, WifiOff, Wifi,
  Volume2, VolumeX, RefreshCw, AlertTriangle,
} from "lucide-react";
import { BACKEND_WS } from "@/lib/config";

type Sender = "ai" | "user";
interface Message {
  id: number;
  text: string;
  sender: Sender;
  time: string;
  type?: string;
  retriesLeft?: number;
}

interface ChatAgentProps {
  sessionId?: string | null;
  onStepChange?: (step: string, data?: any) => void;
  onOcrResult?: (docType: string, data: any) => void;
}
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// ── TTS helper ─────────────────────────────────────────────────────────────────
function speakText(text: string, voiceEnabled: boolean) {
  if (!voiceEnabled || !window.speechSynthesis) return;
  const clean = text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/\*\*/g, "")
    .replace(/•/g, ",")
    .trim();
  if (!clean) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.rate   = 0.95;
  utter.pitch  = 1.0;
  utter.volume = 1.0;
  const voices    = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    v.lang.startsWith("en") &&
    (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Neural"))
  ) || voices.find(v => v.lang.startsWith("en")) || null;
  if (preferred) utter.voice = preferred;
  window.speechSynthesis.speak(utter);
}

export const ChatAgent = ({ sessionId, onStepChange, onOcrResult }: ChatAgentProps) => {
  const [messages, setMessages]       = useState<Message[]>([
    { id: 1, sender: "ai", text: "Welcome to KYCortex AI. Connecting to your AI agent...", time: now() },
  ]);
  const [input, setInput]             = useState("");
  const [typing, setTyping]           = useState(false);
  const [listening, setListening]     = useState(false);
  const [connected, setConnected]     = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const scrollRef      = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const wsRef          = useRef<WebSocket | null>(null);
  const faceThrottleRef = useRef<number>(0);

  // ── Keep latest callback refs — NO deps change causes WS reconnect ──────────
  const voiceEnabledRef   = useRef(voiceEnabled);
  const onStepChangeRef   = useRef(onStepChange);
  const onOcrResultRef    = useRef(onOcrResult);
  // Sync refs every render without triggering effects
  voiceEnabledRef.current  = voiceEnabled;
  onStepChangeRef.current  = onStepChange;
  onOcrResultRef.current   = onOcrResult;

  // ── addMessage: stable ref, no deps ─────────────────────────────────────────
  const addMessage = useCallback((text: string, sender: Sender, extra?: Partial<Message>) => {
    const msg: Message = {
      id: Date.now() + Math.random(),
      sender,
      text,
      time: now(),
      ...extra,
    };
    setMessages(m => [...m, msg]);
    if (sender === "ai") speakText(text, voiceEnabledRef.current);
    return msg;
  }, []); // ← empty deps: addMessage never changes identity

  // ── WebSocket — only depends on sessionId ───────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    // Prevent double-mount in React StrictMode
    let cancelled = false;

    const ws = new WebSocket(`${BACKEND_WS}/kyc/ws/${sessionId}`);
    wsRef.current = ws;
    (window as any).__kyc_ws = ws;

    ws.onopen = () => {
      if (cancelled) { ws.close(); return; }
      setConnected(true);
    };

    ws.onmessage = (event) => {
      if (cancelled) return;
      try {
        const data = JSON.parse(event.data);
        const { type, message, step, doc_type, data: ocrData, retries_left } = data;

        if (type === "AGENT_MESSAGE" || type === "STEP_CHANGE") {
          if (message) {
            setTyping(true);
            setTimeout(() => {
              if (cancelled) return;
              addMessage(message, "ai", { type });
              setTyping(false);
              if (step) onStepChangeRef.current?.(step, data);
            }, 400);
          }
        } else if (type === "RETRY_REQUEST") {
          setTyping(true);
          setTimeout(() => {
            if (cancelled) return;
            addMessage(message, "ai", { type: "retry", retriesLeft: retries_left });
            setTyping(false);
            if (step) onStepChangeRef.current?.(step, data);
          }, 400);
        } else if (type === "OCR_RESULT") {
          onOcrResultRef.current?.(doc_type, ocrData);
        } else if (type === "FACE_STATUS") {
          // silent
        } else if (type === "ERROR") {
          addMessage(`⚠️ ${message}`, "ai");
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      if (!cancelled) setConnected(false);
      wsRef.current = null;
      (window as any).__kyc_ws = null;
    };

    ws.onerror = () => {
      if (!cancelled) {
        setConnected(false);
        addMessage(
          "I could not connect to the AI agent. Please ensure the backend is running on port 8000.",
          "ai"
        );
      }
    };

    return () => {
      // React StrictMode calls cleanup before re-running the effect.
      // Set cancelled=true so the in-flight ws.onopen/onmessage are ignored.
      cancelled = true;
      ws.close();
      wsRef.current = null;
      (window as any).__kyc_ws = null;
    };
  }, [sessionId, addMessage]); // addMessage is stable; sessionId is the only real dep

  // ── Auto scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  // ── Face update forwarding ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const t = Date.now();
      if (t - faceThrottleRef.current < 2000) return;
      faceThrottleRef.current = t;
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "FACE_UPDATE", confidence: e.detail.confidence }));
      }
    };
    window.addEventListener("kyc-face-update" as any, handler);
    return () => window.removeEventListener("kyc-face-update" as any, handler);
  }, []);

  // ── Mic ─────────────────────────────────────────────────────────────────────
  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported. Try Chrome."); return; }
    if (listening) { recognitionRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = () => setListening(false);
    rec.onresult = (ev: any) => {
      let t = "";
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      setInput(t);
    };
    recognitionRef.current = rec;
    rec.start();
  };

  // ── Send ─────────────────────────────────────────────────────────────────────
  const send = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    addMessage(trimmed, "user");
    setInput("");
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "USER_MESSAGE", text: trimmed }));
      setTyping(true);
    } else {
      setTimeout(() => {
        addMessage("I am currently offline. Please ensure the backend is running.", "ai");
      }, 500);
    }
  };

  return (
    <div className="glass-card rounded-2xl flex flex-col h-[640px]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card transition-colors ${connected ? "bg-primary" : "bg-muted-foreground"}`} />
          </div>
          <div>
            <h2 className="font-semibold tracking-tight leading-tight">Cortex Agent</h2>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              AI · {connected ? "Online" : "Offline"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Voice toggle */}
          <button
            onClick={() => {
              const next = !voiceEnabled;
              setVoiceEnabled(next);
              if (!next) window.speechSynthesis?.cancel();
            }}
            title={voiceEnabled ? "Mute voice" : "Enable voice"}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border ${
              voiceEnabled
                ? "bg-primary/15 border-primary/30 text-primary"
                : "bg-secondary border-border text-muted-foreground"
            }`}
          >
            {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          {connected
            ? <Wifi   className="w-4 h-4 text-primary" />
            : <WifiOff className="w-4 h-4 text-muted-foreground" />
          }
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
        {typing && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm bg-secondary/70 flex gap-1">
              {[0, 0.15, 0.3].map(d => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                  style={{ animationDelay: `${d}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border/60 space-y-2">
        {listening && (
          <div className="flex items-center gap-2 px-3 text-xs font-mono text-destructive animate-pulse">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-destructive opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-destructive" />
            </span>
            🎙️ Listening...
          </div>
        )}
        <div className="flex items-center gap-2 bg-secondary/60 rounded-xl pl-4 pr-2 py-2 focus-within:ring-2 focus-within:ring-primary/40 transition">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder={listening ? "Listening..." : "Type or speak your response..."}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <button
            onClick={toggleMic}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
              listening
                ? "bg-destructive text-destructive-foreground animate-pulse shadow-[0_0_20px_hsl(var(--destructive)/0.6)]"
                : "bg-secondary border border-border text-foreground hover:bg-secondary/80"
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            onClick={send}
            disabled={!input.trim()}
            className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:glow-primary transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Message Bubble ─────────────────────────────────────────────────────────────
const MessageBubble = ({ msg }: { msg: Message }) => {
  const isAI    = msg.sender === "ai";
  const isRetry = msg.type   === "retry";
  return (
    <div className={`flex items-end gap-2 ${isAI ? "" : "flex-row-reverse"}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isAI ? "bg-primary/15" : "bg-accent/15"}`}>
        {isAI ? <Bot className="w-3.5 h-3.5 text-primary" /> : <User className="w-3.5 h-3.5 text-accent" />}
      </div>
      <div className={`max-w-[78%] flex flex-col ${isAI ? "items-start" : "items-end"}`}>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
          isRetry
            ? "bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-bl-sm"
            : isAI
            ? "bg-secondary/70 rounded-bl-sm"
            : "bg-accent/15 rounded-br-sm border border-accent/20"
        }`}>
          {isRetry && <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 text-amber-400" />}
          {msg.text}
          {isRetry && msg.retriesLeft !== undefined && (
            <span className="block mt-1 text-[10px] font-mono text-amber-400/70">
              <RefreshCw className="w-2.5 h-2.5 inline mr-1" />
              {msg.retriesLeft} attempt{msg.retriesLeft !== 1 ? "s" : ""} remaining
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground mt-1 px-1">{msg.time}</span>
      </div>
    </div>
  );
};
