import { defaultSupabaseClient, SupabaseLike } from './base';

export interface KeyMetadata {
  provider: string;
  fingerprint: string;
  lastValidatedAt: string;
}

export class KeyRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async upsertMetadata(userId: string, metadata: KeyMetadata): Promise<void> {
    const { error } = await this.client.from('byok_keys').upsert({
      user_id: userId,
      provider: metadata.provider,
      fingerprint: metadata.fingerprint,
      last_validated_at: metadata.lastValidatedAt,
    });
    if (error) throw error;
  }

  async getMetadata(userId: string, provider: string): Promise<KeyMetadata | null> {
    const { data, error } = await this.client
      .from('byok_keys')
      .select('provider, fingerprint, last_validated_at')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();

    if (error) throw error;
    const row = (data || null) as
      | {
          provider: string;
          fingerprint: string;
          last_validated_at: string;
        }
      | null;
    if (!row) return null;

    return {
      provider: row.provider,
      fingerprint: row.fingerprint,
      lastValidatedAt: row.last_validated_at,
    };
  }

  async deleteMetadata(userId: string, provider: string): Promise<void> {
    const { error } = await this.client
      .from('byok_keys')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);
    if (error) throw error;
  }
}

export const keyRepository = new KeyRepository();
