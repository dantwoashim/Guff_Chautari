export interface WorkflowMemoryEntry {
  key: string;
  value: Record<string, unknown>;
  createdAtIso: string;
}

export class WorkflowMemoryScope {
  private readonly namespaces = new Map<string, WorkflowMemoryEntry[]>();

  namespaceFor(workflowId: string): string {
    return `workflow:${workflowId}`;
  }

  append(namespace: string, key: string, value: Record<string, unknown>, nowIso?: string): WorkflowMemoryEntry {
    const entry: WorkflowMemoryEntry = {
      key,
      value,
      createdAtIso: nowIso ?? new Date().toISOString(),
    };
    const existing = this.namespaces.get(namespace) ?? [];
    this.namespaces.set(namespace, [...existing, entry]);
    return entry;
  }

  list(namespace: string): WorkflowMemoryEntry[] {
    return this.namespaces.get(namespace) ?? [];
  }

  clear(namespace: string): void {
    this.namespaces.delete(namespace);
  }
}

export const workflowMemoryScope = new WorkflowMemoryScope();
