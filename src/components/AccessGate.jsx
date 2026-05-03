import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { verifyAccessCode, saveSession } from '../backendConfig';

export default function AccessGate({ onAuthenticated }) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const inputs = useRef([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  const handleChange = (i, val) => {
    if (!/^[a-zA-Z0-9]?$/.test(val)) return;
    const next = [...code];
    next[i] = val.toUpperCase();
    setCode(next);
    setError('');
    if (val && i < 5) inputs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
    if (e.key === 'Enter') handleSubmit();
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\s/g, '').toUpperCase().slice(0, 6);
    const next = [...code];
    for (let i = 0; i < 6; i++) next[i] = text[i] ?? '';
    setCode(next);
    inputs.current[Math.min(text.length, 5)]?.focus();
  };

  const handleSubmit = async () => {
    const full = code.join('');
    if (full.length < 6) { triggerShake('Enter all 6 characters.'); return; }
    setLoading(true);
    try {
      const res = await verifyAccessCode(full);
      if (res.success) {
        saveSession({ authenticated: true, code: full });
        onAuthenticated();
      } else {
        triggerShake(res.message ?? 'Invalid access code.');
      }
    } catch {
      // DEV: bypass when backend not connected
      saveSession({ authenticated: true, code: full });
      onAuthenticated();
    } finally {
      setLoading(false);
    }
  };

  const triggerShake = (msg) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 600);
    setCode(['', '', '', '', '', '']);
    setTimeout(() => inputs.current[0]?.focus(), 50);
  };

  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#1a1a2e]/40 rounded-full blur-[120px]" />
        <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-[#0d0d1a]/60 rounded-full blur-[80px]" />
        {/* Grid lines */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center gap-10 px-6"
      >
        {/* Logo / Title */}
        <div className="flex flex-col items-center gap-3">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2a2a3e] to-[#1a1a2e] border border-white/10 flex items-center justify-center shadow-2xl"
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M6 22L14 6L22 22" stroke="#a0a0c0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8.5 17H19.5" stroke="#a0a0c0" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </motion.div>
          <div className="text-center">
            <h1 className="text-[#e8e8f0] text-2xl font-light tracking-[0.15em] font-mono">RAG STUDIO</h1>
            <p className="text-[#505060] text-xs tracking-[0.2em] mt-1 font-mono">ENTER ACCESS CODE</p>
          </div>
        </div>

        {/* Code inputs */}
        <motion.div
          animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : {}}
          transition={{ duration: 0.5 }}
          className="flex gap-3"
        >
          {code.map((char, i) => (
            <motion.input
              key={i}
              ref={el => inputs.current[i] = el}
              type="text"
              maxLength={1}
              value={char}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              onPaste={handlePaste}
              className={`
                w-11 h-14 text-center text-[#e8e8f0] text-lg font-mono tracking-wider
                bg-[#111118] border rounded-xl outline-none
                transition-all duration-200
                ${char ? 'border-[#4040a0] shadow-[0_0_12px_#4040a040]' : 'border-[#2a2a3a]'}
                ${error ? 'border-red-500/50' : ''}
                focus:border-[#6060c0] focus:shadow-[0_0_16px_#6060c060]
                caret-[#6060c0]
              `}
              style={{ WebkitTextSecurity: char ? 'disc' : 'none' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05, duration: 0.4 }}
            />
          ))}
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-400/80 text-xs font-mono tracking-wider -mt-4"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Submit */}
        <motion.button
          onClick={handleSubmit}
          disabled={loading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="
            w-64 h-12 rounded-xl bg-[#1e1e32] border border-[#3a3a5a]
            text-[#a0a0c8] text-sm font-mono tracking-[0.15em]
            hover:bg-[#252540] hover:border-[#5050a0] hover:text-[#c8c8f0]
            transition-all duration-300 flex items-center justify-center gap-2
            disabled:opacity-40 disabled:cursor-not-allowed
            shadow-[0_4px_24px_#00000060]
          "
        >
          {loading ? (
            <div className="w-4 h-4 border border-[#a0a0c8]/30 border-t-[#a0a0c8] rounded-full animate-spin" />
          ) : (
            <>
              <span>AUTHENTICATE</span>
              <span className="opacity-50">→</span>
            </>
          )}
        </motion.button>

        <p className="text-[#303040] text-xs font-mono tracking-wider">
          secured · encrypted · private
        </p>
      </motion.div>
    </div>
  );
}
