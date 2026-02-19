const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const simulateReadReceiptDelay = (textLength: number, emotionalComplexity: number): number => {
  const safeComplexity = clamp(emotionalComplexity, 0, 1);
  const baseline = 450 + Math.min(3200, textLength * 12);
  const complexityLift = safeComplexity * 1200;
  return Math.round(clamp(baseline + complexityLift, 400, 8500));
};
