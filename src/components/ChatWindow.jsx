import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import UploadProgress from './UploadProgress';
import {
  uploadFile, fetchChatResponse, clearBackendSession,
  openProgressSocket, PIPELINE_STATUS, getSession,
} from '../backendConfig';

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div className={`max-w-[80%] ${isUser ? 'max-w-[75%]' : ''}`}>
        <div className={`
          px-4 py-3 rounded-2xl text-[15px] leading-relaxed
          ${isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-[#1c1c1e] text-[#f5f5f7] rounded-bl-sm'
          }
        `}>
          {msg.streaming && !msg.content ? (
            <div className="flex gap-1.5 py-2 px-1">
              {[0, 1, 2].map(i => (
                <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-[#888]"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
          ) : (
            <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
          )}
        </div>
        {msg.sources?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {msg.sources.map((s, i) => (
              <span key={i} className="text-[10px] text-[#86868b] bg-[#1c1c1e] rounded-full px-2 py-0.5">
                doc·{s.chunk_id ?? i}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function ChatWindow({ onSignOut }) {
  const [messages, setMessages] = useState([
    { id: 'welcome', role: 'assistant', content: 'Hello. Upload a PDF to begin, or ask me anything.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);   // { name, id }
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [showProgress, setShowProgress] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);
  const session = getSession();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clean up WS on unmount
  useEffect(() => () => wsRef.current?.close(), []);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;
    e.target.value = '';

    setShowProgress(true);
    setPipelineStatus({ stage: 'UPLOADING', label: 'Uploading file…', progress: 10 });

    try {
      const result = await uploadFile(file, session?.code);
      const fileId = result.file_id ?? 'local_' + Date.now();
      setUploadedFile({ name: file.name, id: fileId });

      // Open WebSocket for progress
      wsRef.current?.close();
      wsRef.current = openProgressSocket(
        fileId,
        (status) => {
          setPipelineStatus(status);
          if (status.stage === 'READY') {
            addSystemMessage(`✓ "${file.name}" indexed. Ask me anything about it.`);
          }
          if (status.stage === 'ERROR') {
            addSystemMessage(`⚠ Failed to process "${file.name}".`);
          }
        },
        (err) => {
          console.error('WS error', err);
          // DEV fallback: simulate pipeline when no backend
          simulatePipeline(file.name);
        }
      );
    } catch {
      // DEV: simulate pipeline
      setUploadedFile({ name: file.name, id: 'dev_' + Date.now() });
      simulatePipeline(file.name);
    }
  }, [session]);

  const simulatePipeline = (filename) => {
    const steps = [100, 101, 102, 103, 104, 105];
    steps.forEach((code, i) => {
      setTimeout(() => {
        const s = PIPELINE_STATUS[code];
        setPipelineStatus(s);
        if (code === 105) {
          addSystemMessage(`✓ "${filename}" indexed (demo). Ask me anything about it.`);
        }
      }, i * 900);
    });
  };

  const addSystemMessage = (text) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      role: 'assistant',
      content: text,
    }]);
  };

  const handleRemoveFile = async () => {
    wsRef.current?.close();
    if (uploadedFile?.id) {
      try { await clearBackendSession(uploadedFile.id); } catch { }
    }
    setUploadedFile(null);
    setPipelineStatus(null);
    setShowProgress(false);
    addSystemMessage('Document removed. History cleared.');
  };

  const handleSignOut = async () => {
    wsRef.current?.close();
    if (uploadedFile?.id) {
      try { await clearBackendSession(uploadedFile.id); } catch { }
    }
    onSignOut();
  };

  const handleSend = async () => {
    const query = input.trim();
    if (!query || isLoading) return;
    setInput('');
    setIsLoading(true);

    const userMsg = { id: Date.now(), role: 'user', content: query };
    const assistantId = Date.now() + 1;
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', streaming: true }]);

    try {
      let streamedText = '';
      const result = await fetchChatResponse(query, uploadedFile?.id, (chunk) => {
        streamedText += chunk.delta ?? chunk.text ?? '';
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: streamedText, streaming: true } : m
        ));
      });

      // Non-streaming fallback
      if (result) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: result.answer ?? result.message ?? 'No response.', streaming: false, sources: result.sources }
            : m
        ));
      } else {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, streaming: false } : m
        ));
      }
    } catch {
      // DEV: mock response
      const mockReply = uploadedFile
        ? `Based on "${uploadedFile.name}", I found relevant context. (Backend not connected — this is a demo response.)`
        : 'I can help you with that. (Backend not connected — demo mode.)';
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: mockReply, streaming: false } : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const isProcessing = pipelineStatus && !['READY', 'ERROR'].includes(pipelineStatus.stage);

  return (
    <div className="min-h-screen bg-[#000000] flex justify-center selection:bg-blue-500/30">
      <div className="w-full max-w-3xl flex flex-col h-screen relative bg-[#000000]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#000000]/80 backdrop-blur-xl shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span className="text-[#f5f5f7] font-medium text-lg tracking-tight">RAG</span>
          </div>

          {/* Active file badge */}
          <AnimatePresence>
            {uploadedFile && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2 bg-[#1c1c1e]/80 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
              >
                <span className="text-[#e8e8f0] font-medium text-[13px] max-w-[150px] truncate">
                  {uploadedFile.name.replace('.pdf', '')}
                </span>
                {isProcessing && (
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-blue-500"
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                )}
                <button
                  onClick={handleRemoveFile}
                  className="text-[#86868b] hover:text-[#f5f5f7] transition-colors text-[16px] leading-none ml-1"
                >
                  ×
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={handleSignOut}
            className="text-[#86868b] hover:text-[#f5f5f7] text-[13px] transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2"
          style={{ scrollbarWidth: 'none' }}
        >
          <AnimatePresence initial={false}>
            {messages.map(msg => <Message key={msg.id} msg={msg} />)}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Upload Progress Overlay */}
        <AnimatePresence>
          {showProgress && pipelineStatus && (
            <UploadProgress
              pipelineStatus={pipelineStatus}
              filename={uploadedFile?.name ?? ''}
              onDismiss={() => {
                setShowProgress(false);
              }}
            />
          )}
        </AnimatePresence>

        {/* Input area */}
        <div className="px-4 pb-8 pt-2 shrink-0 sticky bottom-0 z-10 bg-gradient-to-t from-[#000000] via-[#000000]/95 to-transparent">
          <div className="flex items-end gap-2 bg-[#1c1c1e] rounded-3xl p-1.5 pl-2 border border-[#2c2c2e] focus-within:border-[#4c4c4e] transition-colors">
            {/* PDF upload button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="
                w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
                text-[#86868b] hover:text-[#f5f5f7] transition-colors mb-1
                disabled:opacity-30 disabled:cursor-not-allowed
              "
              title="Upload PDF"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </motion.button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Text input */}
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isProcessing ? 'Processing document…' : 'Message RAG...'}
                disabled={isProcessing || isLoading}
                rows={1}
                className="
                  w-full bg-transparent py-2.5 px-2
                  text-[#f5f5f7] text-[15px] placeholder-[#86868b]
                  outline-none resize-none leading-relaxed
                  disabled:opacity-40 disabled:cursor-not-allowed
                "
                style={{
                  minHeight: '44px', maxHeight: '200px',
                  scrollbarWidth: 'none',
                }}
                onInput={e => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                }}
              />
            </div>

            {/* Send button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSend}
              disabled={!input.trim() || isLoading || isProcessing}
              className="
                w-9 h-9 rounded-full flex-shrink-0 mb-1
                bg-white text-black flex items-center justify-center
                transition-all duration-200
                disabled:opacity-20 disabled:bg-[#333] disabled:text-[#888] disabled:cursor-not-allowed
              "
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
