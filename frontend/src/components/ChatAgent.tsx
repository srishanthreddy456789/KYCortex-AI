import { useEffect, useRef, useState } from "react";
import { Bot, Mic, Send, User } from "lucide-react";

type Sender = "ai" | "user";
interface Message {
  id: number;
  text: string;
  sender: Sender;
  time: string;
}

const AI_REPLIES = [
  "Thank you. I'm analyzing your response now.",
  "Please hold your ID card clearly in front of the camera.",
  "Identity signals look consistent. Verifying liveness...",
  "Could you confirm your full legal name and date of birth?",
  "Great. Loan eligibility check is in progress.",
  "Verification step complete. You may proceed.",
];

const now = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const ChatAgent = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      sender: "ai",
      text: "Welcome to KYCortex AI. Let's begin your verification.",
      time: now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typing]);

  const toggleMic = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Sorry, your browser does not support Speech Recognition. Try Chrome.");
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

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const userMsg: Message = {
      id: Date.now(),
      sender: "user",
      text: trimmed,
      time: now(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      const reply = AI_REPLIES[Math.floor(Math.random() * AI_REPLIES.length)];
      setMessages((m) => [
        ...m,
        { id: Date.now() + 1, sender: "ai", text: reply, time: now() },
      ]);
      setTyping(false);
    }, 1100);
  };

  return (
    <div className="glass-card rounded-2xl flex flex-col h-[640px]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card" />
          </div>
          <div>
            <h2 className="font-semibold tracking-tight leading-tight">Cortex Agent</h2>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              AI · Online
            </p>
          </div>
        </div>
        <span className="text-xs font-mono text-muted-foreground">v2.4</span>
      </div>

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
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isAI
              ? "bg-secondary/70 text-ai rounded-bl-sm"
              : "bg-accent/15 text-user rounded-br-sm border border-accent/20"
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
