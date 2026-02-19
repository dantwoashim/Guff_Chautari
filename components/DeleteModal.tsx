/**
 * @file DeleteModal.tsx
 * @description Delete confirmation modal with Apple Liquid Glass design
 * Features glass materials, fluid animations, and haptic-style feedback
 */

import React, { useEffect, useCallback } from 'react';
import { X, Trash2, AlertTriangle } from './Icons';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  chatTitle: string;
  isDarkMode?: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

const DeleteModal: React.FC<DeleteModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  chatTitle, 
  isDarkMode = true 
}) => {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleConfirm = useCallback(() => {
    onConfirm();
    onClose();
  }, [onConfirm, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* ─────────────────────────────────────────
          BACKDROP
          ───────────────────────────────────────── */}
      <div 
        className="
          absolute inset-0 
          bg-black/60 
          backdrop-blur-xl
          animate-fade-in
        " 
        onClick={onClose}
      />

      {/* ─────────────────────────────────────────
          MODAL CONTAINER
          ───────────────────────────────────────── */}
      <div className={`
        relative 
        w-full max-w-sm 
        overflow-hidden
        animate-scale-in
        
        /* Glass Material - Solid */
        rounded-[24px]
        ${isDarkMode 
          ? `
              bg-[rgba(38,38,40,0.95)]
              backdrop-blur-[60px]
              border border-white/[0.10]
              shadow-[0_24px_80px_rgba(0,0,0,0.5),0_8px_24px_rgba(0,0,0,0.25)]
            `
          : `
              bg-[rgba(255,255,255,0.95)]
              backdrop-blur-[60px]
              border border-black/[0.08]
              shadow-[0_24px_80px_rgba(0,0,0,0.15)]
            `
        }
      `}>
        {/* Specular Highlight */}
        <div className="
          absolute inset-x-0 top-0 h-px 
          bg-gradient-to-r from-transparent via-white/25 to-transparent
        " />
        
        {/* Inner Glow */}
        <div className="
          absolute inset-0 
          bg-gradient-to-b from-white/[0.03] to-transparent
          pointer-events-none
          rounded-[24px]
        " />

        {/* ─────────────────────────────────────────
            CONTENT
            ───────────────────────────────────────── */}
        <div className="relative p-6">
          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div className="
              relative
              w-16 h-16 
              rounded-2xl 
              bg-gradient-to-br from-red-500/20 to-orange-500/10
              border border-red-500/20
              flex items-center justify-center
              animate-float
            ">
              {/* Glow effect */}
              <div className="
                absolute inset-0 rounded-2xl
                bg-red-500/20 blur-xl
                animate-pulse
              " />
              <AlertTriangle 
                size={28} 
                className="text-red-400 relative z-10" 
              />
            </div>
          </div>
          
          {/* Title */}
          <h3 className={`
            text-lg font-semibold text-center mb-2
            ${isDarkMode ? 'text-white' : 'text-gray-900'}
          `}>
            Delete this chat?
          </h3>
          
          {/* Description */}
          <p className={`
            text-sm text-center mb-6 leading-relaxed
            ${isDarkMode ? 'text-white/50' : 'text-gray-500'}
          `}>
            This will permanently delete{' '}
            <span className={`
              font-semibold
              ${isDarkMode ? 'text-white/80' : 'text-gray-700'}
            `}>
              "{chatTitle}"
            </span>
            . This action cannot be undone.
          </p>

          {/* ─────────────────────────────────────────
              ACTIONS
              ───────────────────────────────────────── */}
          <div className="flex gap-3">
            {/* Cancel Button */}
            <button
              onClick={onClose}
              className={`
                flex-1
                px-5 py-3 
                rounded-xl 
                text-[14px] font-semibold
                transition-all duration-200
                
                ${isDarkMode 
                  ? `
                      bg-white/[0.06]
                      hover:bg-white/[0.10]
                      border border-white/[0.08]
                      text-white/70 hover:text-white
                    `
                  : `
                      bg-black/[0.04]
                      hover:bg-black/[0.08]
                      border border-black/[0.06]
                      text-gray-600 hover:text-gray-900
                    `
                }
                
                active:scale-[0.98]
              `}
            >
              Cancel
            </button>
            
            {/* Delete Button */}
            <button
              onClick={handleConfirm}
              className="
                flex-1
                flex items-center justify-center gap-2
                px-5 py-3 
                rounded-xl 
                text-[14px] font-semibold
                
                bg-gradient-to-r from-red-500 to-red-600
                hover:from-red-600 hover:to-red-700
                text-white
                
                shadow-lg shadow-red-500/25
                hover:shadow-red-500/40
                
                transition-all duration-200
                hover:scale-[1.02]
                active:scale-[0.98]
              "
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        </div>

        {/* Close Button (Optional - Top Right) */}
        <button
          onClick={onClose}
          className={`
            absolute top-4 right-4
            p-2 rounded-xl
            transition-all duration-200
            ${isDarkMode 
              ? 'text-white/30 hover:text-white/70 hover:bg-white/10' 
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }
          `}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default DeleteModal;