import type {
  ContextGathererOutput,
  IdentityResolverOutput,
  PipelineStage,
  ResolvedIdentity,
} from '../types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const containsStressSignal = (value: string): boolean => {
  return /(stressed|anxious|overwhelmed|angry|panic|urgent|exhausted|burnout)/i.test(value);
};

const periodIdentity = (period: ContextGathererOutput['context']['time']['period']): ResolvedIdentity['variant'] => {
  switch (period) {
    case 'morning':
      return 'morning_self';
    case 'afternoon':
      return 'afternoon_self';
    case 'evening':
      return 'evening_self';
    default:
      return 'tired_self';
  }
};

const baseEnergy = (period: ContextGathererOutput['context']['time']['period']): number => {
  switch (period) {
    case 'morning':
      return 0.82;
    case 'afternoon':
      return 0.68;
    case 'evening':
      return 0.58;
    default:
      return 0.33;
  }
};

export const createIdentityResolver = (): PipelineStage<ContextGathererOutput, IdentityResolverOutput> => {
  return {
    name: 'identityResolver',
    async run(input: ContextGathererOutput): Promise<IdentityResolverOutput> {
      const reasons: string[] = [];
      let variant = periodIdentity(input.context.time.period);
      let confidence = 0.78;
      let energy = baseEnergy(input.context.time.period);

      const debt = input.context.persona.emotionalDebt ?? 0;
      const stressDetected =
        input.context.relationship.unresolvedTension ||
        containsStressSignal(input.input.userMessage.text) ||
        debt >= 55;

      if (input.context.temporal) {
        energy = clamp(energy * 0.65 + input.context.temporal.energyLevel * 0.35, 0.1, 1);
        reasons.push('Temporal energy snapshot blended into identity state.');

        if (!input.context.temporal.availability.available) {
          energy = clamp(energy - 0.08, 0.1, 1);
          reasons.push(`Current availability mode=${input.context.temporal.availability.mode}.`);
        }
      }

      if (stressDetected) {
        variant = 'stressed_self';
        confidence = 0.9;
        energy = clamp(energy - 0.22, 0.1, 1);
        reasons.push('Stress cues detected from conversation or unresolved tension.');
      } else if (input.context.time.period === 'late_night') {
        variant = 'tired_self';
        confidence = 0.86;
        energy = clamp(energy - 0.1, 0.1, 1);
        reasons.push('Late-night context maps to low-energy identity state.');
      } else {
        reasons.push(`Time-of-day period ${input.context.time.period} selected as dominant identity signal.`);
      }

      if (input.context.relationship.stage === 'intimate' || input.context.relationship.stage === 'close') {
        confidence = clamp(confidence + 0.05, 0, 1);
        reasons.push('Established relationship stage increases identity confidence.');
      }

      return {
        ...input,
        identity: {
          variant,
          confidence,
          energy: clamp(energy, 0, 1),
          reasons,
        },
      };
    },
  };
};

export const identityResolver = createIdentityResolver();
