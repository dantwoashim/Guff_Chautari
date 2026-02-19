import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateStage,
  detectInsideJoke,
  detectConflict,
  generateCareAction,
  getConflictResolutionPhrases,
  getMoodCarryoverModifier,
  initializeRelationshipState,
  shouldUseInsideJoke,
  updateTrust,
} from '../relationshipDynamics';

describe('relationshipDynamics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes relationship state with safe defaults', () => {
    const state = initializeRelationshipState('persona-1', 'partner-1');
    expect(state.stage).toBe('new');
    expect(state.trustScore).toBe(0.3);
    expect(state.partnerKnowledge.unansweredQuestions.length).toBeGreaterThan(0);
  });

  it('advances stage when trust and history increase', () => {
    const state = initializeRelationshipState('persona-1', 'partner-1');
    state.trustScore = 0.7;
    state.daysTogether = 20;
    state.messageCount = 250;
    state.sharedMemories.push({
      id: 'm-1',
      description: 'shared vulnerable moment',
      sentiment: 'positive',
      createdAt: new Date(),
      timesReferenced: 1,
      tags: ['vulnerable'],
    });

    expect(calculateStage(state)).toBe('comfortable');
  });

  it('reaches deep/intimate stages with stronger metrics', () => {
    const deepState = initializeRelationshipState('persona-d', 'partner-d');
    deepState.trustScore = 0.8;
    deepState.daysTogether = 45;
    deepState.sharedMemories.push(
      {
        id: 'v1',
        description: 'moment 1',
        sentiment: 'positive',
        createdAt: new Date(),
        timesReferenced: 1,
        tags: ['vulnerable'],
      },
      {
        id: 'v2',
        description: 'moment 2',
        sentiment: 'positive',
        createdAt: new Date(),
        timesReferenced: 1,
        tags: ['vulnerable'],
      },
      {
        id: 'v3',
        description: 'moment 3',
        sentiment: 'positive',
        createdAt: new Date(),
        timesReferenced: 1,
        tags: ['vulnerable'],
      }
    );
    expect(calculateStage(deepState)).toBe('deep');

    const intimateState = initializeRelationshipState('persona-i', 'partner-i');
    intimateState.trustScore = 0.95;
    intimateState.daysTogether = 90;
    intimateState.conflictHistory.push({
      id: 'c1',
      cause: 'misunderstanding',
      severity: 'minor',
      status: 'resolved',
      startDate: new Date(),
      resolvedDate: new Date(),
      affectsConversation: false,
    });
    intimateState.sharedMemories = Array.from({ length: 6 }).map((_, i) => ({
      id: `m-${i}`,
      description: `memory-${i}`,
      sentiment: 'positive',
      createdAt: new Date(),
      timesReferenced: 1,
      tags: ['vulnerable'],
    }));
    expect(calculateStage(intimateState)).toBe('intimate');
  });

  it('updates trust with interaction deltas and clamps range', () => {
    const state = initializeRelationshipState('persona-1', 'partner-1');
    const raised = updateTrust(state, { type: 'supportive' });
    expect(raised).toBeGreaterThan(state.trustScore);

    state.trustScore = 0.05;
    const lowered = updateTrust(state, { type: 'broke_trust' });
    expect(lowered).toBe(0);
  });

  it('detects explicit conflict phrases', () => {
    const state = initializeRelationshipState('persona-1', 'partner-1');
    const conflict = detectConflict('hello', 'you ignored me yesterday', state);
    expect(conflict).not.toBeNull();
    expect(conflict?.status).toBe('active');
  });

  it('creates and uses inside jokes when triggers and probability align', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const joke = detectInsideJoke('that is so us', 'exactly', []);
    expect(joke).not.toBeNull();
    expect(joke?.origin).toContain('so us');

    const state = initializeRelationshipState('persona-j', 'partner-j');
    state.stage = 'comfortable';
    state.insideJokes.push({
      id: 'j1',
      phrase: 'great minds',
      origin: 'test',
      createdAt: new Date(),
      usageCount: 2,
    });
    const usage = shouldUseInsideJoke(state, 'banter');
    expect(usage.should).toBe(true);
    expect(usage.joke?.phrase).toBe('great minds');
  });

  it('returns phase-specific conflict resolution phrases', () => {
    const phrases = getConflictResolutionPhrases({
      id: 'c1',
      cause: 'neglect',
      severity: 'minor',
      status: 'resolved',
      startDate: new Date(),
      affectsConversation: false,
    });
    expect(phrases.some((p) => p.includes("we're good"))).toBe(true);
  });

  it('returns carryover modifier and important-date care action', () => {
    const state = initializeRelationshipState('persona-1', 'partner-1');
    const today = new Date().toISOString().split('T')[0];
    state.partnerKnowledge.importantDates.push({ name: 'exam day', date: today });

    const modifier = getMoodCarryoverModifier({
      lastConversationMood: 'negative',
      unresolvedTension: true,
      lastInteractionQuality: 0.1,
      shouldAffectNextConversation: true,
    });
    expect(modifier).toContain('tension');

    const care = generateCareAction(state, []);
    expect(care?.type).toBe('remember');
  });

  it('generates stressor follow-up and periodic check-in actions', () => {
    const state = initializeRelationshipState('persona-f', 'partner-f');
    state.stage = 'comfortable';

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const followUp = generateCareAction(state, ['exam']);
    expect(followUp?.type).toBe('follow_up');

    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const checkIn = generateCareAction(state, []);
    expect(['check_in', 'remember', null]).toContain(checkIn?.type ?? null);
  });

  it('covers positive and neutral carryover modifiers', () => {
    const positive = getMoodCarryoverModifier({
      lastConversationMood: 'positive',
      unresolvedTension: false,
      lastInteractionQuality: 0.9,
      shouldAffectNextConversation: true,
    });
    expect(positive).toContain('great');

    const neutral = getMoodCarryoverModifier({
      lastConversationMood: 'neutral',
      unresolvedTension: false,
      lastInteractionQuality: 0.4,
      shouldAffectNextConversation: false,
    });
    expect(neutral).toBe('');
  });
});
