import { describe, expect, it } from 'vitest';
import {
  CouncilStore,
  createCouncil,
  createInMemoryCouncilStoreAdapter,
  getCouncilById,
  listCouncils,
} from '../index';

describe('councilManager', () => {
  it('creates and persists a valid council with 3-7 members', () => {
    const store = new CouncilStore(createInMemoryCouncilStoreAdapter());
    const council = createCouncil(
      {
        userId: 'user-1',
        name: 'Career Board',
        members: [
          { personaId: 'p1', name: 'Strategist' },
          { personaId: 'p2', name: 'Operator' },
          { personaId: 'p3', name: 'Skeptic' },
        ],
      },
      store
    );

    const listed = listCouncils('user-1', store);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(council.id);
    expect(getCouncilById('user-1', council.id, store)?.name).toBe('Career Board');
  });

  it('rejects invalid member count and duplicate persona selection', () => {
    const store = new CouncilStore(createInMemoryCouncilStoreAdapter());

    expect(() =>
      createCouncil(
        {
          userId: 'user-1',
          name: 'Too Small',
          members: [
            { personaId: 'p1', name: 'Only One' },
            { personaId: 'p2', name: 'Only Two' },
          ],
        },
        store
      )
    ).toThrow(/3-7 members/i);

    expect(() =>
      createCouncil(
        {
          userId: 'user-1',
          name: 'Duplicates',
          members: [
            { personaId: 'p1', name: 'A' },
            { personaId: 'p1', name: 'B' },
            { personaId: 'p3', name: 'C' },
          ],
        },
        store
      )
    ).toThrow(/duplicate persona/i);
  });
});
