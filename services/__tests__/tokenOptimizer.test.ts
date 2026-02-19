import { describe, expect, it } from 'vitest';
import type { Message } from '../../types';
import { getCachedIfAvailable, optimizeRequest, shouldCallAPI } from '../tokenOptimizer';

const mediaAttachment = {
  id: 'a1',
  type: 'image' as const,
  mimeType: 'image/png',
  url: 'https://example.com/a.png',
};

describe('tokenOptimizer cache/media behavior', () => {
  it('bypasses cache when latest matching user message includes media', () => {
    const messages: Message[] = [
      {
        id: 'm1',
        role: 'user',
        text: 'hi',
        timestamp: Date.now(),
        attachments: [mediaAttachment],
      },
    ];

    const optimized = optimizeRequest('hi', messages, null, {
      enableCompression: false,
      enableSmartContext: false,
      enableLengthControl: false,
    });

    expect(optimized.shouldSkipAPI).toBe(false);
  });

  it('still caches small-text patterns when media is absent', () => {
    const messages: Message[] = [
      {
        id: 'm1',
        role: 'user',
        text: 'hi',
        timestamp: Date.now(),
      },
    ];

    const optimized = optimizeRequest('hi', messages, null, {
      enableCompression: false,
      enableSmartContext: false,
      enableLengthControl: false,
    });

    expect(optimized.shouldSkipAPI).toBe(true);
    expect(optimized.cachedResponse).toBeTruthy();
  });

  it('supports explicit media override for pre-message callsites', () => {
    const optimized = optimizeRequest('hi', [], null, {
      requestHasMedia: true,
      enableCompression: false,
      enableSmartContext: false,
      enableLengthControl: false,
    });

    expect(optimized.shouldSkipAPI).toBe(false);
  });

  it('exposes media-aware cache helper behavior', () => {
    expect(shouldCallAPI('hi', 'casual', true)).toBe(true);
    expect(getCachedIfAvailable('hi', 'casual', true)).toBeNull();
    expect(shouldCallAPI('hi', 'casual', false)).toBe(false);
    expect(getCachedIfAvailable('hi', 'casual', false)).toBeTruthy();
  });
});
