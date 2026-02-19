import React, { useEffect, useMemo, useState } from 'react';
import { BYOKKeyManager } from '../byok/keyManager';
import { getRuntimeGeminiKey } from '../byok/runtimeKey';

const CONVERSATION_STORAGE_KEY = 'ashim.e2e.smoke.conversation.v1';

const readStoredConversation = (): string[] => {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
};

const writeStoredConversation = (messages: string[]): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(messages));
};

const E2ESmokeHarness: React.FC = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [pipelineState, setPipelineState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [pipelineMessage, setPipelineMessage] = useState('');

  useEffect(() => {
    setMessages(readStoredConversation());
  }, []);

  const messageCountLabel = useMemo(() => `${messages.length} message(s)`, [messages.length]);

  const appendMessage = (text: string) => {
    const normalized = text.trim();
    if (!normalized) return;

    setMessages((previous) => {
      const next = [...previous, normalized];
      writeStoredConversation(next);
      return next;
    });
    setInput('');
  };

  const runPipeline = async () => {
    setPipelineState('idle');
    setPipelineMessage('');

    const runtimeKey = getRuntimeGeminiKey()?.trim();
    const decryptedKey = await BYOKKeyManager.getDecryptedKey('gemini');
    const resolvedKey = runtimeKey || decryptedKey?.trim() || '';

    if (!resolvedKey) {
      setPipelineState('error');
      setPipelineMessage('Missing BYOK key. Add a Gemini API key to run pipeline.');
      return;
    }

    setPipelineState('ok');
    setPipelineMessage('Pipeline ready: BYOK key resolved successfully.');
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10 text-white">
      <section className="rounded-2xl border border-white/15 bg-black/40 p-5">
        <h1 className="text-2xl font-semibold">E2E Smoke Harness</h1>
        <p className="mt-2 text-sm text-white/70">
          Deterministic test surface for persistence and BYOK pipeline key validation.
        </p>
      </section>

      <section className="rounded-2xl border border-white/15 bg-black/40 p-5">
        <h2 className="text-lg font-medium">Conversation Persistence</h2>
        <p className="mt-1 text-sm text-white/70" data-testid="conversation-count">
          {messageCountLabel}
        </p>

        <div className="mt-4 flex gap-2">
          <input
            data-testid="chat-composer-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                appendMessage(input);
              }
            }}
            placeholder="Type a message"
            className="flex-1 rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm"
          />
          <button
            type="button"
            data-testid="chat-send-button"
            onClick={() => appendMessage(input)}
            className="rounded-xl bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25"
          >
            Send
          </button>
        </div>

        <ul data-testid="conversation-list" className="mt-4 space-y-2">
          {messages.map((message, index) => (
            <li
              key={`${message}-${index}`}
              data-testid="conversation-message"
              className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm"
            >
              {message}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-white/15 bg-black/40 p-5">
        <h2 className="text-lg font-medium">Pipeline BYOK Gate</h2>
        <button
          type="button"
          data-testid="pipeline-run-button"
          onClick={() => {
            void runPipeline();
          }}
          className="mt-3 rounded-xl bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25"
        >
          Run Pipeline
        </button>

        {pipelineState === 'error' ? (
          <p data-testid="pipeline-error" className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-100">
            {pipelineMessage}
          </p>
        ) : null}

        {pipelineState === 'ok' ? (
          <p
            data-testid="pipeline-success"
            className="mt-3 rounded-lg bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100"
          >
            {pipelineMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
};

export default E2ESmokeHarness;
