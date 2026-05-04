// ============================================================
//  backendConfig.js — Single source of truth for all backend
//  communication. Edit ONLY this file to connect your FastAPI.
// ============================================================

// ── 1. BASE URL ──────────────────────────────────────────────
// export const BASE_URL = 'https://3b06-86-98-81-86.ngrok-free.app';
export const BASE_URL = 'https://7d14-86-98-81-86.ngrok-free.app';
// ── 2. ENDPOINTS ─────────────────────────────────────────────
export const ENDPOINTS = {
  upload: `${BASE_URL}/upload`,        // POST  multipart — streams SSE progress
  chat: `${BASE_URL}/chat/stream`,     // POST  { session_id, question }
  history: `${BASE_URL}/chat/history`,  // GET?session_id=  /  DELETE?session_id=
  health: `${BASE_URL}/health`,        // GET   liveness check
};

// ── 3. PIPELINE STATUS MAP ────────────────────────────────────
//  Backend SSE sends: { "code": "CHUNKING", "message": "...", "progress": 50 }
//  Keys must exactly match the string codes your FastAPI emits.
//  "stage" drives the UploadProgress visualizer.
export const PIPELINE_STATUS = {
  PARSING: { stage: 'PARSING', label: 'Reading & parsing PDF…', color: '#60a5fa' },
  CHUNKING: { stage: 'CHUNKING', label: 'Splitting into chunks…', color: '#f472b6' },
  VECTOR_INDEX: { stage: 'VECTOR INDEX', label: 'Building vector index…', color: '#a78bfa' },
  BM25_INDEX: { stage: 'BM25_INDEX', label: 'Building BM25 keyword index…', color: '#fb923c' },
  WIRING: { stage: 'CONNECTING', label: 'Wiring retrieval pipeline…', color: '#34d399' },
  READY: { stage: 'READY', label: 'Indexed & ready to chat!', color: '#4ade80' },
  ERROR: { stage: 'ERROR', label: 'Processing failed.', color: '#f87171' },
};

// ── 4. SESSION HELPERS (sessionStorage — survives refresh) ────
const SESSION_KEY = 'rag_session';

export const saveSession = (data) =>
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));

export const getSession = () => {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
  catch { return null; }
};

export const clearSession = () =>
  sessionStorage.removeItem(SESSION_KEY);

// ── 5. API METHODS ────────────────────────────────────────────

/**
 * Health-check.
 * Response: { status: "ok", pipeline_ready: true }
 */
export async function checkHealth() {
  const res = await fetch(ENDPOINTS.health);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Upload a PDF and consume the SSE progress stream.
 *
 * POST /upload
 * Body:  multipart/form-data  { file, session_id }
 * Stream of SSE events:
 *   data: {"code":"PARSING",      "message":"...", "progress":10}
 *   data: {"code":"PARSING",      "message":"...", "progress":25}
 *   data: {"code":"CHUNKING",     "message":"...", "progress":35}
 *   data: {"code":"CHUNKING",     "message":"...", "progress":50}
 *   data: {"code":"VECTOR_INDEX", "message":"...", "progress":60}
 *   data: {"code":"VECTOR_INDEX", "message":"...", "progress":72}
 *   data: {"code":"BM25_INDEX",   "message":"...", "progress":80}
 *   data: {"code":"BM25_INDEX",   "message":"...", "progress":88}
 *   data: {"code":"WIRING",       "message":"...", "progress":93}
 *   data: {"code":"READY",        "message":"...", "progress":100,
 *           "chunks_indexed":842, "parents_stored":210}
 *
 * @param {File}     file       PDF file
 * @param {string}   sessionId  Session identifier
 * @param {Function} onStatus   Called per SSE event with enriched status object
 * @returns {Promise<object>}   The final READY (or ERROR) payload
 */
export async function uploadFile(file, sessionId, onStatus) {
  const form = new FormData();
  form.append('file', file);
  form.append('session_id', sessionId ?? '');

  const res = await fetch(ENDPOINTS.upload, { method: 'POST', body: form });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Upload failed: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPayload = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep partial last line

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;

      try {
        const payload = JSON.parse(raw);
        const mapped = PIPELINE_STATUS[payload.code] ?? {
          stage: payload.code,
          label: payload.message ?? 'Processing…',
          color: '#a0a0c0',
        };

        onStatus?.({
          ...mapped,
          progress: payload.progress ?? 0,
          message: payload.message ?? '',
          raw: payload,
        });

        if (payload.code === 'READY' || payload.code === 'ERROR') {
          finalPayload = payload;
        }
      } catch (e) {
        console.warn('[SSE] parse error:', e, '| raw:', raw);
      }
    }
  }

  return finalPayload;
}

/**
 * Send a chat question and get a RAG response.
 *
 * POST /chat
 * Body:     { session_id: string, question: string }
 * Response: { answer: string, sources: [...] }
 *
 * Also handles text/event-stream if your backend streams tokens.
 *
 * @param {string}   question   User's question
 * @param {string}   sessionId  Session identifier
 * @param {Function} onChunk    Called per streaming token (optional)
 * @returns {Promise<object>}   Full RAGResponse
 */
export async function fetchChatResponse(question, sessionId, onChunk) {
  const res = await fetch(ENDPOINTS.chat, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId ?? '', question }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Chat failed: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalPayload = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep partial last line

    for (const line of lines) {
      if (line.startsWith('data:')) {
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const data = JSON.parse(raw);
          if (data.code === 'CHAT_CHUNK') {
            onChunk?.(data);
          } else if (data.code === 'CHAT_END') {
            finalPayload = data;
          }
        } catch (e) {
          // Ignore parsing errors for partial or malformed chunks
        }
      }
    }
  }

  return finalPayload;
}

/**
 * Fetch chat history for a session.
 * GET /chat/history?session_id=xxx
 * Returns: [{ role: "user"|"assistant", content: "..." }, ...]
 */
export async function fetchHistory(sessionId) {
  const res = await fetch(
    `${ENDPOINTS.history}?session_id=${encodeURIComponent(sessionId ?? '')}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Clear chat history + parsed PDF for this session.
 * DELETE /chat/history?session_id=xxx
 * Triggered by: file [×] button and Sign Out button.
 */
export async function clearBackendSession(sessionId) {
  const res = await fetch(
    `${ENDPOINTS.history}?session_id=${encodeURIComponent(sessionId ?? '')}`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Verify the user access code.
 */
export async function verifyAccessCode(code) {
  // Simulate an API call
  return new Promise((resolve) => {
    setTimeout(() => {
      // Hardcoded password for now. Change this as needed or connect to real backend.
      if (code === '123456') {
        resolve({ success: true });
      } else {
        resolve({ success: false, message: 'Invalid access code.' });
      }
    }, 500);
  });
}