
import { useState, useEffect, useMemo } from 'react';
import { 
  temporalThemes, 
  getTemporalTheme, 
  getEmotionalAccent, 
  TemporalTheme,
  EmotionalColorSet
} from '../services/designSystem';

type ThemeKey = 'dawn' | 'day' | 'dusk' | 'night';

interface UseTemporalThemeResult {
  currentTheme: ThemeKey;
  themeColors: TemporalTheme;
  emotionalOverride: EmotionalColorSet | null;
  setEmotionalOverride: (emotion: string | null) => void;
  backgroundGradient: string;
  accentColor: string;
}

/**
 * useTemporalTheme: Manages automatic theme changes based on time of day,
 * handles emotional overrides for accent colors, and respects user preferences.
 */
export function useTemporalTheme(
  emotionalContext?: string,
  userPreference: 'auto' | 'light' | 'dark' = 'auto'
): UseTemporalThemeResult {
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const [manualEmotion, setManualEmotion] = useState<string | null>(null);

  // 1. Update hour every minute to check for theme changes
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      if (now.getHours() !== currentHour) {
        setCurrentHour(now.getHours());
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [currentHour]);

  // 2. Resolve the active theme based on time and user preference
  const themeKey = useMemo((): ThemeKey => {
    if (userPreference === 'dark') return 'night';
    if (userPreference === 'light') return 'day';
    
    // Auto detection
    if (currentHour >= 5 && currentHour < 8) return 'dawn';
    if (currentHour >= 8 && currentHour < 17) return 'day';
    if (currentHour >= 17 && currentHour < 20) return 'dusk';
    return 'night';
  }, [currentHour, userPreference]);

  const themeColors = temporalThemes[themeKey];

  // 3. Resolve emotional override
  const activeEmotion = manualEmotion || emotionalContext;
  const emotionalOverride = useMemo(() => 
    activeEmotion ? getEmotionalAccent(activeEmotion) : null
  , [activeEmotion]);

  // 4. Apply variables to :root for global CSS access
  useEffect(() => {
    const root = document.documentElement;
    
    // Core Temporal Vars
    root.style.setProperty('--theme-gradient', themeColors.gradient);
    root.style.setProperty('--theme-primary', themeColors.primary);
    root.style.setProperty('--theme-secondary', themeColors.secondary);
    root.style.setProperty('--theme-text', themeColors.text);

    // Accent Vars (Emotional or Default)
    const accent = emotionalOverride?.accent || themeColors.primary;
    const glow = emotionalOverride?.glow || 'rgba(0,0,0,0)';
    
    root.style.setProperty('--accent-color', accent);
    root.style.setProperty('--accent-glow', glow);

    // Sync dark mode class
    if (themeKey === 'night' || themeKey === 'dusk' || userPreference === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [themeColors, emotionalOverride, themeKey, userPreference]);

  return {
    currentTheme: themeKey,
    themeColors,
    emotionalOverride,
    setEmotionalOverride: setManualEmotion,
    backgroundGradient: themeColors.gradient,
    accentColor: emotionalOverride?.accent || themeColors.primary
  };
}
