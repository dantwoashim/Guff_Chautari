import type {
  EmotionalLabel,
  EmotionalLayerState,
  EmotionalProcessorOutput,
  IdentityResolverOutput,
  PipelineStage,
} from '../types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const POSITIVE_TERMS = ['love', 'happy', 'great', 'excited', 'thanks', 'grateful', 'proud'];
const NEGATIVE_TERMS = ['angry', 'upset', 'sad', 'hurt', 'stressed', 'anxious', 'panic', 'frustrated'];

const includesAny = (text: string, terms: string[]): boolean => {
  const lowered = text.toLowerCase();
  return terms.some((term) => lowered.includes(term));
};

const pickSurfaceLabel = (valence: number, text: string): EmotionalLabel => {
  if (includesAny(text, ['love', 'care', 'miss you'])) return 'affection';
  if (valence > 0.35) return 'joy';
  if (valence < -0.45) return 'frustration';
  if (valence < -0.2) return 'sadness';
  if (Math.abs(valence) < 0.1) return 'neutral';
  return 'calm';
};

const pickUnconsciousLabel = (attachmentStyle: string | undefined): EmotionalLabel => {
  switch (attachmentStyle) {
    case 'anxious':
      return 'anxiety';
    case 'avoidant':
      return 'calm';
    case 'disorganized':
      return 'anxiety';
    default:
      return 'calm';
  }
};

const makeLayer = (label: EmotionalLabel, intensity: number, rationale: string): EmotionalLayerState => {
  return {
    label,
    intensity: clamp(intensity, 0, 1),
    rationale,
  };
};

const sentimentScore = (text: string): number => {
  const positive = POSITIVE_TERMS.filter((term) => text.toLowerCase().includes(term)).length;
  const negative = NEGATIVE_TERMS.filter((term) => text.toLowerCase().includes(term)).length;
  if (positive === 0 && negative === 0) return 0;
  return clamp((positive - negative) / Math.max(1, positive + negative), -1, 1);
};

export const createEmotionalProcessor = (): PipelineStage<IdentityResolverOutput, EmotionalProcessorOutput> => {
  return {
    name: 'emotionalProcessor',
    async run(input: IdentityResolverOutput): Promise<EmotionalProcessorOutput> {
      const userText = input.input.userMessage.text;
      const debt = input.context.persona.emotionalDebt ?? 0;
      const valence = sentimentScore(userText);
      const relationshipTension = input.context.relationship.unresolvedTension ? 0.15 : 0;

      const surfaceLabel = pickSurfaceLabel(valence, userText);
      const surfaceIntensity = clamp(0.45 + Math.abs(valence) * 0.35 + relationshipTension, 0.2, 0.95);

      const feltIntensity = clamp(surfaceIntensity + debt / 400 + (input.identity.variant === 'stressed_self' ? 0.1 : 0), 0, 1);
      const suppressedIntensity = clamp(0.18 + debt / 120 + relationshipTension, 0, 1);
      const unconsciousIntensity = clamp(0.22 + debt / 220, 0, 1);

      const dischargeRisk = clamp(
        0.1 + debt / 100 + suppressedIntensity * 0.45 + (input.identity.variant === 'stressed_self' ? 0.18 : 0),
        0,
        1
      );

      return {
        ...input,
        emotional: {
          surface: makeLayer(surfaceLabel, surfaceIntensity, 'Visible emotional expression in this turn.'),
          felt: makeLayer(
            surfaceLabel === 'neutral' ? 'calm' : surfaceLabel,
            feltIntensity,
            'Internal affect after accounting for unresolved context and debt.'
          ),
          suppressed: makeLayer(
            debt > 45 ? 'frustration' : 'anxiety',
            suppressedIntensity,
            'Latent emotional pressure accumulated across prior interactions.'
          ),
          unconscious: makeLayer(
            pickUnconsciousLabel(input.context.persona.attachmentStyle),
            unconsciousIntensity,
            'Attachment-level tendencies that bias reaction style.'
          ),
          emotionalDebt: debt,
          dischargeRisk,
        },
      };
    },
  };
};

export const emotionalProcessor = createEmotionalProcessor();
