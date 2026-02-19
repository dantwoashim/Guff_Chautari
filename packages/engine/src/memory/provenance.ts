import { toIsoTimestamp } from './retrieval';
import type { MemoryNode, MemoryProvenanceLink } from './types';

export interface SourceMessage {
  id: string;
  threadId: string;
  role: string;
  text: string;
  timestamp: string | number | Date;
}

const shorten = (text: string, limit = 120): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
};

export const createProvenanceLinks = (
  memoryId: string,
  sourceMessages: ReadonlyArray<SourceMessage>
): MemoryProvenanceLink[] => {
  return sourceMessages.map((message) => ({
    memoryId,
    messageId: message.id,
    threadId: message.threadId,
    role: message.role,
    excerpt: shorten(message.text),
    createdAtIso: toIsoTimestamp(message.timestamp),
  }));
};

export const readProvenanceFromMetadata = (
  memoryId: string,
  metadata: Record<string, unknown> | undefined
): MemoryProvenanceLink[] => {
  if (!metadata) return [];
  const raw = metadata.provenance;
  if (!Array.isArray(raw)) return [];

  const links: MemoryProvenanceLink[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;

    const messageId = typeof value.messageId === 'string' ? value.messageId : '';
    const threadId = typeof value.threadId === 'string' ? value.threadId : '';
    const role = typeof value.role === 'string' ? value.role : 'unknown';
    const excerpt = typeof value.excerpt === 'string' ? value.excerpt : '';
    const createdAtIso = toIsoTimestamp(value.createdAtIso as string | number | Date | null | undefined);

    if (!messageId || !threadId) continue;

    links.push({
      memoryId,
      messageId,
      threadId,
      role,
      excerpt,
      createdAtIso,
    });
  }

  return links;
};

export const toProvenanceDebugLines = (
  memories: ReadonlyArray<Pick<MemoryNode, 'id' | 'content' | 'provenance'>>
): string[] => {
  const lines: string[] = [];

  for (const memory of memories) {
    if (memory.provenance.length === 0) {
      lines.push(`${memory.id}: no source messages`);
      continue;
    }

    const summary = memory.provenance
      .map((link) => `${link.messageId}@${link.threadId}`)
      .join(', ');

    lines.push(`${memory.id}: ${summary} | ${shorten(memory.content, 80)}`);
  }

  return lines;
};

