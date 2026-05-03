// ============================================================
//  backendConfig.js — Single source of truth for all backend
//  communication. Edit ONLY this file to connect your FastAPI.
// ============================================================

// ── 1. BASE URL ──────────────────────────────────────────────
export const BASE_URL = 'https://your-fastapi-backend.com'; // ← replace this

// ── 2. ENDPOINTS ─────────────────────────────────────────────
export const ENDPOINTS = {
  verifyCode:    `${BASE_URL}/auth/verify`,
  upload:        `${BASE_URL}/upload`,
  chat:          `${BASE_URL}/chat`,
  clearHistory:  `${BASE_URL}/clear`,
  wsProgress:    BASE_URL.replace(/^http/, 'ws') + '/ws/progress', // WebSocket
};

// ── 3. STATUS CODE → UI STATE MAPPING ────────────────────────
//  Your FastAPI sends { "code": 100, "message": "..." }
//  Add or rename codes here without touching any UI component.
export const PIPELINE_STATUS = {
  100: { stage: 'UPLOADING',  label: 'Uploading file…',         progress: 10 },
  101: { stage: 'READING',    label: 'Reading document…',       progress: 28 },
  102: { stage: 'CHUNKING',   label: 'Chunking text…',          progress: 50 },
  103: { stage: 'EMBEDDING',  label: 'Generating embeddings…',  progress: 72 },
  104: { stage: 'STORING',    label: 'Storing in vector DB…',   progress: 90 },
  105: { stage: 'READY',      label: 'Ready to chat!',          progress: 100 },
  // Error codes
  400: { stage: 'ERROR',      label: 'Upload failed.',          progress: 0  },
  401: { stage: 'AUTH_ERROR', label: 'Invalid access code.',    progress: 0  },
  500: { stage: 'ERROR',      label: 'Server error.',           progress: 0  },
};

// ── 4. SESSION HELPERS ────────────────────────────────────────
const SESSION_KEY = 'rag_session';

export const saveSession = (data) =>
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));

export const getSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch { return null; }
};

export const clearSession = () =>
  sessionStorage.removeItem(SESSION_KEY);

// ── 5. API METHODS ────────────────────────────────────────────

/**
 * Verify an access code.
 * Expected response: { "success": true } or { "success": false, "message": "..." }
 */
export async function verifyAccessCode(code) {
  const res = await fetch(ENDPOINTS.verifyCode, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Upload a PDF file.
 * Expected response: { "file_id": "abc123", "filename": "doc.pdf" }
 * Progress updates come via WebSocket (see openProgressSocket).
 */
export async function uploadFile(file, sessionId) {
  const form = new FormData();
  form.append('file', file);
  form.append('session_id', sessionId ?? '');
  const res = await fetch(ENDPOINTS.upload, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Send a chat message and receive a streaming or standard response.
 * Expected response: { "answer": "...", "sources": [...] }
 */
export async function fetchChatResponse(query, fileId, onChunk) {
  const res = await fetch(ENDPOINTS.chat, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, file_id: fileId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // Streaming support (text/event-stream or chunked JSON)
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            onChunk?.(parsed);
          } catch { /* non-JSON SSE line */ }
        }
      }
    }
    return null; // streaming — caller uses onChunk
  }
  return res.json();
}

/**
 * Tell the backend to clear history / parsed PDF for this session.
 * Expected response: { "success": true }
 */
export async function clearBackendSession(fileId) {
  const res = await fetch(ENDPOINTS.clearHistory, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Open a WebSocket for real-time pipeline progress.
 * Backend sends: { "code": 102, "message": "Chunking..." }
 *
 * @param {string}   fileId      – returned by uploadFile()
 * @param {Function} onStatus    – called with PIPELINE_STATUS[code]
 * @param {Function} onError     – called on socket error / close
 * @returns {WebSocket}          – call .close() to disconnect
 */
export function openProgressSocket(fileId, onStatus, onError) {
  const ws = new WebSocket(`${ENDPOINTS.wsProgress}/${fileId}`);

  ws.onmessage = (event) => {
    try {
      const { code, message } = JSON.parse(event.data);
      const status = PIPELINE_STATUS[code] ?? {
        stage: 'UNKNOWN', label: message ?? 'Processing…', progress: 50,
      };
      onStatus({ ...status, raw: { code, message } });
    } catch (e) {
      console.error('[WS] parse error', e);
    }
  };

  ws.onerror = (e) => { onError?.(e); };
  ws.onclose  = (e) => { if (!e.wasClean) onError?.(e); };

  return ws;
}
