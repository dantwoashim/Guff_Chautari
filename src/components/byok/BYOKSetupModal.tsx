import React, { useMemo, useState } from 'react';
import { BYOKProvider } from '../../byok/types';

interface SaveResult {
  ok: boolean;
  errorMessage?: string;
}

interface BYOKSetupModalProps {
  isOpen: boolean;
  isSaving: boolean;
  title?: string;
  canClose?: boolean;
  onClose?: () => void;
  onSubmit: (provider: BYOKProvider, apiKey: string) => Promise<SaveResult>;
}

const PROVIDER: BYOKProvider = 'gemini';

const BYOKSetupModal: React.FC<BYOKSetupModalProps> = ({
  isOpen,
  isSaving,
  title = 'Set Up BYOK',
  canClose = true,
  onClose,
  onSubmit,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmedKey = useMemo(() => apiKey.trim(), [apiKey]);
  const canSubmit = trimmedKey.length > 0 && !isSaving;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = await onSubmit(PROVIDER, trimmedKey);
    if (!result.ok) {
      setError(result.errorMessage ?? 'Failed to save key.');
      return;
    }

    setApiKey('');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111b21] p-6 text-white shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          {canClose && onClose && (
            <button
              type="button"
              className="rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
        <p className="mt-2 text-sm text-[#aebac1]">
          Paste your Gemini API key to activate chat generation.
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-[#aebac1]">Provider</label>
            <select
              className="w-full rounded-lg border border-white/10 bg-[#202c33] px-3 py-2 text-sm text-white"
              value={PROVIDER}
              disabled
            >
              <option value="gemini">Google Gemini</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-[#aebac1]">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="w-full rounded-lg border border-white/10 bg-[#202c33] px-3 py-2 text-sm text-white outline-none focus:border-[#00a884]"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-2 text-xs text-[#8696a0]">
              Get your key from{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[#00a884] underline"
              >
                Google AI Studio
              </a>
              .
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-[#00a884] px-4 py-2 text-sm font-semibold text-[#0d1714] transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Validating key...' : 'Validate and Save Key'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default BYOKSetupModal;
