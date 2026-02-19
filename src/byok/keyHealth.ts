import { BYOK_PROVIDER_LABELS, type BYOKProvider, type KeyHealth, type KeyValidationResult } from './types';

const GEMINI_MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_MODELS_ENDPOINT = 'https://api.openai.com/v1/models';
const ANTHROPIC_MODELS_ENDPOINT = 'https://api.anthropic.com/v1/models';
const TOGETHER_MODELS_ENDPOINT = 'https://api.together.xyz/v1/models';

const parseErrorMessage = async (response: Response, fallbackPrefix: string): Promise<string> => {
  try {
    const body = await response.json();
    const message = body?.error?.message ?? body?.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  } catch {
    // Ignore parse errors and use fallback below.
  }
  return `${fallbackPrefix} failed with status ${response.status}.`;
};

const emptyKeyResult = (provider: BYOKProvider): KeyValidationResult => {
  return {
    ok: false,
    status: 'invalid',
    errorCode: 'empty_key',
    errorMessage: 'API key is required.',
    diagnosticSteps: [`Paste a valid ${BYOK_PROVIDER_LABELS[provider]} API key.`],
  };
};

const success = (): KeyValidationResult => ({
  ok: true,
  status: 'healthy',
});

const warning = (message: string, code: string, steps: string[]): KeyValidationResult => ({
  ok: true,
  status: 'warning',
  errorCode: code,
  errorMessage: message,
  diagnosticSteps: steps,
});

const invalid = (message: string, code: string, steps: string[]): KeyValidationResult => ({
  ok: false,
  status: 'invalid',
  errorCode: code,
  errorMessage: message,
  diagnosticSteps: steps,
});

const checkHttpValidation = async (payload: {
  endpoint: string;
  provider: BYOKProvider;
  headers: Record<string, string>;
  formatStep: string;
  rotateStep: string;
}): Promise<KeyValidationResult> => {
  try {
    const response = await fetch(payload.endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...payload.headers,
      },
    });

    if (response.ok) {
      return success();
    }

    const message = await parseErrorMessage(response, BYOK_PROVIDER_LABELS[payload.provider]);

    if (response.status === 400) {
      return invalid(message, 'invalid_format', [payload.formatStep]);
    }

    if (response.status === 401 || response.status === 403) {
      return invalid(message, 'auth_failed', [payload.rotateStep]);
    }

    if (response.status === 429) {
      return warning(message, 'quota_exceeded', [
        'Wait for rate-limit reset or switch to another provider key.',
      ]);
    }

    return warning(message, 'provider_unavailable', ['Retry key validation in a minute.']);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error while validating key.';
    return warning(message, 'network_error', ['Check internet connectivity and retry.']);
  }
};

const validateGeminiKey = async (apiKey: string): Promise<KeyValidationResult> => {
  const trimmed = apiKey.trim();
  if (!trimmed) return emptyKeyResult('gemini');

  return checkHttpValidation({
    endpoint: `${GEMINI_MODELS_ENDPOINT}?key=${encodeURIComponent(trimmed)}`,
    provider: 'gemini',
    headers: {},
    formatStep: 'Double-check the Gemini key format and remove accidental spaces.',
    rotateStep: 'Generate a fresh key in Google AI Studio and rotate it in Ashim.',
  });
};

const validateOpenAIKey = async (apiKey: string): Promise<KeyValidationResult> => {
  const trimmed = apiKey.trim();
  if (!trimmed) return emptyKeyResult('openai');

  return checkHttpValidation({
    endpoint: OPENAI_MODELS_ENDPOINT,
    provider: 'openai',
    headers: {
      Authorization: `Bearer ${trimmed}`,
    },
    formatStep: 'Check the OpenAI key format (usually starts with sk-).',
    rotateStep: 'Rotate the key in OpenAI dashboard and update it here.',
  });
};

const validateAnthropicKey = async (apiKey: string): Promise<KeyValidationResult> => {
  const trimmed = apiKey.trim();
  if (!trimmed) return emptyKeyResult('anthropic');

  return checkHttpValidation({
    endpoint: ANTHROPIC_MODELS_ENDPOINT,
    provider: 'anthropic',
    headers: {
      'x-api-key': trimmed,
      'anthropic-version': '2023-06-01',
    },
    formatStep: 'Check the Anthropic key format and remove extra whitespace.',
    rotateStep: 'Rotate the key in Anthropic console and update it here.',
  });
};

const validateTogetherKey = async (apiKey: string): Promise<KeyValidationResult> => {
  const trimmed = apiKey.trim();
  if (!trimmed) return emptyKeyResult('together');

  return checkHttpValidation({
    endpoint: TOGETHER_MODELS_ENDPOINT,
    provider: 'together',
    headers: {
      Authorization: `Bearer ${trimmed}`,
    },
    formatStep: 'Check Together API key format and remove extra whitespace.',
    rotateStep: 'Rotate the Together key and update it in BYOK settings.',
  });
};

const validateOllamaKey = async (apiKey: string): Promise<KeyValidationResult> => {
  const trimmed = apiKey.trim();
  if (!trimmed) return emptyKeyResult('ollama');

  const looksLikeUrl = /^https?:\/\//i.test(trimmed);
  if (!looksLikeUrl) {
    return {
      ok: true,
      status: 'healthy',
      diagnosticSteps: [
        'Ollama uses local endpoint configuration; store your endpoint token/alias as needed.',
      ],
    };
  }

  try {
    const base = trimmed.replace(/\/+$/, '');
    const response = await fetch(`${base}/api/tags`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      return success();
    }

    if (response.status === 401 || response.status === 403) {
      const message = await parseErrorMessage(response, 'Ollama endpoint');
      return invalid(message, 'auth_failed', [
        'Verify endpoint auth proxy settings or remove stale credentials.',
      ]);
    }

    const message = await parseErrorMessage(response, 'Ollama endpoint');
    return warning(message, 'provider_unavailable', [
      'Ensure local Ollama is running and endpoint is reachable from this device.',
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reach Ollama endpoint.';
    return warning(message, 'network_error', [
      'Start Ollama locally and verify endpoint URL, then retry validation.',
    ]);
  }
};

export const validateProviderKey = async (
  provider: BYOKProvider,
  apiKey: string
): Promise<KeyValidationResult> => {
  switch (provider) {
    case 'gemini':
      return validateGeminiKey(apiKey);
    case 'openai':
      return validateOpenAIKey(apiKey);
    case 'anthropic':
      return validateAnthropicKey(apiKey);
    case 'together':
      return validateTogetherKey(apiKey);
    case 'ollama':
      return validateOllamaKey(apiKey);
    default:
      return warning('Provider validator not found.', 'provider_unavailable', [
        'Retry with a supported provider.',
      ]);
  }
};

export const checkProviderKeyHealth = async (
  provider: BYOKProvider,
  apiKey: string
): Promise<KeyHealth> => {
  const result = await validateProviderKey(provider, apiKey);
  return {
    status: result.status,
    lastCheck: Date.now(),
    errorMessage: result.errorMessage,
    diagnosticSteps: result.diagnosticSteps,
    quotaRemaining: result.quotaRemaining,
  };
};

export { validateGeminiKey };

export const checkGeminiKeyHealth = async (apiKey: string): Promise<KeyHealth> => {
  return checkProviderKeyHealth('gemini', apiKey);
};
