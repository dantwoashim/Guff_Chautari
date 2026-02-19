import type { Message } from '../../../types';

export interface IdiolectPatterns {
  sampleCount: number;
  avgSentenceLength: number;
  emojiRate: number;
  topTerms: string[];
  slangTerms: string[];
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'with',
  'this',
  'have',
  'from',
  'your',
  'just',
  'about',
  'what',
  'when',
  'then',
  'there',
  'they',
  'will',
  'into',
  'them',
  'been',
  'could',
]);

const SLANG_TERMS = new Set([
  'lol',
  'lmao',
  'bro',
  'bruh',
  'ngl',
  'fr',
  'idk',
  'imo',
  'wtf',
  'vibe',
  'vibes',
  'kinda',
  'gonna',
  'wanna',
]);

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}]/gu;

const tokenize = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !STOPWORDS.has(token));
};

const splitSentences = (value: string): string[] => {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

const toTopTerms = (tokens: string[], limit: number): string[] => {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([token]) => token);
};

export const learnIdiolectPatterns = (
  messages: ReadonlyArray<Message>,
  options: {
    maxSamples?: number;
    topTermLimit?: number;
  } = {}
): IdiolectPatterns => {
  const maxSamples = options.maxSamples ?? 80;
  const topTermLimit = options.topTermLimit ?? 8;
  const userMessages = messages
    .filter((message) => message.role === 'user' && message.text.trim().length > 0)
    .slice(-maxSamples);

  if (userMessages.length === 0) {
    return {
      sampleCount: 0,
      avgSentenceLength: 0,
      emojiRate: 0,
      topTerms: [],
      slangTerms: [],
    };
  }

  let sentenceWordTotal = 0;
  let sentenceCount = 0;
  let emojiTotal = 0;
  const allTokens: string[] = [];
  const slangHits = new Set<string>();

  for (const message of userMessages) {
    const text = message.text;

    const emojis = text.match(EMOJI_REGEX);
    emojiTotal += emojis?.length ?? 0;

    const sentences = splitSentences(text);
    for (const sentence of sentences) {
      const words = tokenize(sentence);
      sentenceWordTotal += words.length;
      sentenceCount += 1;
      allTokens.push(...words);
      for (const word of words) {
        if (SLANG_TERMS.has(word)) {
          slangHits.add(word);
        }
      }
    }
  }

  const avgSentenceLength = sentenceCount === 0 ? 0 : sentenceWordTotal / sentenceCount;

  return {
    sampleCount: userMessages.length,
    avgSentenceLength: Number(avgSentenceLength.toFixed(2)),
    emojiRate: Number((emojiTotal / userMessages.length).toFixed(3)),
    topTerms: toTopTerms(allTokens, topTermLimit),
    slangTerms: [...slangHits].sort(),
  };
};

export const summarizeIdiolect = (patterns: IdiolectPatterns): string => {
  if (patterns.sampleCount === 0) {
    return 'No user idiolect samples yet.';
  }

  return [
    `samples=${patterns.sampleCount}`,
    `avg_sentence_len=${patterns.avgSentenceLength}`,
    `emoji_rate=${patterns.emojiRate}`,
    `top_terms=${patterns.topTerms.slice(0, 4).join('|') || 'none'}`,
    `slang=${patterns.slangTerms.slice(0, 4).join('|') || 'none'}`,
  ].join(', ');
};
