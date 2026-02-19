
import { CSSProperties } from 'react';

/**
 * Temporal Themes: Dynamic UI adaptation based on the time of day.
 */
export const temporalThemes = {
  dawn: {
    gradient: 'linear-gradient(135deg, #ffecd2, #fcb69f)',
    primary: '#ff9a56',
    secondary: '#ffcba4',
    text: '#5d4037',
    hours: [5, 8]  // 5 AM - 8 AM
  },
  day: {
    gradient: 'linear-gradient(135deg, #f5f7fa, #c3cfe2)',
    primary: '#667eea',
    secondary: '#a8b5e3',
    text: '#2d3748',
    hours: [8, 17]  // 8 AM - 5 PM
  },
  dusk: {
    gradient: 'linear-gradient(135deg, #667eea, #764ba2)',
    primary: '#9f7aea',
    secondary: '#b794f6',
    text: '#f7fafc',
    hours: [17, 20]  // 5 PM - 8 PM
  },
  night: {
    gradient: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    primary: '#a78bfa',
    secondary: '#7c3aed',
    text: '#e2e8f0',
    hours: [20, 5]  // 8 PM - 5 AM
  }
};

export type TemporalTheme = typeof temporalThemes.day;

/**
 * Emotional Color Injection: UI shifts to reflect inferred user/model sentiment.
 */
export const emotionalColors = {
  excitement: { accent: '#f59e0b', glow: 'rgba(245, 158, 11, 0.3)' },
  calm: { accent: '#10b981', glow: 'rgba(16, 185, 129, 0.3)' },
  focus: { accent: '#3b82f6', glow: 'rgba(59, 130, 246, 0.3)' },
  creativity: { accent: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.3)' },
  empathy: { accent: '#ec4899', glow: 'rgba(236, 72, 153, 0.3)' },
  stress: { accent: '#6b7280', glow: 'rgba(107, 114, 128, 0.2)' }
};

export type EmotionalColorSet = typeof emotionalColors.calm;

/**
 * Depth System: Managing layering and optical depth.
 */
export const depthLayers = {
  background: { z: 0, blur: 0, opacity: 1 },
  surface: { z: 1, blur: 0, opacity: 1 },
  elevated: { z: 2, blur: 8, opacity: 0.95 },
  floating: { z: 3, blur: 12, opacity: 0.9 },
  overlay: { z: 4, blur: 16, opacity: 0.85 }
};

export type DepthLayerKey = keyof typeof depthLayers;

/**
 * Animation Presets: Fluent UI motion for enhanced UX.
 */
export const animations = {
  breathe: 'breathe 4s ease-in-out infinite',
  float: 'float 6s ease-in-out infinite',
  pulse: 'pulse 2s ease-in-out infinite',
  shimmer: 'shimmer 2s linear infinite',
  fadeIn: 'fadeIn 0.3s ease-out',
  slideUp: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  scaleIn: 'scaleIn 0.2s ease-out'
};

/**
 * Component Variants: Common tailwind classes for standard elements.
 */
export const cardVariants = {
  default: 'rounded-2xl border backdrop-blur-sm transition-all duration-300',
  glass: 'rounded-2xl border backdrop-blur-md bg-white/10 dark:bg-black/10',
  solid: 'rounded-2xl border bg-white dark:bg-onyx-900',
  floating: 'rounded-2xl border backdrop-blur-lg shadow-2xl scale-100 hover:scale-[1.02]'
};

// --- Helper Functions ---

/**
 * Determines the current theme based on the hour of the day.
 */
export function getTemporalTheme(hour: number): TemporalTheme {
  if (hour >= 5 && hour < 8) return temporalThemes.dawn;
  if (hour >= 8 && hour < 17) return temporalThemes.day;
  if (hour >= 17 && hour < 20) return temporalThemes.dusk;
  return temporalThemes.night;
}

/**
 * Returns the color set for a specific emotion.
 */
export function getEmotionalAccent(emotion: string): EmotionalColorSet {
  const key = emotion.toLowerCase() as keyof typeof emotionalColors;
  return emotionalColors[key] || emotionalColors.calm;
}

/**
 * Maps depth layer keys to CSS style objects.
 */
export function getDepthStyles(layer: DepthLayerKey): CSSProperties {
  const config = depthLayers[layer];
  return {
    zIndex: config.z,
    backdropFilter: config.blur > 0 ? `blur(${config.blur}px)` : 'none',
    opacity: config.opacity,
  };
}
