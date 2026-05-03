import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STAGES = ['UPLOADING', 'READING', 'CHUNKING', 'EMBEDDING', 'STORING', 'READY'];

const STAGE_ICONS = {
  UPLOADING:  { symbol: '↑', color: '#60a5fa' },
  READING:    { symbol: '◎', color: '#a78bfa' },
  CHUNKING:   { symbol: '⊞', color: '#f472b6' },
  EMBEDDING:  { symbol: '⬡', color: '#34d399' },
  STORING:    { symbol: '⬡', color: '#fbbf24' },
  READY:      { symbol: '✓', color: '#4ade80' },
  ERROR:      { symbol: '✕', color: '#f87171' },
};

const STAGE_DESCRIPTIONS = {
  UPLOADING:  'Transferring your PDF to the server',
  READING:    'Parsing document structure & text',
  CHUNKING:   'Splitting into semantic chunks',
  EMBEDDING:  'Converting chunks to vectors',
  STORING:    'Persisting to vector database',
  READY:      'Your document is indexed & ready',
  ERROR:      'Something went wrong',
};

function ParticleField({ active, color }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full"
          style={{ backgroundColor: color, left: `${10 + i * 12}%` }}
          animate={active ? {
            y: [0, -20, 0],
            opacity: [0, 0.6, 0],
            scale: [0, 1, 0],
          } : { opacity: 0 }}
          transition={{
            duration: 1.4,
            repeat: active ? Infinity : 0,
            delay: i * 0.18,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

function StageNode({ stage, status, index }) {
  const isDone = status === 'done';
  const isActive = status === 'active';
  const isPending = status === 'pending';
  const isError = status === 'error';

  const icon = STAGE_ICONS[stage];

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-4"
    >
      {/* Node circle */}
      <div className="relative flex-shrink-0">
        <motion.div
          className="w-9 h-9 rounded-full flex items-center justify-center relative z-10 border"
          animate={{
            backgroundColor: isError ? '#1a0a0a' : isDone ? '#0a1a0f' : isActive ? '#0d0d20' : '#0d0d14',
            borderColor: isError ? '#f87171' : isDone ? '#4ade80' : isActive ? icon.color : '#1e2030',
            scale: isActive ? [1, 1.05, 1] : 1,
          }}
          transition={{ scale: { repeat: isActive ? Infinity : 0, duration: 1.4 } }}
        >
          {isActive ? (
            <motion.span
              className="text-xs font-mono"
              style={{ color: icon.color }}
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              {icon.symbol}
            </motion.span>
          ) : (
            <span className={`text-xs font-mono ${isDone ? 'text-[#4ade80]' : isError ? 'text-[#f87171]' : 'text-[#303040]'}`}>
              {isDone ? '✓' : isError ? '✕' : icon.symbol}
            </span>
          )}
        </motion.div>
        {/* Pulse ring for active */}
        {isActive && (
          <motion.div
            className="absolute inset-0 rounded-full border"
            style={{ borderColor: icon.color }}
            animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono tracking-[0.12em] ${
            isDone ? 'text-[#4ade80]/70' :
            isError ? 'text-[#f87171]' :
            isActive ? 'text-[#e8e8f0]' :
            'text-[#303040]'
          }`}>
            {stage}
          </span>
          {isDone && (
            <motion.span
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-[10px] text-[#4ade80]/50 font-mono"
            >
              DONE
            </motion.span>
          )}
        </div>
        {(isActive || isError) && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`text-[10px] font-mono mt-0.5 ${isError ? 'text-[#f87171]/60' : 'text-[#505070]'}`}
          >
            {STAGE_DESCRIPTIONS[stage]}
          </motion.p>
        )}
      </div>

      {/* Active indicator */}
      {isActive && (
        <motion.div
          className="flex gap-0.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-0.5 h-3 rounded-full"
              style={{ backgroundColor: icon.color }}
              animate={{ scaleY: [0.3, 1, 0.3] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

export default function UploadProgress({ pipelineStatus, filename, onDismiss }) {
  const [stages, setStages] = useState({});

  useEffect(() => {
    if (!pipelineStatus) return;
    const { stage } = pipelineStatus;
    const stageIndex = STAGES.indexOf(stage);

    const newStages = {};
    STAGES.forEach((s, i) => {
      if (stage === 'ERROR') {
        // Mark the last active one as error, previous as done
        const lastDone = STAGES.indexOf('STORING'); // fallback
        newStages[s] = i < lastDone ? 'done' : i === lastDone ? 'error' : 'pending';
      } else {
        newStages[s] = i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'pending';
      }
    });
    setStages(newStages);
  }, [pipelineStatus]);

  const progress = pipelineStatus?.progress ?? 0;
  const isReady = pipelineStatus?.stage === 'READY';
  const isError = pipelineStatus?.stage === 'ERROR';
  const activeStage = pipelineStatus?.stage;
  const activeIcon = STAGE_ICONS[activeStage] ?? STAGE_ICONS.UPLOADING;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="absolute bottom-20 left-4 right-4 z-20 bg-[#0d0d14] border border-[#1e2030] rounded-2xl overflow-hidden shadow-2xl"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#1a1a28] relative overflow-hidden">
        <ParticleField
          active={!isReady && !isError}
          color={activeIcon.color}
        />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#2a2a40]">
              {!isReady && !isError && (
                <motion.div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: activeIcon.color }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
            </div>
            <span className="text-[#e8e8f0] text-xs font-mono tracking-[0.1em]">
              {isReady ? 'INDEXED' : isError ? 'FAILED' : 'PROCESSING'}
            </span>
          </div>
          <span className="text-[#404058] text-[10px] font-mono max-w-[140px] truncate">{filename}</span>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-0.5 bg-[#1a1a28] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: isError ? '#f87171' : activeIcon.color }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[#303044] text-[9px] font-mono">{pipelineStatus?.label ?? 'Initialising…'}</span>
          <span className="text-[#303044] text-[9px] font-mono">{progress}%</span>
        </div>
      </div>

      {/* Stage list */}
      <div className="px-4 py-3 flex flex-col gap-2.5">
        {STAGES.filter(s => s !== 'READY').map((stage, i) => (
          <StageNode
            key={stage}
            stage={stage}
            status={stages[stage] ?? 'pending'}
            index={i}
          />
        ))}
      </div>

      {/* Footer — shown when done or error */}
      <AnimatePresence>
        {(isReady || isError) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-[#1a1a28]"
          >
            <button
              onClick={onDismiss}
              className={`w-full py-3 text-xs font-mono tracking-[0.12em] transition-colors
                ${isReady
                  ? 'text-[#4ade80]/60 hover:text-[#4ade80] hover:bg-[#4ade80]/5'
                  : 'text-[#f87171]/60 hover:text-[#f87171] hover:bg-[#f87171]/5'
                }`}
            >
              {isReady ? 'DISMISS · START CHATTING →' : 'DISMISS · TRY AGAIN'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
