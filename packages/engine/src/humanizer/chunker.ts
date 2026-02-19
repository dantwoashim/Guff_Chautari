import type { ChunkerOptions } from './types';

const DEFAULT_MIN_CHUNKS = 1;
const DEFAULT_MAX_CHUNKS = 4;
const DEFAULT_TARGET_WORDS = 22;

const toWords = (value: string): string[] => {
  return value
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
};

const splitSentences = (text: string): string[] => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  return sentences.length > 0 ? sentences : [normalized];
};

const splitEvenly = (words: string[], chunkCount: number): string[] => {
  if (words.length === 0) return [];
  const safeChunks = Math.max(1, chunkCount);
  const chunkSize = Math.ceil(words.length / safeChunks);
  const chunks: string[] = [];

  for (let index = 0; index < safeChunks; index += 1) {
    const start = index * chunkSize;
    const end = start + chunkSize;
    const part = words.slice(start, end).join(' ').trim();
    if (part) chunks.push(part);
  }

  return chunks;
};

export const chunkResponseText = (text: string, options: ChunkerOptions = {}): string[] => {
  const minChunks = options.minChunks ?? DEFAULT_MIN_CHUNKS;
  const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const targetWords = options.targetWordsPerChunk ?? DEFAULT_TARGET_WORDS;

  const normalized = text.trim();
  if (!normalized) return [];

  const words = toWords(normalized);
  const suggestedChunks = Math.ceil(words.length / targetWords);
  const desiredChunks = Math.min(maxChunks, Math.max(minChunks, suggestedChunks));

  if (desiredChunks <= 1) {
    return [normalized];
  }

  const sentences = splitSentences(normalized);
  if (sentences.length <= 1) {
    return splitEvenly(words, desiredChunks);
  }

  const chunks: string[] = [];
  let current: string[] = [];

  for (const sentence of sentences) {
    const candidate = [...current, sentence].join(' ').trim();
    const candidateWordCount = toWords(candidate).length;

    if (candidateWordCount > targetWords && current.length > 0) {
      chunks.push(current.join(' ').trim());
      current = [sentence];
    } else {
      current.push(sentence);
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(' ').trim());
  }

  if (chunks.length > maxChunks) {
    return splitEvenly(words, maxChunks);
  }

  if (chunks.length < minChunks) {
    return splitEvenly(words, minChunks);
  }

  return chunks;
};
