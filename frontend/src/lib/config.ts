/**
 * KYCortex AI — Centralised backend config
 * Reads from Vite env vars so production/staging/local all work without code changes.
 *
 * .env.local          → local dev  (ws://localhost:8000)
 * .env.production     → Vercel build (set VITE_BACKEND_URL in Vercel dashboard)
 */

const rawUrl: string =
  import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

// Strip trailing slash
const http = rawUrl.replace(/\/$/, "");

// Convert http(s) → ws(s) for WebSocket
const ws = http.replace(/^http/, "ws");

export const BACKEND_HTTP = http;   // e.g. "https://kycortex.railway.app"
export const BACKEND_WS   = ws;     // e.g. "wss://kycortex.railway.app"
