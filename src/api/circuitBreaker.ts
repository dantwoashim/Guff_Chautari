const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export type CircuitStatus = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerState {
  id: string;
  key: string;
  status: CircuitStatus;
  failureCount: number;
  successCount: number;
  openedAtIso: string | null;
  nextRetryAtIso: string | null;
  updatedAtIso: string;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

interface InternalCircuitState {
  status: CircuitStatus;
  failureCount: number;
  successCount: number;
  openedAtMs: number | null;
  nextRetryAtMs: number | null;
  updatedAtMs: number;
}

const toIso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

export class CircuitBreakerOpenError extends Error {
  readonly key: string;
  readonly nextRetryAtIso: string | null;

  constructor(key: string, nextRetryAtIso: string | null) {
    super(`Circuit "${key}" is open.`);
    this.name = 'CircuitBreakerOpenError';
    this.key = key;
    this.nextRetryAtIso = nextRetryAtIso;
  }
}

export class ApiCircuitBreaker {
  private readonly circuits = new Map<string, InternalCircuitState>();
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 5);
    this.successThreshold = Math.max(1, options.successThreshold ?? 1);
    this.cooldownMs = Math.max(1000, options.cooldownMs ?? 30_000);
    this.now = options.now ?? (() => Date.now());
  }

  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const nowMs = this.now();
    const circuit = this.getOrCreateCircuit(key, nowMs);
    this.transitionIfCooldownElapsed(circuit, nowMs);

    if (circuit.status === 'open') {
      throw new CircuitBreakerOpenError(key, toIso(circuit.nextRetryAtMs));
    }

    try {
      const result = await operation();
      this.onSuccess(circuit, nowMs);
      return result;
    } catch (error) {
      this.onFailure(circuit, nowMs);
      throw error;
    }
  }

  getState(key: string): CircuitBreakerState {
    const nowMs = this.now();
    const circuit = this.getOrCreateCircuit(key, nowMs);
    this.transitionIfCooldownElapsed(circuit, nowMs);
    return this.toPublicState(key, circuit);
  }

  listStates(): CircuitBreakerState[] {
    const nowMs = this.now();
    return Array.from(this.circuits.entries())
      .map(([key, circuit]) => {
        this.transitionIfCooldownElapsed(circuit, nowMs);
        return this.toPublicState(key, circuit);
      })
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  reset(key?: string): void {
    if (!key) {
      this.circuits.clear();
      return;
    }
    this.circuits.delete(key);
  }

  private getOrCreateCircuit(key: string, nowMs: number): InternalCircuitState {
    const existing = this.circuits.get(key);
    if (existing) return existing;
    const created: InternalCircuitState = {
      status: 'closed',
      failureCount: 0,
      successCount: 0,
      openedAtMs: null,
      nextRetryAtMs: null,
      updatedAtMs: nowMs,
    };
    this.circuits.set(key, created);
    return created;
  }

  private onSuccess(circuit: InternalCircuitState, nowMs: number): void {
    if (circuit.status === 'half_open') {
      circuit.successCount += 1;
      if (circuit.successCount >= this.successThreshold) {
        circuit.status = 'closed';
        circuit.failureCount = 0;
        circuit.successCount = 0;
        circuit.openedAtMs = null;
        circuit.nextRetryAtMs = null;
      }
    } else {
      circuit.failureCount = 0;
      circuit.successCount = 0;
    }
    circuit.updatedAtMs = nowMs;
  }

  private onFailure(circuit: InternalCircuitState, nowMs: number): void {
    if (circuit.status === 'half_open') {
      this.openCircuit(circuit, nowMs);
      return;
    }

    circuit.failureCount += 1;
    if (circuit.failureCount >= this.failureThreshold) {
      this.openCircuit(circuit, nowMs);
      return;
    }
    circuit.updatedAtMs = nowMs;
  }

  private openCircuit(circuit: InternalCircuitState, nowMs: number): void {
    circuit.status = 'open';
    circuit.failureCount = this.failureThreshold;
    circuit.successCount = 0;
    circuit.openedAtMs = nowMs;
    circuit.nextRetryAtMs = nowMs + this.cooldownMs;
    circuit.updatedAtMs = nowMs;
  }

  private transitionIfCooldownElapsed(circuit: InternalCircuitState, nowMs: number): void {
    if (circuit.status !== 'open') return;
    if (!circuit.nextRetryAtMs) return;
    if (nowMs < circuit.nextRetryAtMs) return;

    circuit.status = 'half_open';
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.updatedAtMs = nowMs;
  }

  private toPublicState(key: string, state: InternalCircuitState): CircuitBreakerState {
    return {
      id: makeId('circuit'),
      key,
      status: state.status,
      failureCount: state.failureCount,
      successCount: state.successCount,
      openedAtIso: toIso(state.openedAtMs),
      nextRetryAtIso: toIso(state.nextRetryAtMs),
      updatedAtIso: new Date(state.updatedAtMs).toISOString(),
    };
  }
}

export const apiCircuitBreaker = new ApiCircuitBreaker();
