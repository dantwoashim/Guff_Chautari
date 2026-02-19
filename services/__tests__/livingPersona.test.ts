import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getHowWasYourDayResponse,
  getLivingPersonaContext,
  initializeLivingPersona,
  processInteraction,
} from '../livingPersona';

describe('livingPersona', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes a living persona instance', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const instance = initializeLivingPersona('persona-1', 'user-1');

    expect(instance.personaId).toBe('persona-1');
    expect(instance.conversationContext.messageCount).toBe(0);
    expect(instance.relationshipState.partnerId).toBe('user-1');
  });

  it('updates context and relationship counters after interaction', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const instance = initializeLivingPersona('persona-1', 'user-1');

    const updated = processInteraction(instance, 'you are the best, thank you', 'always here for you');

    expect(updated.conversationContext.messageCount).toBe(1);
    expect(updated.relationshipState.messageCount).toBe(1);
    expect(updated.conversationContext.lastUserMessage).toContain('thank you');
  });

  it('builds response context payload and day-summary response', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const instance = initializeLivingPersona('persona-2', 'user-2');
    const context = getLivingPersonaContext(instance);

    expect(context.stageInfo.stage).toBeTruthy();
    expect(context.contextInjection).toContain('TRUST');

    const summary = getHowWasYourDayResponse(instance);
    expect(summary.length).toBeGreaterThan(0);
  });
});
