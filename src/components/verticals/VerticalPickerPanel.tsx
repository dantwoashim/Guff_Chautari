import React from 'react';
import { BUILT_IN_VERTICALS } from '../../verticals/catalog';
import type { VerticalConfig, VerticalId } from '../../verticals/types';
import { i18nRuntime } from '../../i18n';

interface VerticalPickerPanelProps {
  activeVerticalId?: VerticalId | null;
  verticals?: ReadonlyArray<VerticalConfig>;
  onActivate: (verticalId: VerticalId) => void;
}

export const VerticalPickerPanel: React.FC<VerticalPickerPanelProps> = ({
  activeVerticalId = null,
  verticals = BUILT_IN_VERTICALS,
  onActivate,
}) => {
  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h2 className="text-lg font-semibold text-[#e9edef]">{i18nRuntime.t('verticalPicker.title')}</h2>
          <p className="mt-1 text-sm text-[#9fb0b8]">
            {i18nRuntime.t('verticalPicker.description')}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {verticals.map((vertical) => {
            const isActive = vertical.id === activeVerticalId;
            return (
              <article
                key={vertical.id}
                className={`rounded-xl border p-4 transition ${
                  isActive
                    ? 'border-[#00a884] bg-[#12362f]'
                    : 'border-[#313d45] bg-[#111b21] hover:border-[#4a5f6c]'
                }`}
              >
                <header className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#e9edef]">{vertical.name}</h3>
                    <p className="text-xs text-[#7ed0f3]">{vertical.tagline}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                      isActive ? 'bg-[#00a884] text-[#06241e]' : 'bg-[#202c33] text-[#8ca2af]'
                    }`}
                  >
                    {isActive ? i18nRuntime.t('verticalPicker.active') : i18nRuntime.t('verticalPicker.inactive')}
                  </span>
                </header>

                <p className="mb-3 text-sm text-[#aebac1]">{vertical.description}</p>

                <div className="mb-4 flex flex-wrap gap-2 text-[11px] text-[#b6c6cf]">
                  <span className="rounded-full bg-[#202c33] px-2 py-1">
                    {i18nRuntime.t('verticalPicker.metrics.workflows', {
                      values: { count: vertical.workflows.length },
                    })}
                  </span>
                  <span className="rounded-full bg-[#202c33] px-2 py-1">
                    {i18nRuntime.t('verticalPicker.metrics.knowledge_templates', {
                      values: { count: vertical.knowledgeTemplates.length },
                    })}
                  </span>
                  <span className="rounded-full bg-[#202c33] px-2 py-1">
                    {i18nRuntime.t('verticalPicker.metrics.decision_presets', {
                      values: { count: vertical.decisionPresets.length },
                    })}
                  </span>
                  <span className="rounded-full bg-[#202c33] px-2 py-1">
                    {i18nRuntime.t('verticalPicker.metrics.panels', {
                      values: { count: vertical.uiPanels.length },
                    })}
                  </span>
                </div>

                <button
                  type="button"
                  className={`rounded border px-3 py-1.5 text-xs font-medium ${
                    isActive
                      ? 'border-[#00a884] bg-[#00a884] text-[#06241e]'
                      : 'border-[#2f4a58] text-[#c8d5dc] hover:bg-[#1a2730]'
                  }`}
                  onClick={() => onActivate(vertical.id)}
                >
                  {isActive ? i18nRuntime.t('verticalPicker.reapply') : i18nRuntime.t('verticalPicker.activate')}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
};
