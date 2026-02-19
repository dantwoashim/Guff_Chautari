
import React from 'react';
import { Sparkles, Brain, Loader2, Wand2, Check, Trash2 } from '../Icons';
import { ChatConfig, InstructionPreset } from '../../types';

interface PersonaSettingsProps {
  config: ChatConfig;
  setConfig: (config: ChatConfig) => void;
  isProcessing?: boolean;
  personaPreview?: string;
  isLoadingPreview?: boolean;
  onGeneratePreview: () => void;
  presets: InstructionPreset[];
  onSavePreset: () => void;
  onDeletePreset: (id: string) => void;
  presetName: string;
  setPresetName: (name: string) => void;
  showSavePreset: boolean;
  setShowSavePreset: (show: boolean) => void;
  isPresetLoading: boolean;
}

const PersonaSettings: React.FC<PersonaSettingsProps> = ({
  config,
  setConfig,
  isProcessing,
  personaPreview,
  isLoadingPreview,
  onGeneratePreview,
  presets,
  onSavePreset,
  onDeletePreset,
  presetName,
  setPresetName,
  showSavePreset,
  setShowSavePreset,
  isPresetLoading
}) => {
  return (
    <div className="space-y-6 animate-slide-up">
      {/* Living Persona Card */}
      {config.livingPersona && (
        <div className="panel-soft specular p-5 border border-stroke/80">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent/30 to-accent2/30 border border-stroke/80 flex items-center justify-center">
                <Brain size={20} className="text-ink/80" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-ink">
                  {config.livingPersona.core.name}
                </h3>
                <div className="mt-1 inline-flex items-center gap-2 text-[11px] text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent2" />
                  Living Persona active
                </div>
              </div>
            </div>

            <div className="px-2.5 py-1 rounded-xl bg-surface/60 border border-stroke/70 text-[11px] font-semibold text-ink/70">
              {Math.round((config.livingPersona.confidenceScore || 0) * 100)}%
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-stroke/70">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Response preview
              </span>

              <button
                onClick={onGeneratePreview}
                disabled={isLoadingPreview}
                className={`btn btn-ghost px-3 py-2 ${isLoadingPreview ? 'opacity-70 cursor-not-allowed' : ''}`}
                type="button"
              >
                <span className="inline-flex items-center gap-2 text-[12px] font-semibold">
                  <Wand2 size={14} />
                  {isLoadingPreview ? 'Generating…' : 'Test persona'}
                </span>
              </button>
            </div>

            {personaPreview && (
              <div className="p-4 rounded-2xl bg-surface/55 border border-stroke/70 text-[13px] text-ink/80 leading-relaxed italic">
                “{personaPreview}”
              </div>
            )}
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="p-4 rounded-2xl bg-surface/55 border border-stroke/80 flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-muted" />
          <span className="text-[13px] text-ink/75">Analyzing persona from instructions…</span>
        </div>
      )}

      {/* Instructions */}
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">
          Custom instructions
        </label>

        <div className="relative">
          <textarea
            className="input min-h-[190px] resize-none leading-relaxed"
            value={config.systemInstruction}
            onChange={(e) =>
              setConfig({ ...config, systemInstruction: e.target.value })
            }
            placeholder="Define persona, tone, boundaries, and behavior…"
          />
          <div className="absolute bottom-3 right-3 text-[10px] text-muted">
            {config.systemInstruction.length} chars
          </div>
        </div>

        <p className="mt-2 text-[11px] text-muted leading-relaxed">
          Write detailed guidance (voice, preferences, refusal boundaries, relationship context).
        </p>
      </div>

      {/* Presets */}
      <div className="pt-4 border-t border-stroke/70">
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Saved presets
          </span>
          <button
            onClick={() => setShowSavePreset(!showSavePreset)}
            className="btn btn-ghost px-3 py-2"
            type="button"
          >
            <span className="text-[12px] font-semibold">Save current</span>
          </button>
        </div>

        {showSavePreset && (
          <div className="flex gap-2 mb-4">
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name…"
              className="input"
            />
            <button onClick={onSavePreset} className="btn btn-primary px-5" type="button">
              Save
            </button>
          </div>
        )}

        {isPresetLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-muted" size={24} />
          </div>
        ) : presets.length === 0 ? (
          <p className="text-[13px] text-muted text-center py-8 italic">
            No saved presets yet
          </p>
        ) : (
          <div className="space-y-2">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="p-4 rounded-2xl bg-surface/50 border border-stroke/70 hover:bg-surface/65 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink truncate">
                    {preset.name}
                  </div>
                  <p className="text-[11px] text-muted truncate mt-0.5">
                    {preset.content.substring(0, 80)}…
                  </p>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => setConfig({ ...config, systemInstruction: preset.content })}
                    className="btn btn-ghost px-3 py-2"
                    type="button"
                    title="Apply"
                  >
                    <Check size={16} className="text-accent2" />
                  </button>
                  <button
                    onClick={() => onDeletePreset(preset.id)}
                    className="btn btn-ghost px-3 py-2"
                    type="button"
                    title="Delete"
                  >
                    <Trash2 size={16} className="text-danger" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PersonaSettings;
