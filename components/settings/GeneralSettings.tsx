
import React from 'react';
import { Volume2, Mic, Globe } from '../Icons';
import { ChatConfig } from '../../types';

interface GeneralSettingsProps {
  config: ChatConfig;
  setConfig: (config: ChatConfig) => void;
  isDarkMode?: boolean;
}

const VOICES = [
  { id: 'Puck', label: 'Puck', description: 'Playful & energetic' },
  { id: 'Charon', label: 'Charon', description: 'Deep & mysterious' },
  { id: 'Kore', label: 'Kore', description: 'Warm & nurturing' },
  { id: 'Fenrir', label: 'Fenrir', description: 'Bold & powerful' },
  { id: 'Zephyr', label: 'Zephyr', description: 'Light & airy' },
];

const GeneralSettings: React.FC<GeneralSettingsProps> = ({ config, setConfig, isDarkMode }) => {
  return (
    <div className="space-y-6 animate-slide-up">
      {/* Voice Selection */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Volume2 size={16} className="text-accent2" />
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">
            Voice Synthesis
          </h3>
        </div>
        
        <p className="text-[12px] text-muted mb-4">
          Select the vocal persona for text-to-speech responses and real-time conversation.
        </p>

        <div className="grid gap-2">
          {VOICES.map((voice) => {
            const selected = config.ttsVoice === voice.id;
            return (
              <button
                key={voice.id}
                onClick={() => setConfig({ ...config, ttsVoice: voice.id })}
                className={`
                  px-5 py-4 rounded-2xl text-left
                  border transition-colors
                  flex items-center justify-between gap-3
                  ${selected
                    ? 'bg-surface/75 border-accent/35'
                    : 'bg-surface/45 border-stroke/70 hover:bg-surface/65'}
                `}
                type="button"
              >
                <div className="flex items-center gap-3">
                  <div className={`
                    p-2.5 rounded-xl border
                    ${selected ? 'bg-accent/15 border-accent/30' : 'bg-surface/60 border-stroke/70'}
                  `}>
                    <Mic size={16} className={selected ? 'text-accent' : 'text-muted'} />
                  </div>

                  <div>
                    <div className={`text-[14px] font-semibold ${selected ? 'text-ink' : 'text-ink/80'}`}>
                      {voice.label}
                    </div>
                    <div className="text-[11px] text-muted">{voice.description}</div>
                  </div>
                </div>

                {selected && (
                  <div className="w-3 h-3 rounded-full bg-accent border border-stroke/60" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Language (Placeholder for future) */}
      <div className="pt-6 border-t border-stroke/70 opacity-60">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={16} className="text-muted" />
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">
            Language
          </h3>
        </div>
        <div className="p-4 rounded-2xl bg-surface/40 border border-stroke/70 text-[13px] text-muted">
          Automatic Detection (English/Hindi/Nepali supported)
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
