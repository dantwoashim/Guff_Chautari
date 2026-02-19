import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Persona } from '../../../../types';
import type { SupabaseLike } from '../base';
import { PersonaRepository } from '../personaRepository';

const createPersona = (overrides: Partial<Persona> = {}): Persona => ({
  id: overrides.id ?? crypto.randomUUID(),
  user_id: overrides.user_id ?? 'user-1',
  name: overrides.name ?? 'Persona',
  description: overrides.description ?? 'desc',
  system_instruction: overrides.system_instruction ?? 'sys',
  avatar_url: overrides.avatar_url,
  created_at: overrides.created_at,
  status_text: overrides.status_text,
  is_online: overrides.is_online,
});

describe('PersonaRepository', () => {
  let from: ReturnType<typeof vi.fn>;
  let repository: PersonaRepository;

  beforeEach(() => {
    from = vi.fn();
    const client = { from, rpc: vi.fn() } as unknown as SupabaseLike;
    repository = new PersonaRepository(client);
  });

  it('lists only user personas and active global personas', async () => {
    const rows = [
      createPersona({ id: 'mine', user_id: 'user-1' }),
      { ...createPersona({ id: 'global-active', user_id: 'other' }), is_global: true, is_active: true },
      { ...createPersona({ id: 'global-inactive', user_id: 'other' }), is_global: true, is_active: false },
      createPersona({ id: 'other-private', user_id: 'other' }),
    ];

    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const or = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ or });
    from.mockReturnValue({ select });

    const result = await repository.listByUserOrGlobal('user-1');

    expect(from).toHaveBeenCalledWith('personas');
    expect(select).toHaveBeenCalledWith('*');
    expect(or).toHaveBeenCalledWith('is_global.eq.true,user_id.eq.user-1');
    expect(result.map((p) => p.id)).toEqual(['mine', 'global-active']);
  });

  it('gets a persona by id', async () => {
    const persona = createPersona({ id: 'persona-5' });
    const maybeSingle = vi.fn().mockResolvedValue({ data: persona, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    const result = await repository.getById('persona-5');

    expect(from).toHaveBeenCalledWith('personas');
    expect(eq).toHaveBeenCalledWith('id', 'persona-5');
    expect(result).toEqual(persona);
  });

  it('returns null when persona is not found', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    const result = await repository.getById('missing');
    expect(result).toBeNull();
  });
});
