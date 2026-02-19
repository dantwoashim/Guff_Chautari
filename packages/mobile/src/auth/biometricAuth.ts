export interface BiometricPromptResult {
  ok: boolean;
  reason?: string;
}

export interface BiometricAuthAdapter {
  prompt: (reason: string) => Promise<BiometricPromptResult>;
}

export const createBiometricAuthAdapter = (payload: {
  isAvailable: boolean;
  allowByDefault?: boolean;
}): BiometricAuthAdapter => {
  return {
    prompt: async (reason) => {
      if (!payload.isAvailable) {
        return {
          ok: false,
          reason: 'biometric_unavailable',
        };
      }

      if (payload.allowByDefault === false) {
        return {
          ok: false,
          reason: `denied:${reason}`,
        };
      }

      return {
        ok: true,
      };
    },
  };
};
