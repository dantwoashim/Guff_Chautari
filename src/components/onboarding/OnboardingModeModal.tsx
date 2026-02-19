import React from 'react';
import { Brain, Target, Layers } from '../../../components/Icons';

export type OnboardingMode = 'companion' | 'decision_room' | 'builder';

interface OnboardingModeModalProps {
  isOpen: boolean;
  onSelect: (mode: OnboardingMode) => void;
}

interface ModeCard {
  id: OnboardingMode;
  title: string;
  subtitle: string;
  firstStep: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const MODE_CARDS: ModeCard[] = [
  {
    id: 'companion',
    title: 'Companion',
    subtitle: 'Start a persona chat and build long-memory continuity.',
    firstStep: 'Pick a persona and send your first message.',
    icon: Brain,
  },
  {
    id: 'decision_room',
    title: 'Decision Room',
    subtitle: 'Run weighted option analysis with assumptions and scenarios.',
    firstStep: 'Open a decision matrix and score your options.',
    icon: Target,
  },
  {
    id: 'builder',
    title: 'Builder',
    subtitle: 'Import or craft personas before running conversations.',
    firstStep: 'Import a .persona file or create one from scratch.',
    icon: Layers,
  },
];

const OnboardingModeModal: React.FC<OnboardingModeModalProps> = ({ isOpen, onSelect }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-[#2a3942] bg-[#111b21] p-6 text-white shadow-2xl">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-[#e9edef]">Choose your starting mode</h2>
          <p className="mt-1 text-sm text-[#9eb0ba]">
            BYOK is active. Select the path you want to open first. You can switch modes anytime later.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {MODE_CARDS.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                type="button"
                className="rounded-xl border border-[#2a3942] bg-[#202c33] p-4 text-left transition hover:border-[#3c5968] hover:bg-[#24333c]"
                onClick={() => onSelect(mode.id)}
              >
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-[#0f232d] p-2">
                    <Icon size={16} className="text-[#7ed0f3]" />
                  </div>
                  <p className="text-sm font-semibold text-[#e9edef]">{mode.title}</p>
                </div>
                <p className="text-xs text-[#b2c1c9]">{mode.subtitle}</p>
                <p className="mt-3 text-xs text-[#7ed0f3]">First step: {mode.firstStep}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OnboardingModeModal;
