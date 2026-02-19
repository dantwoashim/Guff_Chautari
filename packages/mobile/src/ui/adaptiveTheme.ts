export type MobileThemeMode = 'light' | 'dark';

export interface AdaptiveTheme {
  mode: MobileThemeMode;
  fontScale: number;
  primaryAccent: string;
  surface: string;
  text: string;
}

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const resolveAdaptiveTheme = (payload: {
  mode: MobileThemeMode;
  fontScale: number;
  personaAccent?: string;
}): AdaptiveTheme => {
  const fontScale = clamp(payload.fontScale, 0.85, 1.4);
  if (payload.mode === 'light') {
    return {
      mode: 'light',
      fontScale,
      primaryAccent: payload.personaAccent ?? '#0f766e',
      surface: '#f7fafc',
      text: '#1f2937',
    };
  }

  return {
    mode: 'dark',
    fontScale,
    primaryAccent: payload.personaAccent ?? '#38bdf8',
    surface: '#0b1220',
    text: '#e5e7eb',
  };
};
