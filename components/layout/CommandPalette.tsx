import React, { useEffect, useMemo, useState } from 'react';
import { Search } from '../Icons';

export interface CommandPaletteItem {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
}

const normalize = (value: string) => value.toLowerCase().trim();

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, items }) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    const q = normalize(query);
    if (!q) {
      return items;
    }

    return items.filter((item) => {
      const haystack = [item.title, item.description, ...(item.keywords || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (filteredItems.length ? (prev + 1) % filteredItems.length : 0));
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) =>
          filteredItems.length ? (prev - 1 + filteredItems.length) % filteredItems.length : 0,
        );
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const target = filteredItems[activeIndex];
        if (!target) {
          return;
        }
        target.action();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, filteredItems, isOpen, onClose]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-6 pt-[10vh] bg-black/55 backdrop-blur-sm">
      <div className="w-full max-w-2xl premium-panel overflow-hidden">
        <div className="p-3 border-b border-[color:var(--color-border)]">
          <label className="flex items-center gap-3 premium-input">
            <Search size={16} className="text-[color:var(--color-text-soft)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              className="w-full bg-transparent outline-none text-sm"
              placeholder="Search views, actions, and modules..."
              aria-label="Command palette search"
            />
          </label>
        </div>

        <div className="max-h-[420px] overflow-y-auto scroll-premium p-2">
          {filteredItems.length === 0 ? (
            <div className="p-5 text-sm text-[color:var(--color-text-muted)]">No matching commands.</div>
          ) : (
            filteredItems.map((item, index) => {
              const active = activeIndex === index;
              return (
                <button
                  key={item.id}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                    active
                      ? 'border-[color:rgba(108,199,255,0.55)] bg-[color:rgba(18,43,69,0.86)]'
                      : 'border-transparent hover:border-[color:var(--color-border)] hover:bg-[color:rgba(17,36,58,0.72)]'
                  }`}
                >
                  <div className="text-sm font-semibold text-[color:var(--color-text)]">{item.title}</div>
                  {item.description ? (
                    <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{item.description}</div>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>

      <button
        className="absolute inset-0 -z-10"
        aria-label="Close command palette"
        onClick={onClose}
      />
    </div>
  );
};

export default CommandPalette;
