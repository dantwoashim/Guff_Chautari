import type { LivingPersona } from '../../types';

export type PersonaSpeechTone =
  | 'warm'
  | 'neutral'
  | 'calm'
  | 'energetic'
  | 'serious'
  | 'empathetic'
  | 'urgent';

export interface PersonaTtsConfig {
  voiceName?: string;
  speakingRate: number;
  pitch: number;
  volume: number;
  pauseMs: number;
  emotionalTone: PersonaSpeechTone;
  geminiAffect: {
    style: PersonaSpeechTone;
    speakingRate: number;
    pitchSemitones: number;
    pauseMs: number;
  };
}

export interface PersonaSpeechResult {
  ok: boolean;
  engine: 'web_speech' | 'none';
  reason?: string;
  config: PersonaTtsConfig;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const levelToScalar = (value: string | undefined): number => {
  if (!value) return 0.5;
  const normalized = value.toLowerCase();
  if (normalized.includes('low') || normalized.includes('slow')) return 0.25;
  if (normalized.includes('high') || normalized.includes('fast')) return 0.85;
  return 0.5;
};

const normalizeTone = (value: string | undefined): PersonaSpeechTone | null => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes('warm')) return 'warm';
  if (normalized.includes('calm')) return 'calm';
  if (normalized.includes('empat')) return 'empathetic';
  if (normalized.includes('urgent')) return 'urgent';
  if (normalized.includes('energ') || normalized.includes('fast')) return 'energetic';
  if (normalized.includes('serious') || normalized.includes('direct')) return 'serious';
  if (normalized.includes('neutral')) return 'neutral';
  return null;
};

const readCommunicationTone = (persona: LivingPersona | undefined): string | undefined => {
  if (!persona || !persona.communication || typeof persona.communication !== 'object') {
    return undefined;
  }
  const candidate = persona.communication as Record<string, unknown>;
  const tone = candidate.tone;
  return typeof tone === 'string' ? tone : undefined;
};

export const inferPersonaSpeechTone = (
  persona: LivingPersona | undefined,
  overrideTone?: PersonaSpeechTone
): PersonaSpeechTone => {
  if (overrideTone) return overrideTone;

  const communicationTone = normalizeTone(readCommunicationTone(persona));
  if (communicationTone) return communicationTone;

  const baselineMood = normalizeTone(persona?.core?.emotionalBaseline?.defaultMood);
  if (baselineMood) return baselineMood;

  const warmthLevel = persona?.core?.emotionalBaseline?.warmthLevel ?? 0.5;
  if (warmthLevel >= 0.7) return 'warm';

  const energy = levelToScalar(persona?.core?.emotionalBaseline?.energyLevel);
  if (energy >= 0.72) return 'energetic';

  return 'neutral';
};

export const createPersonaTtsConfig = (payload: {
  persona?: LivingPersona;
  voiceName?: string;
  emotionalTone?: PersonaSpeechTone;
}): PersonaTtsConfig => {
  const tone = inferPersonaSpeechTone(payload.persona, payload.emotionalTone);
  const warmth = clamp(payload.persona?.core?.emotionalBaseline?.warmthLevel ?? 0.5, 0, 1);
  const directness = clamp(payload.persona?.core?.emotionalBaseline?.directnessLevel ?? 0.5, 0, 1);
  const energy = levelToScalar(payload.persona?.core?.emotionalBaseline?.energyLevel);

  let speakingRate = 1 + (energy - 0.5) * 0.42 + (directness - 0.5) * 0.12 - (warmth - 0.5) * 0.2;
  let pitch = 1 + (energy - 0.5) * 0.18 + (directness - 0.5) * 0.08 - (warmth - 0.5) * 0.22;
  let pauseMs = Math.round(240 - energy * 95 + warmth * 80 - directness * 50);

  if (tone === 'warm' || tone === 'empathetic') {
    speakingRate -= 0.12;
    pitch -= 0.1;
    pauseMs += 95;
  } else if (tone === 'calm') {
    speakingRate -= 0.18;
    pitch -= 0.06;
    pauseMs += 110;
  } else if (tone === 'energetic') {
    speakingRate += 0.18;
    pitch += 0.1;
    pauseMs -= 80;
  } else if (tone === 'urgent') {
    speakingRate += 0.22;
    pitch += 0.05;
    pauseMs -= 110;
  } else if (tone === 'serious') {
    speakingRate += 0.04;
    pitch -= 0.08;
    pauseMs += 35;
  }

  speakingRate = Number(clamp(speakingRate, 0.65, 1.6).toFixed(3));
  pitch = Number(clamp(pitch, 0.6, 1.4).toFixed(3));
  pauseMs = Math.round(clamp(pauseMs, 90, 520));

  return {
    voiceName: payload.voiceName,
    speakingRate,
    pitch,
    volume: 1,
    pauseMs,
    emotionalTone: tone,
    geminiAffect: {
      style: tone,
      speakingRate,
      pitchSemitones: Number(((pitch - 1) * 12).toFixed(2)),
      pauseMs,
    },
  };
};

let activeUtterance: SpeechSynthesisUtterance | null = null;

export const cancelPersonaSpeech = (): void => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  activeUtterance = null;
};

const pickVoice = (voiceName: string | undefined): SpeechSynthesisVoice | null => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  if (!voiceName) return voices[0] ?? null;

  const exact = voices.find((voice) => voice.name === voiceName);
  if (exact) return exact;

  const lowered = voiceName.toLowerCase();
  return voices.find((voice) => voice.name.toLowerCase().includes(lowered)) ?? voices[0] ?? null;
};

export const speakPersonaText = async (payload: {
  text: string;
  persona?: LivingPersona;
  voiceName?: string;
  emotionalTone?: PersonaSpeechTone;
}): Promise<PersonaSpeechResult> => {
  const config = createPersonaTtsConfig({
    persona: payload.persona,
    voiceName: payload.voiceName,
    emotionalTone: payload.emotionalTone,
  });
  const text = payload.text.trim();
  if (!text) {
    return {
      ok: false,
      engine: 'none',
      reason: 'empty_text',
      config,
    };
  }

  if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    return {
      ok: false,
      engine: 'none',
      reason: 'speech_synthesis_unavailable',
      config,
    };
  }

  cancelPersonaSpeech();

  await new Promise<void>((resolve) => {
    const trigger = () => resolve();
    window.speechSynthesis.addEventListener('voiceschanged', trigger, { once: true });
    setTimeout(resolve, 20);
  });

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = config.speakingRate;
  utterance.pitch = config.pitch;
  utterance.volume = config.volume;
  utterance.voice = pickVoice(config.voiceName);
  activeUtterance = utterance;

  await new Promise<void>((resolve, reject) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error('Speech synthesis failed.'));
    window.speechSynthesis.speak(utterance);
  }).finally(() => {
    if (activeUtterance === utterance) {
      activeUtterance = null;
    }
  });

  return {
    ok: true,
    engine: 'web_speech',
    config,
  };
};
