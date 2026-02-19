import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addAbbreviations,
  addTypo,
  addImperfections,
  addSelfCorrection,
  addThoughtContinuation,
  splitAtNaturalPoint,
} from '../imperfectionEngine';

describe('imperfectionEngine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns original text when imperfections are disabled', () => {
    const input = 'This should remain unchanged.';
    expect(addImperfections(input)).toBe(input);
  });

  it('adds self-correction when the correction path is triggered', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const messages = ['the hello'];
    const result = addSelfCorrection(messages);

    expect(result.length).toBe(2);
    expect(result[0]).not.toBe('the hello');
    expect(result[1]).toBe('*the');
  });

  it('splits long text into continuation messages', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const text =
      'I was thinking about your idea, but I also want to check another angle. so maybe we should test both.';
    const parts = addThoughtContinuation(text);

    expect(parts.length).toBeGreaterThan(1);
  });

  it('uses common typo dictionary when available', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(addTypo('the plan')).toBe('teh plan');
  });

  it('applies random typo strategy for non-dictionary words', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.6) // typo type 2 (missing letter)
      .mockReturnValueOnce(0) // word index
      .mockReturnValueOnce(0); // char index

    expect(addTypo('planet')).toBe('lanet');
  });

  it('abbreviates when user vocabulary permits it', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // count => 1
      .mockReturnValueOnce(0); // abbreviation index => "you" -> "u"

    const result = addAbbreviations('you are amazing', {
      observedUserAbbreviations: new Set(['u']),
    });

    expect(result).toContain('u are amazing');
  });

  it('does not abbreviate in technical context', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    const result = addAbbreviations('you are amazing', {
      isTechnical: true,
      observedUserAbbreviations: new Set(['u']),
    });

    expect(result).toBe('you are amazing');
  });

  it('allows universally accepted abbreviations even without observed set match', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // count => 1
      .mockReturnValueOnce(8 / 19); // index for "going to" -> "gonna"

    const result = addAbbreviations('I am going to sleep', {
      observedUserAbbreviations: new Set(['idk']),
    });

    expect(result).toContain('I am gonna sleep');
  });

  it('returns original continuation when text is short or chance fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(addThoughtContinuation('short text')).toEqual(['short text']);
  });

  it('splits and merges long thought parts naturally', () => {
    const parts = splitAtNaturalPoint(
      'one, but two. three. four. five.'
    );
    expect(parts.length).toBeGreaterThan(0);
  });
});
