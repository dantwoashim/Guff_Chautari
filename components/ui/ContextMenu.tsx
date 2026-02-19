
import React, { useRef, useEffect, useState } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{size?: number, className?: string}>;
  variant?: 'default' | 'danger';
  onClick: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Adjust position if near edge
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let { x, y } = position;
    
    // Horizontal adjustment
    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 8;
    }
    
    // Vertical adjustment
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 8;
    }
    
    setAdjustedPosition({ x, y });
  }, [position]);

  return (
    <div
      ref={menuRef}
      className="fixed bg-[#233138] rounded-md shadow-xl py-2 min-w-[200px] z-50 animate-in fade-in zoom-in-95 duration-100 border border-[#111b21]/50 text-[#e9edef]"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {items.map((item, i) => (
        <React.Fragment key={item.id}>
          {i > 0 && items[i-1].variant !== items[i].variant && (
            <div className="h-px bg-[#111b21]/50 my-1 mx-3" />
          )}
          <button
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#111b21] transition-colors text-[14.5px] leading-5 ${
              item.variant === 'danger' ? 'text-red-400 hover:text-red-500' : 'text-[#e9edef]'
            }`}
          >
            {item.icon && <item.icon size={18} className="opacity-80" />}
            <span>{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

export default ContextMenu;
