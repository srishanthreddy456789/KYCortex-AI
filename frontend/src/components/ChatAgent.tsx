import { useEffect, useRef, useState, useCallback } from "react";
import { Bot, Mic, Send, User, WifiOff, Wifi } from "lucide-react";

type Sender = "ai" | "user";
interface Message {
  id: number;
  text: string;
  sender: Sender;
  time: string;
}

interface ChatAgentProps {
  sessionId?: string | null;
}

const BACKEND_WS = "ws://localhost:8000";

const now = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const ChatAgent = ({ sessionId }: ChatAgentProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      sender: "ai",
      text: "Welcome to KYCortex AI. Connecting to Cortex agent...",
      time: now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const faceThrottleRef = useRef<number>(0);

  const addMessage = useCallback((text: string, sender: Sender) => {
    setMessages((m) => [
      ...m,
      { id: Date.now() + Math.random(), sender, text, time: now() },
    ]);
  }, []);

  // ---- WebSocket connection ------------------------------------------------
  useEffect(() => {
    if (!sessionId) return;

    const ws = new WebSocket(`${BACKEND_WS}/kyc/ws/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "AGENT_MESSAGE" || data.type === "STEP_CHANGE") {
          if (data.message) {
            setTyping(true);
            setTimeout(() => {
              addMessage(data.message, "ai");
              setTyping(false);
            }, 600);
          }
        } else if (data.type === "OCR_RESULT") {
          // OCR result is handled by IDCapture, but we can show a summary
          const d = data.data;
          const fields = [
            d.name && `Name: ${d.name}`,
            d.dob && `DOB: ${d.dob}`,
            d.id_number && `ID: ${d.id_number}`,
            d.document_type && `Doc: ${d.document_type}`,
          ]
            .filter(Boolean)
            .join(" · ");
          if (fields) {
            addMessage(`📄 Document scanned! ${fields}`, "ai");
          }
        } else if (data.type === "ERROR") {
          addMessage(`⚠️ ${data.message}`, "ai");
        }
        // FACE_STATUS events are silent — no need to spam chat
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    ws.onerror = () => {
      setConnected(false);
      addMessage(
        "⚠️ Could not connect to the AI agent. Please ensure the backend is running on port 8000.",
        "ai"
      );
    };

    return () => {
      ws.close();
    };
  }, [sessionId, addMessage]);

  // ---- Auto scroll ---------------------------------------------------------
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  // ---- Send face update to backend ----------------------------------------
  // Called externally via window event
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const now = Date.now();
      if (now - faceThrottleRef.current < 2000) return; // throttle to 1 per 2s
      faceThrottleRef.current = now;
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "FACE_UPDATE", confidence: e.detail.confidence })
        );
      }
    };
    window.addEventListener("kyc-face-update" as any, handler);
    return () => window.removeEventListener("kyc-face-update" as any, handler);
  }, []);

  // ---- Send ID captured event to backend ----------------------------------
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ type: "ID_CAPTURED", image: e.detail.image })
        );
      }
    };
    window.addEventListener("kyc-id-captured" as any, handler);
    return () => window.removeEventListener("kyc-id-captured" as any, handler);
  }, []);

  // ---- Mic -----------------------------------------------------------------
  const toggleMic = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported. Try Chrome.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  // ---- Send message --------------------------------------------------------
  const send = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    addMessage(trimmed, "user");
    setInput("");

    // Send to backend via WebSocket
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "USER_MESSAGE", text: trimmed }));
      setTyping(true);
    } else {
      // Offline fallback
      setTyping(true);
      setTimeout(() => {
        addMessage("I'm currently offline. Please ensure the backend is running.", "ai");
        setTyping(false);
      }, 800);
    }
  };

  return (
    <div className="glass-card rounded-2xl flex flex-col h-[640px]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card transition-colors ${
                connected ? "bg-primary" : "bg-muted-foreground"
              }`}
            />
          </div>
          <div>
            <h2 className="font-semibold tracking-tight leading-tight">Cortex Agent</h2>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              AI · {connected ? "Online" : "Connecting..."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Wifi className="w-4 h-4 text-primary" />
          ) : (
            <WifiOff className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-xs font-mono text-muted-foreground">v2.4</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
        {typing && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm bg-secondary/70 flex gap-1">
              {[0, 0.15, 0.3].map((d) => (
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={listening ? "Listening to your voice..." : "Type your response..."}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <button
            onClick={toggleMic}
            aria-label={listening ? "Stop listening" : "Start voice input"}
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

const MessageBubble = ({ msg }: { msg: Message }) => {
  const isAI = msg.sender === "ai";
  return (
    <div className={`flex items-end gap-2 ${isAI ? "" : "flex-row-reverse"}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isAI ? "bg-primary/15" : "bg-accent/15"
        }`}
      >
        {isAI ? (
          <Bot className="w-3.5 h-3.5 text-primary" />
        ) : (
          <User className="w-3.5 h-3.5 text-accent" />
        )}
      </div>
      <div className={`max-w-[75%] flex flex-col ${isAI ? "items-start" : "items-end"}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
            isAI
              ? "bg-secondary/70 rounded-bl-sm"
              : "bg-accent/15 rounded-br-sm border border-accent/20"
          }`}
        >
          {msg.text}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground mt-1 px-1">
          {msg.time}
        </span>
      </div>
    </div>
  );
};
