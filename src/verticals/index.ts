export * from './types';
export * from './benchmarks';
export * from './runtime';
export * from './catalog';
export * from './validation';
export * from './founder/config';
export * from './research/config';
export * from './research/critiqueEngine';
export * from './career/config';
export * from './health/config';
export * from './health/safety';
export * from './safetyBenchmarks';
export * from './customRegistry';

import { BUILT_IN_VERTICALS } from './catalog';
import { verticalRuntime } from './runtime';

verticalRuntime.registerMany(BUILT_IN_VERTICALS);
