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

    const full = next.join('');
    if (full.length === 6) handleSubmit(full);
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
    if (e.key === 'Enter') handleSubmit(code.join(''));
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\s/g, '').toUpperCase().slice(0, 6);
    const next = [...code];
    for (let i = 0; i < 6; i++) next[i] = text[i] ?? '';
    setCode(next);
    inputs.current[Math.min(text.length, 5)]?.focus();

    const full = next.join('');
    if (full.length === 6) handleSubmit(full);
  };

  const handleSubmit = async (overrideCode) => {
    const full = typeof overrideCode === 'string' ? overrideCode : code.join('');
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
      triggerShake('Failed to verify code. Server offline.');
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
    <div className="min-h-screen bg-[#000000] flex items-center justify-center relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center gap-10 px-6"
      >
        {/* Logo / Title */}
        <div className="flex flex-col items-center gap-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="w-16 h-16 rounded-3xl bg-[#1c1c1e] border border-[#2c2c2e] flex items-center justify-center shadow-2xl"
          >
            <span className="text-[#f5f5f7] font-bold text-xl tracking-wider">RAG</span>
          </motion.div>
          <div className="text-center space-y-1">
            <h1 className="text-[#f5f5f7] text-2xl font-medium tracking-tight">RAG Studio</h1>
            <p className="text-[#86868b] text-sm">Enter Access Code</p>
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
              disabled={loading}
              className={`
                w-12 h-14 text-center text-[#f5f5f7] text-xl font-medium
                bg-[#1c1c1e] border rounded-2xl outline-none
                transition-all duration-200
                ${char ? 'border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]' : 'border-[#2c2c2e]'}
                ${error ? 'border-red-500/50' : ''}
                focus:border-blue-500 focus:shadow-[0_0_16px_rgba(59,130,246,0.4)]
                caret-blue-500
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
              className="text-red-400 text-[13px] -mt-4"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Loading Indicator */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="h-[52px] flex items-center justify-center"
            >
              <div className="w-6 h-6 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" />
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[#555555] text-xs">
          RAG · Private
        </p>
      </motion.div>
    </div>
  );
}
