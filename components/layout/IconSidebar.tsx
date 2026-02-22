import React from 'react';
import {
  Command,
  Library,
  Settings,
  Sparkles,
} from '../Icons';
import { PRIMARY_NAV_ITEMS } from '../../navigation/navModel';
import type { PrimaryAreaId } from '../../navigation/viewRegistry';

interface IconSidebarProps {
  currentArea: PrimaryAreaId;
  onAreaChange: (area: PrimaryAreaId) => void;
  onOpenAppsLibrary: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
}

const IconSidebar: React.FC<IconSidebarProps> = ({
  currentArea,
  onAreaChange,
  onOpenAppsLibrary,
  onOpenCommandPalette,
  onOpenSettings,
}) => {
  return (
    <div className="h-full flex flex-col items-center py-4 px-2">
      <div className="w-11 h-11 rounded-2xl premium-panel flex items-center justify-center text-[color:var(--color-accent)]">
        <Sparkles size={18} />
      </div>

      <div className="mt-5 w-full flex flex-col gap-2">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentArea === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onAreaChange(item.id)}
              className={`group relative w-full h-12 rounded-xl border transition-all duration-[var(--motion-normal)] ${
                active
                  ? 'border-[color:rgba(108,199,255,0.7)] bg-[color:rgba(24,56,87,0.75)] text-[color:var(--color-text)] shadow-[0_10px_24px_rgba(5,16,30,0.42)]'
                  : 'border-transparent text-[color:var(--color-text-muted)] hover:border-[color:var(--color-border)] hover:bg-[color:rgba(18,36,58,0.72)]'
              }`}
              aria-label={item.title}
              title={item.title}
            >
              <span className="absolute left-full ml-3 px-3 py-1 rounded-lg premium-panel text-xs text-left pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30">
                {item.title}
              </span>
              <Icon size={18} className="mx-auto" />
            </button>
          );
        })}
      </div>

      <div className="mt-auto w-full flex flex-col gap-2 pb-1">
        <button
          onClick={onOpenCommandPalette}
          className="premium-button h-11 w-full inline-flex items-center justify-center text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
          title="Command Palette"
          aria-label="Open command palette"
        >
          <Command size={17} />
        </button>

        <button
          onClick={onOpenAppsLibrary}
          className="premium-button h-11 w-full inline-flex items-center justify-center text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
          title="Apps Library"
          aria-label="Open apps library"
        >
          <Library size={17} />
        </button>

        <button
          onClick={onOpenSettings}
          className="premium-button h-11 w-full inline-flex items-center justify-center text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
          title="Settings"
          aria-label="Open settings"
        >
          <Settings size={17} />
        </button>
      </div>
    </div>
  );
};

export default IconSidebar;
