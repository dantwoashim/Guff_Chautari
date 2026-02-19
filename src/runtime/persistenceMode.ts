const normalize = (value: string | undefined): string => {
  if (!value) return '';
  return value.trim().toLowerCase();
};

const readMode = (): string => {
  const processValue =
    typeof process !== 'undefined' && process.env
      ? normalize(process.env.VITE_PERSISTENCE_MODE || process.env.PERSISTENCE_MODE)
      : '';

  let viteValue = '';
  try {
    viteValue = normalize((import.meta as { env?: Record<string, string> }).env?.VITE_PERSISTENCE_MODE);
  } catch {
    viteValue = '';
  }

  return viteValue || processValue || 'memory';
};

export const getPersistenceMode = (): 'supabase' | 'memory' => {
  return readMode() === 'supabase' ? 'supabase' : 'memory';
};

export const isSupabasePersistenceEnabled = (): boolean => getPersistenceMode() === 'supabase';
