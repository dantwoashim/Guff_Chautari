import { getRuntimeGeminiKey } from '../src/byok/runtimeKey';

const readImportMetaEnv = (): string => {
  try {
    const value = (import.meta as { env?: Record<string, string | undefined> }).env
      ?.VITE_GEMINI_API_KEY;
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
};

const readProcessEnv = (): string => {
  if (typeof process === 'undefined' || !process.env) {
    return '';
  }
  const candidate =
    process.env.VITE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.API_KEY ?? '';
  return candidate.trim();
};

export const resolveGeminiApiKey = (): string => {
  const runtimeKey = getRuntimeGeminiKey()?.trim();
  if (runtimeKey) {
    return runtimeKey;
  }

  const importMetaEnv = readImportMetaEnv();
  if (importMetaEnv) {
    return importMetaEnv;
  }

  return readProcessEnv();
};
