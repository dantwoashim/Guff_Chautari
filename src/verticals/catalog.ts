import { careerVerticalConfig } from './career/config';
import { founderVerticalConfig } from './founder/config';
import { healthVerticalConfig } from './health/config';
import { researchVerticalConfig } from './research/config';
import type { VerticalConfig, VerticalId } from './types';

export const BUILT_IN_VERTICALS: ReadonlyArray<VerticalConfig> = [
  founderVerticalConfig,
  researchVerticalConfig,
  careerVerticalConfig,
  healthVerticalConfig,
];

export const getVerticalConfigById = (verticalId: VerticalId): VerticalConfig | null => {
  return BUILT_IN_VERTICALS.find((config) => config.id === verticalId) ?? null;
};
