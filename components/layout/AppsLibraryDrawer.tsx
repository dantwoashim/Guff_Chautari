import React, { useMemo, useState } from 'react';
import { Search, Sparkles, X } from '../Icons';
import type { AppViewId } from '../../types';
import type { ViewRegistryEntry } from '../../navigation/viewRegistry';

interface AppsLibraryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ViewRegistryEntry[];
  onOpenView: (viewId: AppViewId) => void;
}

const AppsLibraryDrawer: React.FC<AppsLibraryDrawerProps> = ({
  isOpen,
  onClose,
  entries,
  onOpenView,
}) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) {
      return entries;
    }
    return entries.filter((entry) =>
      `${entry.title} ${entry.category} ${entry.description}`.toLowerCase().includes(query),
    );
  }, [entries, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ViewRegistryEntry[]>();
    filtered.forEach((entry) => {
      const list = map.get(entry.category) || [];
      list.push(entry);
      map.set(entry.category, list);
    });
    return Array.from(map.entries());
  }, [filtered]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/55 backdrop-blur-sm">
      <div className="h-full w-full max-w-xl border-l border-[color:var(--color-border)] bg-[color:rgba(8,19,31,0.96)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--color-border)]">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text)]">Apps Library</h2>
            <p className="text-xs text-[color:var(--color-text-muted)] mt-1">
              Non-core modules and specialized tools
            </p>
          </div>
          <button
            onClick={onClose}
            className="premium-button h-9 w-9 inline-flex items-center justify-center"
            aria-label="Close apps library"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 border-b border-[color:var(--color-border)]">
          <label className="flex items-center gap-3 premium-input">
            <Search size={16} className="text-[color:var(--color-text-soft)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-transparent outline-none text-sm"
              placeholder="Search modules..."
              aria-label="Search apps"
            />
          </label>
        </div>

        <div className="h-[calc(100%-132px)] overflow-y-auto scroll-premium p-4 space-y-5">
          {grouped.length === 0 ? (
            <div className="premium-panel p-5 text-sm text-[color:var(--color-text-muted)]">
              No modules match your search.
            </div>
          ) : (
            grouped.map(([category, categoryItems]) => (
              <section key={category} className="space-y-2">
                <h3 className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-text-soft)]">
                  {category}
                </h3>
                <div className="space-y-2">
                  {categoryItems.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => {
                        onOpenView(entry.id);
                        onClose();
                      }}
                      className="w-full premium-panel p-4 text-left transition-all hover:border-[color:rgba(108,199,255,0.55)]"
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--color-text)]">
                        <Sparkles size={14} className="text-[color:var(--color-accent)]" />
                        {entry.title}
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--color-text-muted)] leading-relaxed">
                        {entry.description}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <button className="flex-1" aria-label="Close apps drawer" onClick={onClose} />
    </div>
  );
};

export default AppsLibraryDrawer;
