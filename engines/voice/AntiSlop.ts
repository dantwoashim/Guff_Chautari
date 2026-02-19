
export const BANNED_PHRASES = [
  'Hyaa', // AI often overuses this for "nepali" vibe
  'hehe', // Generic
  'I feel like',
  'As an AI',
  'I am just a',
  'virtual assistant',
  'language model',
  'tapestry',
  'delve',
  'testament',
  'nuance',
  'symphony',
  'plethora',
  'in conclusion',
  'firstly',
  'moreover',
  'furthermore',
  'it is important to note',
  'remember that'
];

export const BANNED_PATTERNS = [
  /^Absolutely!/,
  /^Certainly!/,
  /^I understand\.\.\./,
  /^Ah,/,
  /^Oh,/,
  /I (can|will|shall) (help|assist|provide)/i,
  /Is there anything else/i
];

export function filterSlop(text: string): string {
  let filtered = text;
  
  // Simple phrase removal
  BANNED_PHRASES.forEach(phrase => {
    const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
    filtered = filtered.replace(regex, '');
  });

  // Pattern checks - if matches, might need drastic rewriting or just trimming
  // For this function, let's just trim the start if it matches a starter pattern
  BANNED_PATTERNS.forEach(pattern => {
    filtered = filtered.replace(pattern, '');
  });

  return filtered.trim();
}
