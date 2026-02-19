import { supabase } from '../supabase';

export interface QueryResult<T = unknown> {
  data?: T;
  error?: unknown | null;
}

export interface SupabaseTableClient extends PromiseLike<QueryResult<unknown>> {
  select: (query: string) => SupabaseTableClient;
  insert: (values: Record<string, unknown>) => SupabaseTableClient;
  update: (values: Record<string, unknown>) => SupabaseTableClient;
  delete: () => SupabaseTableClient;
  upsert: (
    values: Record<string, unknown>,
    options?: { onConflict?: string }
  ) => Promise<QueryResult<unknown>>;
  eq: (column: string, value: unknown) => SupabaseTableClient;
  or: (filters: string) => SupabaseTableClient;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseTableClient;
  limit: (count: number) => SupabaseTableClient;
  maybeSingle: () => Promise<QueryResult<unknown>>;
  single: () => Promise<QueryResult<unknown>>;
}

export interface SupabaseLike {
  from: (table: string) => SupabaseTableClient;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<QueryResult<unknown>>;
  storage?: unknown;
}

export const defaultSupabaseClient: SupabaseLike = supabase as unknown as SupabaseLike;
