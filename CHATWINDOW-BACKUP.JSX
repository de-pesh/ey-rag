
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import UploadProgress from './UploadProgress';
import {
    uploadFile, fetchChatResponse, clearBackendSession,
    fetchHistory, getSession,
} from '../backendConfig';

// ── Message bubble ────────────────────────────────────────────
function Message({ msg }) {
    const isUser = msg.role === 'user';
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
        >
            {!isUser && (
                <div className="w-7 h-7 rounded-lg bg-[#1a1a2e] border border-[#2a2a40] flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                    <svg width="13" height="13" viewBox="0 0 28 28" fill="none">
                        <path d="M6 22L14 6L22 22" stroke="#8080c0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8.5 17H19.5" stroke="#8080c0" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </div>
            )}
            <div className={`${isUser ? 'max-w-[65%]' : 'max-w-[75%]'}`}>
                <div className={`
          px-4 py-3 rounded-2xl text-sm leading-relaxed font-mono
          ${isUser
                        ? 'bg-[#1e1e32] border border-[#3a3a5a] text-[#c8c8e8] rounded-br-sm'
                        : 'bg-[#111118] border border-[#1e2030] text-[#c0c0d0] rounded-bl-sm'}
        `}>
                    {msg.streaming && !msg.content ? (
                        <div className="flex gap-1 py-1">
                            {[0, 1, 2].map(i => (
                                <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-[#4040a0]"
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }}
                                />
                            ))}
                        </div>
                    ) : (
                        <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    )}
                </div>

                {/* Source chips */}
                {msg.sources?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {msg.sources.map((s, i) => (
                            <span key={i}
                                className="text-[9px] font-mono text-[#404058] bg-[#0d0d14] border border-[#1a1a28] rounded px-1.5 py-0.5"
                                title={s.text ?? ''}
                            >
                                src·{s.chunk_id ?? i}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// ── Main ChatWindow ───────────────────────────────────────────
export default function ChatWindow({ onSignOut }) {
    const session = getSession();                 // { authenticated, code }
    const sessionId = session?.code ?? 'default';   // used as session_id in every request

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [uploadedFile, setUploadedFile] = useState(null);  // { name }
    const [pipelineStatus, setPipelineStatus] = useState(null);
    const [showProgress, setShowProgress] = useState(false);

    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);

    // ── Load history on mount ──────────────────────────────────
    useEffect(() => {
        async function loadHistory() {
            try {
                const history = await fetchHistory(sessionId);
                if (Array.isArray(history) && history.length > 0) {
                    setMessages(history.map((m, i) => ({ id: i, role: m.role, content: m.content })));
                } else {
                    setMessages([{ id: 'welcome', role: 'assistant', content: 'Hello. Upload a PDF to begin, or ask me anything.' }]);
                }
            } catch {
                setMessages([{ id: 'welcome', role: 'assistant', content: 'Hello. Upload a PDF to begin, or ask me anything.' }]);
            }
            setHistoryLoaded(true);
        }
        loadHistory();
    }, [sessionId]);

    // ── Auto-scroll ────────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addSystemMsg = (text) =>
        setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: text }]);

    // ── File upload ────────────────────────────────────────────
    const handleFileChange = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file || file.type !== 'application/pdf') return;
        e.target.value = '';

        setShowProgress(true);
        setUploadedFile({ name: file.name });
        setPipelineStatus({ stage: 'PARSING', label: 'Starting…', color: '#60a5fa', progress: 5 });

        try {
            const finalPayload = await uploadFile(file, sessionId, (status) => {
                setPipelineStatus(status);
            });

            if (finalPayload?.code === 'READY') {
                const { chunks_indexed, parents_stored } = finalPayload;
                const statsStr = chunks_indexed
                    ? ` ${chunks_indexed} chunks${parents_stored ? `, ${parents_stored} parents` : ''} indexed.`
                    : '';
                addSystemMsg(`✓ "${file.name}" ready.${statsStr} Ask me anything about it.`);
            } else {
                addSystemMsg(`⚠ Failed to process "${file.name}". Please try again.`);
            }
        } catch (err) {
            console.error('[upload]', err);
            setPipelineStatus({ stage: 'ERROR', label: err.message, color: '#f87171', progress: 0 });
            addSystemMsg(`⚠ Upload error: ${err.message}`);
        }
    }, [sessionId]);

    // ── Remove file + clear backend history ───────────────────
    const handleRemoveFile = async () => {
        try { await clearBackendSession(sessionId); } catch (e) { console.warn('[clear]', e); }
        setUploadedFile(null);
        setPipelineStatus(null);
        setShowProgress(false);
        addSystemMsg('Document removed and history cleared.');
    };

    // ── Sign out ───────────────────────────────────────────────
    const handleSignOut = async () => {
        try { await clearBackendSession(sessionId); } catch (e) { console.warn('[clear]', e); }
        onSignOut();
    };

    // ── Send message ───────────────────────────────────────────
    const handleSend = async () => {
        const question = input.trim();
        if (!question || isLoading) return;
        setInput('');
        setIsLoading(true);

        const userMsg = { id: Date.now(), role: 'user', content: question };
        const assistantId = Date.now() + 1;
        const placeholder = { id: assistantId, role: 'assistant', content: '', streaming: true };
        setMessages(prev => [...prev, userMsg, placeholder]);

        try {
            let streamed = '';

            const result = await fetchChatResponse(question, sessionId, (chunk) => {
                // Streaming token — chunk shape depends on your FastAPI SSE format
                streamed += chunk.delta ?? chunk.token ?? chunk.text ?? '';
                setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, content: streamed, streaming: true } : m
                ));
            });

            // Non-streaming: result is the full RAGResponse
            // Streaming:     result is the last SSE payload (may contain sources)
            const answer = result?.answer ?? streamed ?? 'No response received.';
            const sources = result?.sources ?? [];

            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: answer, streaming: false, sources }
                    : m
            ));
        } catch (err) {
            console.error('[chat]', err);
            setMessages(prev => prev.map(m =>
                m.id === assistantId
                    ? { ...m, content: `Error: ${err.message}`, streaming: false }
                    : m
            ));
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const isProcessing = pipelineStatus &&
        !['READY', 'ERROR'].includes(pipelineStatus.stage);

    if (!historyLoaded) {
        return (
            <div className="min-h-screen bg-[#080808] flex items-center justify-center">
                <div className="w-5 h-5 border border-[#2a2a40] border-t-[#6060c0] rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#080808] flex flex-col font-mono">

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#141420] bg-[#0a0a10]/80 backdrop-blur-sm flex-shrink-0">
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#1a1a2e] border border-[#2a2a40] flex items-center justify-center">
                        <svg width="13" height="13" viewBox="0 0 28 28" fill="none">
                            <path d="M6 22L14 6L22 22" stroke="#8080c0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M8.5 17H19.5" stroke="#8080c0" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </div>
                    <span className="text-[#e0e0f0] text-sm tracking-[0.12em]">RAG STUDIO</span>
                </div>

                {/* Active file badge */}
                <AnimatePresence>
                    {uploadedFile && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                            className="flex items-center gap-2 bg-[#111120] border border-[#2a2a40] rounded-lg px-3 py-1.5"
                        >
                            <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                                <rect x="1" y="1" width="8" height="10" rx="1.5" stroke="#6060a0" strokeWidth="1.2" />
                                <path d="M3 4h4M3 6.5h3" stroke="#6060a0" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                            <span className="text-[#8080b0] text-[10px] max-w-[130px] truncate">
                                {uploadedFile.name.replace(/\.pdf$/i, '')}
                            </span>
                            {isProcessing && (
                                <motion.div className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: pipelineStatus?.color ?? '#60a5fa' }}
                                    animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }}
                                />
                            )}
                            {!isProcessing && pipelineStatus?.stage === 'READY' && (
                                <span className="text-[#4ade80]/50 text-[9px]">●</span>
                            )}
                            <button onClick={handleRemoveFile}
                                className="text-[#404060] hover:text-[#c0c0e0] transition-colors text-sm leading-none ml-0.5">
                                ×
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Sign out */}
                <button onClick={handleSignOut}
                    className="text-[#303048] hover:text-[#8080a0] text-[10px] tracking-[0.15em] transition-colors border border-[#1a1a28] hover:border-[#303048] rounded-lg px-3 py-1.5">
                    SIGN OUT
                </button>
            </div>

            {/* ── Messages ── */}
            <div
                className="flex-1 overflow-y-auto px-4 py-6 relative"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e2030 transparent' }}
            >
                <AnimatePresence initial={false}>
                    {messages.map(msg => <Message key={msg.id} msg={msg} />)}
                </AnimatePresence>
                <div ref={messagesEndRef} />

                {/* Pipeline progress overlay */}
                <AnimatePresence>
                    {showProgress && pipelineStatus && (
                        <UploadProgress
                            pipelineStatus={pipelineStatus}
                            filename={uploadedFile?.name ?? ''}
                            onDismiss={() => setShowProgress(false)}
                        />
                    )}
                </AnimatePresence>
            </div>

            {/* ── Input bar ── */}
            <div className="px-4 pb-6 pt-3 border-t border-[#141420] flex-shrink-0">
                <div className="flex items-end gap-3">

                    {/* PDF upload button */}
                    <motion.button
                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessing}
                        title="Upload PDF"
                        className="w-11 h-11 rounded-xl bg-[#111118] border border-[#1e2030] flex items-center justify-center flex-shrink-0
              hover:border-[#3a3a5a] hover:bg-[#161624] transition-all duration-200 text-[#404060] hover:text-[#8080a0]
              disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
                            <path d="M8 5v6M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </motion.button>
                    <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />

                    {/* Textarea */}
                    <div className="flex-1">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={isProcessing ? 'Processing document…' : 'Ask something…'}
                            disabled={isProcessing || isLoading}
                            rows={1}
                            className="w-full bg-[#0d0d14] border border-[#1e2030] rounded-xl px-4 py-3
                text-[#c0c0d0] text-sm font-mono placeholder-[#252535] outline-none resize-none
                focus:border-[#3a3a5a] transition-all duration-200
                disabled:opacity-40 disabled:cursor-not-allowed leading-relaxed"
                            style={{ minHeight: '44px', maxHeight: '120px', scrollbarWidth: 'none' }}
                            onInput={e => {
                                e.target.style.height = 'auto';
                                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                            }}
                        />
                    </div>

                    {/* Send button */}
                    <motion.button
                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading || isProcessing}
                        className="w-11 h-11 rounded-xl flex-shrink-0 bg-[#1e1e32] border border-[#3a3a5a]
              flex items-center justify-center text-[#8080c0] hover:text-[#c0c0f0]
              hover:bg-[#252540] hover:border-[#5050a0] transition-all duration-200
              disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border border-[#6060c0]/30 border-t-[#6060c0] rounded-full animate-spin" />
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M13 3L3 8l4 2 2 4 4-11z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                            </svg>
                        )}
                    </motion.button>
                </div>

                <p className="text-center text-[#151520] text-[9px] tracking-widest mt-3">
                    RAG STUDIO · RETRIEVAL AUGMENTED GENERATION
                </p>
            </div>
        </div>
    );
}