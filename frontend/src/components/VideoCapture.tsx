import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Camera, Maximize2, Mic, MicOff, Minimize2, Video, VideoOff } from "lucide-react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

interface VideoCaptureProps {
  onStreamReady?: (video: HTMLVideoElement) => void;
}

export const VideoCapture = forwardRef<HTMLVideoElement, VideoCaptureProps>(
  ({ onStreamReady }, ref) => {
    const internalRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef = useRef<number | null>(null);
    const detectRafRef = useRef<number | null>(null);
    const detectorRef = useRef<FaceDetector | null>(null);
    const overlayRef = useRef<HTMLCanvasElement | null>(null);
    const lastBoxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

    const [active, setActive] = useState(false);
    const [videoOn, setVideoOn] = useState(true);
    const [micOn, setMicOn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioLevel, setAudioLevel] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const [detectorReady, setDetectorReady] = useState(false);
    const [detectorError, setDetectorError] = useState<string | null>(null);
    const [faceDetected, setFaceDetected] = useState(false);
    const [faceConfidence, setFaceConfidence] = useState(0);

    const setRefs = (el: HTMLVideoElement | null) => {
      internalRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    };

    // ---------- Audio meter ----------
    const stopAudioMeter = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      analyserRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      setAudioLevel(0);
    };

    const startAudioMeter = (stream: MediaStream) => {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;
      try {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        const ctx = new Ctx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setAudioLevel(Math.min(1, rms * 2.2));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        /* ignore */
      }
    };

    // ---------- MediaPipe Face Detector ----------
    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
          );
          const detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.5,
          });
          if (cancelled) {
            detector.close();
            return;
          }
          detectorRef.current = detector;
          setDetectorReady(true);
        } catch (e: any) {
          console.error("Face detector init failed:", e);
          setDetectorError("Could not load face detection model");
        }
      })();
      return () => {
        cancelled = true;
        detectorRef.current?.close();
        detectorRef.current = null;
      };
    }, []);

    const drawOverlay = (
      box: { x: number; y: number; w: number; h: number } | null,
      confidence: number
    ) => {
      const video = internalRef.current;
      const canvas = overlayRef.current;
      if (!canvas || !video) return;
      const rect = video.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!box || !video.videoWidth || !video.videoHeight) return;

      ctx.scale(dpr, dpr);

      // object-cover scaling: video is mirrored via CSS scaleX(-1)
      const cw = rect.width;
      const ch = rect.height;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.max(cw / vw, ch / vh);
      const renderedW = vw * scale;
      const renderedH = vh * scale;
      const offsetX = (cw - renderedW) / 2;
      const offsetY = (ch - renderedH) / 2;

      let x = box.x * scale + offsetX;
      const y = box.y * scale + offsetY;
      const w = box.w * scale;
      const h = box.h * scale;
      // mirror horizontally to match the flipped video
      x = cw - x - w;

      const accent = "hsl(158, 84%, 52%)";
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 12;

      // Corner brackets
      const c = Math.min(28, w * 0.25, h * 0.25);
      ctx.beginPath();
      // top-left
      ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
      // top-right
      ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
      // bottom-right
      ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h);
      // bottom-left
      ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c);
      ctx.stroke();

      // Subtle full rectangle
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "hsla(158, 84%, 52%, 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      // Label
      const label = `FACE · ${confidence.toFixed(1)}%`;
      ctx.font = "600 11px 'JetBrains Mono', monospace";
      const padX = 6, padY = 3;
      const textW = ctx.measureText(label).width;
      const labelY = Math.max(0, y - 22);
      ctx.fillStyle = "hsla(222, 47%, 6%, 0.85)";
      ctx.fillRect(x, labelY, textW + padX * 2, 18);
      ctx.strokeStyle = "hsla(158, 84%, 52%, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, labelY, textW + padX * 2, 18);
      ctx.fillStyle = accent;
      ctx.fillText(label, x + padX, labelY + 12 + padY - 3);
    };

    const stopFaceLoop = () => {
      if (detectRafRef.current) cancelAnimationFrame(detectRafRef.current);
      detectRafRef.current = null;
      lastBoxRef.current = null;
      drawOverlay(null, 0);
      setFaceDetected(false);
      setFaceConfidence(0);
    };

    const startFaceLoop = useCallback(() => {
      if (!detectorRef.current) return;
      let smoothed = 0;
      let lastTs = -1;

      const loop = () => {
        const video = internalRef.current;
        const det = detectorRef.current;
        if (!video || !det) {
          detectRafRef.current = requestAnimationFrame(loop);
          return;
        }
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const ts = performance.now();
          if (ts !== lastTs) {
            lastTs = ts;
            try {
              const result = det.detectForVideo(video, ts);
              const detections = result?.detections ?? [];
              if (detections.length > 0) {
                const top = detections[0];
                const score = top.categories?.[0]?.score ?? 0;
                const pct = Math.min(99.9, score * 100);
                smoothed = smoothed * 0.6 + pct * 0.4;

                const bb = top.boundingBox;
                if (bb) {
                  // Smooth box position
                  const target = {
                    x: bb.originX,
                    y: bb.originY,
                    w: bb.width,
                    h: bb.height,
                  };
                  const prev = lastBoxRef.current;
                  const next = prev
                    ? {
                        x: prev.x * 0.5 + target.x * 0.5,
                        y: prev.y * 0.5 + target.y * 0.5,
                        w: prev.w * 0.5 + target.w * 0.5,
                        h: prev.h * 0.5 + target.h * 0.5,
                      }
                    : target;
                  lastBoxRef.current = next;
                }

                setFaceDetected(true);
                setFaceConfidence(Math.round(smoothed * 10) / 10);
              } else {
                smoothed = smoothed * 0.85;
                lastBoxRef.current = null;
                setFaceDetected(false);
                setFaceConfidence(Math.round(smoothed * 10) / 10);
              }
              drawOverlay(lastBoxRef.current, smoothed);
            } catch (e) {
              // ignore frame error
            }
          }
        }
        detectRafRef.current = requestAnimationFrame(loop);
      };
      detectRafRef.current = requestAnimationFrame(loop);
    }, []);

    // Start/stop face loop based on detector readiness + active video
    useEffect(() => {
      if (detectorReady && active && videoOn) startFaceLoop();
      else stopFaceLoop();
      return stopFaceLoop;
    }, [detectorReady, active, videoOn, startFaceLoop]);

    // ---------- Stream control ----------
    const startStream = useCallback(
      async (withVideo: boolean, withAudio: boolean) => {
        try {
          stopAudioMeter();
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;

          if (!withVideo && !withAudio) {
            if (internalRef.current) internalRef.current.srcObject = null;
            setActive(false);
            return;
          }

          const stream = await navigator.mediaDevices.getUserMedia({
            video: withVideo ? { width: 1280, height: 720, facingMode: "user" } : false,
            audio: withAudio,
          });
          streamRef.current = stream;
          if (internalRef.current) {
            internalRef.current.srcObject = stream;
            internalRef.current.muted = true;
            await internalRef.current.play().catch(() => {});
            setActive(withVideo);
            onStreamReady?.(internalRef.current);
          }
          if (withAudio) startAudioMeter(stream);
          setError(null);
        } catch (e) {
          setError("Camera/mic access denied. Please enable permissions.");
          setActive(false);
        }
      },
      [onStreamReady]
    );

    useEffect(() => {
      startStream(true, false);
      return () => {
        stopAudioMeter();
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleVideo = () => {
      const next = !videoOn;
      setVideoOn(next);
      startStream(next, micOn);
    };

    const toggleMic = () => {
      const next = !micOn;
      setMicOn(next);
      startStream(videoOn, next);
    };

    // ---------- Fullscreen ----------
    useEffect(() => {
      const onFs = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", onFs);
      return () => document.removeEventListener("fullscreenchange", onFs);
    }, []);

    const toggleFullscreen = async () => {
      const el = containerRef.current;
      if (!el) return;
      try {
        if (!document.fullscreenElement) await el.requestFullscreen();
        else await document.exitFullscreen();
      } catch {
        /* ignore */
      }
    };

    const bars = 12;
    const litBars = Math.round(audioLevel * bars);

    const faceLabel = !detectorReady
      ? detectorError ?? "● REC · Loading face model..."
      : faceDetected
      ? `● REC · Face Match ${faceConfidence.toFixed(1)}%`
      : "● REC · Searching for face...";

    const faceLabelClass = !detectorReady
      ? detectorError
        ? "text-muted-foreground border-border"
        : "text-accent border-accent/40"
      : faceDetected
      ? "text-primary border-primary/40"
      : "text-destructive border-destructive/40";

    return (
      <div ref={containerRef} className="glass-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <Video className="w-4 h-4 text-primary" />
            <h2 className="font-semibold tracking-tight">Live Video Verification</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="relative w-2 h-2">
                <span
                  className={`absolute inset-0 rounded-full ${
                    active ? "bg-primary pulse-dot" : "bg-muted-foreground"
                  }`}
                />
                <span
                  className={`absolute inset-0 rounded-full ${
                    active ? "bg-primary" : "bg-muted-foreground"
                  }`}
                />
              </span>
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                {active ? "Live" : "Off"}
              </span>
            </div>
            <button
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="w-7 h-7 rounded-md bg-secondary/60 border border-border text-muted-foreground hover:text-foreground flex items-center justify-center transition"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="relative aspect-video bg-background/80 overflow-hidden">
          <video
            ref={setRefs}
            autoPlay
            playsInline
            muted
            style={{ transform: "scaleX(-1)" }}
            className={`w-full h-full object-cover transition-opacity duration-500 ${
              active ? "opacity-100" : "opacity-0"
            }`}
          />
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
          {!active && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              {videoOn ? (
                <>
                  <Camera className="w-12 h-12 opacity-40" />
                  <p className="text-sm">Initializing camera...</p>
                </>
              ) : (
                <>
                  <VideoOff className="w-12 h-12 opacity-50" />
                  <p className="text-sm">Camera is off</p>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-destructive p-6 text-center">
              <VideoOff className="w-12 h-12 opacity-70" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {active && (
            <>
              <div className="absolute inset-0 pointer-events-none">
                <div className={`absolute top-4 left-4 w-10 h-10 border-l-2 border-t-2 rounded-tl-lg transition-colors ${faceDetected ? 'border-primary' : 'border-muted-foreground/60'}`} />
                <div className={`absolute top-4 right-4 w-10 h-10 border-r-2 border-t-2 rounded-tr-lg transition-colors ${faceDetected ? 'border-primary' : 'border-muted-foreground/60'}`} />
                <div className={`absolute bottom-4 left-4 w-10 h-10 border-l-2 border-b-2 rounded-bl-lg transition-colors ${faceDetected ? 'border-primary' : 'border-muted-foreground/60'}`} />
                <div className={`absolute bottom-4 right-4 w-10 h-10 border-r-2 border-b-2 rounded-br-lg transition-colors ${faceDetected ? 'border-primary' : 'border-muted-foreground/60'}`} />
              </div>
              <div className="absolute inset-x-0 h-20 scan-line pointer-events-none" />

              <div
                className={`absolute bottom-3 left-3 px-2.5 py-1 rounded-md bg-background/70 backdrop-blur-md font-mono text-[10px] uppercase tracking-wider border transition-colors ${faceLabelClass}`}
              >
                {faceLabel}
              </div>

              {micOn && (
                <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-background/70 backdrop-blur-md border border-border">
                  <Mic className="w-3 h-3 text-primary" />
                  <div className="flex items-end gap-[2px] h-4">
                    {Array.from({ length: bars }).map((_, i) => {
                      const lit = i < litBars;
                      const h = 25 + (i / (bars - 1)) * 75;
                      const danger = i >= bars - 2;
                      return (
                        <span
                          key={i}
                          style={{ height: `${h}%` }}
                          className={`w-[3px] rounded-sm transition-colors ${
                            lit ? (danger ? "bg-destructive" : "bg-primary") : "bg-muted-foreground/25"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <button
              onClick={toggleMic}
              aria-label={micOn ? "Mute microphone" : "Enable microphone"}
              title={micOn ? "Mute microphone" : "Enable microphone"}
              className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center transition-all active:scale-95 ${
                micOn
                  ? "bg-primary/90 text-primary-foreground border-primary shadow-[0_0_20px_hsl(var(--primary)/0.5)]"
                  : "bg-background/70 text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleVideo}
              aria-label={videoOn ? "Turn camera off" : "Turn camera on"}
              title={videoOn ? "Turn camera off" : "Turn camera on"}
              className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center transition-all active:scale-95 ${
                videoOn
                  ? "bg-background/70 text-foreground border-border hover:text-primary"
                  : "bg-destructive/90 text-destructive-foreground border-destructive shadow-[0_0_20px_hsl(var(--destructive)/0.5)]"
              }`}
            >
              {videoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    );
  }
);

VideoCapture.displayName = "VideoCapture";
