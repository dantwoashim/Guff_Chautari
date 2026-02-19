import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateFirstMessage,
  generateShortTermFollowUp,
  generateSpontaneousMessage,
  getMessageDelay,
  initializePersonaState,
  shouldTriggerShortTermFollowUp,
} from '../spontaneousMessaging';

describe('spontaneousMessaging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not trigger follow-up when conversation ended', () => {
    expect(shouldTriggerShortTermFollowUp('goodnight, ttyl')).toBe(false);
  });

  it('triggers follow-up for neutral message', () => {
    expect(shouldTriggerShortTermFollowUp('talk soon about that plan')).toBe(true);
  });

  it('generates first greeting message for morning context', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const first = generateFirstMessage('Asha', { period: 'morning', hour: 8 });

    expect(first.type).toBe('greeting');
    expect(first.content.length).toBeGreaterThan(0);
    expect(first.trigger).toBe('new_chat');
  });

  it('generates late-night and daytime first-message variants', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const late = generateFirstMessage('Asha', { period: 'night', hour: 2 });
    const day = generateFirstMessage('Asha', { period: 'afternoon', hour: 15 });

    expect(late.content[1]).toContain("couldn't sleep");
    expect(day.content[1]).toContain("it's Asha");
  });

  it('computes urgency-based delay ranges', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const highDelay = getMessageDelay({
      id: '1',
      type: 'greeting',
      content: ['hey'],
      urgency: 'high',
      trigger: 'test',
      expectedResponse: 'engagement',
      hasFollowUp: false,
      timestamp: new Date(),
    });
    const lowDelay = getMessageDelay({
      id: '2',
      type: 'random',
      content: ['random thought'],
      urgency: 'low',
      trigger: 'test',
      expectedResponse: 'reaction',
      hasFollowUp: false,
      timestamp: new Date(),
    });

    expect(highDelay).toBeGreaterThanOrEqual(1000);
    expect(lowDelay).toBeGreaterThanOrEqual(30000);
  });

  it('initializes persona state with generated day and social data', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const state = initializePersonaState('persona-abc');

    expect(state.personaId).toBe('persona-abc');
    expect(state.socialCircle.length).toBeGreaterThan(0);
    expect(state.pendingGossip.length).toBeGreaterThan(0);
    expect(state.currentDay.events.length).toBeGreaterThan(0);
  });

  it('generates short-term follow-up while waiting for user reply', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = initializePersonaState('persona-wait');

    const followUp = generateShortTermFollowUp(state, [
      { role: 'model', text: 'did you see this?' },
    ]);

    expect(followUp.trigger).toBe('waiting_for_reply');
  });

  it('generates contextual short-term follow-up from conversation topic', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = initializePersonaState('persona-topic');

    const followUp = generateShortTermFollowUp(state, [
      { role: 'user', text: 'we were talking about japan travel' },
      { role: 'model', text: 'that sounds fun' },
    ]);

    expect(followUp.trigger).toBe('contextual_followup');
    expect(followUp.content[0]).toContain('japan');
  });

  it('generates forgotten-item and generic follow-up branches', () => {
    const state = initializePersonaState('persona-misc');

    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const forgotten = generateShortTermFollowUp(state, [{ role: 'model', text: 'cool.' }]);
    expect(forgotten.trigger).toBe('forgotten_item');

    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const generic = generateShortTermFollowUp(state, [{ role: 'model', text: 'cool.' }]);
    expect(generic.trigger).toBe('thought_continuation');
  });

  it('prioritizes contextual open-question spontaneous responses', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = initializePersonaState('persona-open', Date.now());

    const msg = generateSpontaneousMessage(state, 12, [
      { role: 'model', text: 'what were you saying about your exam?' },
      { role: 'user', text: 'not sure yet' },
    ]);

    expect(msg?.trigger).toBe('contextual_followup');
  });

  it('produces gossip and event-triggered spontaneous messages', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const gossipState = initializePersonaState('persona-gossip', Date.now());
    gossipState.pendingEvents = [];
    gossipState.pendingGossip = [
      {
        id: 'g-1',
        about: 'friend',
        content: 'you wont believe this',
        source: 'direct',
        emotionalTone: 'shocked',
        urgency: 'need_to_tell',
        shareability: 1,
        hasReceipts: false,
      },
    ];
    const gossip = generateSpontaneousMessage(gossipState, 20, []);
    expect(gossip?.type).toBe('gossip');

    const eventState = initializePersonaState('persona-event', Date.now());
    eventState.pendingGossip = [];
    eventState.pendingEvents = [
      {
        id: 'e-1',
        hour: 10,
        type: 'achievement',
        description: 'i got selected for finals',
        emotionalImpact: 0.8,
        shareLikelihood: 1,
        canGenerateFollowUp: true,
      },
    ];
    const eventMsg = generateSpontaneousMessage(eventState, 20, []);
    expect(eventMsg?.trigger).toBe('significant_event');
  });

  it('covers re-engagement, mood-driven, random, and drama branches', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const reengage = initializePersonaState('persona-re', Date.now() - 13 * 60 * 60 * 1000);
    reengage.pendingEvents = [];
    reengage.pendingGossip = [];
    const reMsg = generateSpontaneousMessage(reengage, 14, [
      { role: 'user', text: 'we talked about music' },
    ]);
    expect(reMsg?.trigger).toBe('contextual_reengagement');

    const excited = initializePersonaState('persona-ex', Date.now());
    excited.pendingEvents = [];
    excited.pendingGossip = [];
    excited.moodArc.currentMood = 0.7;
    const exMsg = generateSpontaneousMessage(excited, 13, []);
    expect(exMsg?.trigger).toBe('positive_mood');

    const vent = initializePersonaState('persona-vent', Date.now());
    vent.pendingEvents = [];
    vent.pendingGossip = [];
    vent.moodArc.currentMood = -0.7;
    const ventMsg = generateSpontaneousMessage(vent, 13, []);
    expect(ventMsg?.trigger).toBe('negative_mood');

    const randomState = initializePersonaState('persona-rand', Date.now());
    randomState.pendingGossip = [];
    randomState.pendingEvents = [];
    randomState.activeDramas = [];
    randomState.moodArc.currentMood = 0;
    const randomMsg = generateSpontaneousMessage(randomState, 13, []);
    expect(['random_thought', null]).toContain(randomMsg?.trigger ?? null);

    const dramaState = initializePersonaState('persona-drama', Date.now());
    dramaState.pendingGossip = [];
    dramaState.pendingEvents = [];
    dramaState.moodArc.currentMood = 0;
    dramaState.activeDramas = [
      {
        id: 'd-1',
        title: 'Campus drama',
        people: ['A', 'B'],
        severity: 'major',
        startedAt: new Date(),
        updates: [{ timestamp: new Date(), description: 'it escalated' }],
        unresolved: true,
      },
    ];
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.2) // skip random_thought branch
      .mockReturnValueOnce(0.1) // hit drama_update branch
      .mockReturnValue(0);
    const dramaMsg = generateSpontaneousMessage(dramaState, 13, []);
    expect(dramaMsg?.trigger).toBe('drama_update');
  });
});
