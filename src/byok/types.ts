export const BYOK_PROVIDERS = ['gemini', 'openai', 'anthropic', 'together', 'ollama'] as const;

export type BYOKProvider = (typeof BYOK_PROVIDERS)[number];

export const BYOK_PROVIDER_LABELS: Record<BYOKProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  together: 'Together AI',
  ollama: 'Ollama',
};

export type KeyHealthStatus = 'healthy' | 'warning' | 'invalid' | 'missing' | 'unknown';

export interface EncryptedKeyBlob {
  encryptedData: string;
  iv: string;
  salt: string;
  fingerprint: string;
  provider: BYOKProvider;
  createdAt: number;
  lastValidated: number;
}

export interface StoredKeyMap {
  [provider: string]: EncryptedKeyBlob | undefined;
}

export interface KeyValidationResult {
  ok: boolean;
  status: KeyHealthStatus;
  errorCode?: string;
  errorMessage?: string;
  diagnosticSteps?: string[];
  quotaRemaining?: number;
}

export interface KeyHealth {
  status: KeyHealthStatus;
  lastCheck: number;
  errorMessage?: string;
  diagnosticSteps?: string[];
  quotaRemaining?: number;
}
