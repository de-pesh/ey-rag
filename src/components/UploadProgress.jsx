import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STAGE_ICONS = {
  UPLOADING:  { symbol: '↑', color: '#60a5fa' },
  READING:    { symbol: '◎', color: '#a78bfa' },
  CHUNKING:   { symbol: '⊞', color: '#f472b6' },
  EMBEDDING:  { symbol: '⬡', color: '#34d399' },
  STORING:    { symbol: '⬡', color: '#fbbf24' },
  READY:      { symbol: '✓', color: '#4ade80' },
  ERROR:      { symbol: '✕', color: '#f87171' },
};

export default function UploadProgress({ pipelineStatus, onDismiss }) {
  const isReady = pipelineStatus?.stage === 'READY';
  const isError = pipelineStatus?.stage === 'ERROR';
  const activeStage = pipelineStatus?.stage || 'UPLOADING';
  const activeIcon = STAGE_ICONS[activeStage] ?? STAGE_ICONS.UPLOADING;
  const progress = pipelineStatus?.progress ?? 0;

  const displayStage = activeStage === 'READY' ? 'Ready' : 
                       activeStage === 'ERROR' ? 'Error' : 
                       activeStage.charAt(0) + activeStage.slice(1).toLowerCase();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, x: '-50%', y: '-45%' }}
      animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
      exit={{ opacity: 0, scale: 0.96, x: '-50%', y: '-45%' }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-1/2 left-1/2 z-50 w-[240px] bg-[#0d0d14]/90 backdrop-blur-xl border border-[#1e2030] rounded-3xl p-8 flex flex-col items-center justify-center shadow-2xl"
    >
      {/* Big Icon */}
      <div className="relative mb-6">
        <motion.div
          className="w-20 h-20 rounded-full flex items-center justify-center border-2 bg-[#0a0a0f]"
          style={{ borderColor: isError ? '#f87171' : isReady ? '#4ade80' : activeIcon.color }}
          animate={!isReady && !isError ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <span className="text-3xl" style={{ color: isError ? '#f87171' : isReady ? '#4ade80' : activeIcon.color }}>
            {isReady ? '✓' : isError ? '✕' : activeIcon.symbol}
          </span>
        </motion.div>
        
        {/* Pulse ring */}
        {!isReady && !isError && (
          <motion.div
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: activeIcon.color }}
            animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </div>

      {/* Stage Text */}
      <span className={`text-base font-medium tracking-wide ${isReady ? 'text-[#4ade80]' : isError ? 'text-[#f87171]' : 'text-[#e8e8f0]'}`}>
        {displayStage}{!isReady && !isError && '...'}
      </span>

      {/* Progress Bar */}
      {!isReady && !isError && (
        <div className="w-full h-1 bg-[#1a1a28] rounded-full overflow-hidden mt-6">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: activeIcon.color }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      )}

      {/* Footer / Dismiss */}
      <AnimatePresence>
        {(isReady || isError) && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="w-full overflow-hidden"
          >
            <button
              onClick={onDismiss}
              className={`w-full py-2.5 rounded-full text-[11px] font-medium tracking-wider transition-colors
                ${isReady
                  ? 'text-[#0d0d14] bg-[#4ade80] hover:bg-[#4ade80]/90'
                  : 'text-[#0d0d14] bg-[#f87171] hover:bg-[#f87171]/90'
                }`}
            >
              {isReady ? 'START CHATTING' : 'DISMISS'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
