# RAG Studio — Frontend

A sleek, dark-themed React frontend for a Retrieval-Augmented Generation chatbot.  
Connect your FastAPI backend by editing **one file only**: `src/backendConfig.js`.

---

## Quick Start

```bash
npm install
npm start          # dev server at localhost:3000
npm run build      # production build
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Source → GitHub Actions**.
3. The workflow at `.github/workflows/deploy.yml` will auto-deploy on every push to `main`.

---

## Connecting Your FastAPI Backend

Open `src/backendConfig.js` and change **only**:

```js
export const BASE_URL = 'https://your-fastapi-backend.com';
```

That's it. Every API call, WebSocket URL, and status mapping flows from that one constant.

---

## Backend API Contract

### POST `/auth/verify`
**Request:**
```json
{ "code": "ABC123" }
```
**Response:**
```json
{ "success": true }
// or
{ "success": false, "message": "Invalid code." }
```

---

### POST `/upload`
**Request:** `multipart/form-data` with fields:
- `file` — the PDF
- `session_id` — string (optional, from access code)

**Response:**
```json
{ "file_id": "uuid-string", "filename": "document.pdf" }
```

After this, the backend **streams progress** over WebSocket.

---

### WebSocket `/ws/progress/{file_id}`

The backend sends JSON messages as the RAG pipeline progresses:

```json
{ "code": 100, "message": "Uploading…" }
{ "code": 101, "message": "Reading document…" }
{ "code": 102, "message": "Chunking text…" }
{ "code": 103, "message": "Generating embeddings…" }
{ "code": 104, "message": "Storing in vector DB…" }
{ "code": 105, "message": "Ready!" }
```

**Code → UI Stage mapping** (edit in `backendConfig.js` → `PIPELINE_STATUS`):

| Code | Stage      | Progress % |
|------|------------|------------|
| 100  | UPLOADING  | 10         |
| 101  | READING    | 28         |
| 102  | CHUNKING   | 50         |
| 103  | EMBEDDING  | 72         |
| 104  | STORING    | 90         |
| 105  | READY      | 100        |
| 400  | ERROR      | 0          |
| 500  | ERROR      | 0          |

---

### POST `/chat`
**Request:**
```json
{ "query": "What is the main topic?", "file_id": "uuid-string" }
```

**Response (standard JSON):**
```json
{
  "answer": "The document is about…",
  "sources": [
    { "chunk_id": 3, "text": "…excerpt…" }
  ]
}
```

**Response (SSE streaming — optional):**
```
Content-Type: text/event-stream

data: {"delta": "The "}
data: {"delta": "document "}
data: {"delta": "is about…"}
data: {"sources": [{"chunk_id": 3}]}
```

---

### POST `/clear`
**Request:**
```json
{ "file_id": "uuid-string" }
```
**Response:**
```json
{ "success": true }
```

Called automatically when the user clicks **[×]** on the file badge or **SIGN OUT**.

---

## Project Structure

```
src/
├── App.js                  — Auth gate router
├── backendConfig.js        — ★ ONLY FILE YOU NEED TO EDIT
├── index.js
├── index.css
└── components/
    ├── AccessGate.jsx      — 6-character code entry screen
    ├── ChatWindow.jsx      — Main chat + file upload interface
    └── UploadProgress.jsx  — RAG pipeline visualizer
```

## Demo Mode

If the backend is unreachable, the app falls back to:
- **Auth**: any 6-character code is accepted
- **Upload**: pipeline stages are simulated with 900ms delays
- **Chat**: a canned response is returned

This lets you develop and demo the UI without a running backend.
