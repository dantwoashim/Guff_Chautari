import { BYOKKeyManager } from '../byok/keyManager';
import { GeminiProvider } from '../providers/gemini/geminiProvider';
import { appendCameraContextDecisionEvidence } from './integrations';

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const extractTags = (text: string, maxTags = 6): string[] => {
  const stop = new Set([
    'the',
    'and',
    'with',
    'this',
    'that',
    'there',
    'from',
    'into',
    'about',
    'what',
    'where',
    'which',
    'image',
    'scene',
    'camera',
  ]);
  const counts = new Map<string, number>();
  for (const token of text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !stop.has(item))) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, Math.max(1, maxTags))
    .map(([token]) => token);
};

export interface CameraContextSession {
  id: string;
  userId: string;
  threadId?: string;
  consentGranted: boolean;
  status: 'active' | 'ended';
  startedAtIso: string;
  updatedAtIso: string;
  endedAtIso?: string;
}

export interface CameraVisionResult {
  description: string;
  tags?: string[];
}

export interface CameraContextResult {
  sessionId: string;
  generatedAtIso: string;
  description: string;
  tags: string[];
  source: 'vision_llm' | 'fallback';
  decisionEvidenceId?: string;
}

export interface CameraVisionClient {
  describeScene: (payload: {
    imageBase64: string;
    mimeType: string;
    prompt: string;
    session: CameraContextSession;
    nowIso: string;
  }) => Promise<CameraVisionResult>;
}

const defaultCameraVisionClient: CameraVisionClient = {
  describeScene: async (payload) => {
    try {
      if (typeof window !== 'undefined') {
        await BYOKKeyManager.getDecryptedKey('gemini');
      }
    } catch {
      // Use runtime key if already present.
    }

    const provider = new GeminiProvider();
    const systemPrompt =
      'You are a camera-context assistant. Describe what is visible concretely and briefly. Avoid speculation.';
    const userPrompt = cleanText(payload.prompt) || 'What am I looking at?';

    let responseText = '';
    for await (const chunk of provider.streamChat({
      model: 'gemini-2.5-pro',
      temperature: 0.15,
      maxTokens: 320,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'inline_data',
              mimeType: payload.mimeType,
              data: payload.imageBase64,
            },
            {
              type: 'text',
              text: userPrompt,
            },
          ],
        },
      ],
    })) {
      responseText += chunk.text;
    }

    const description = cleanText(responseText) || 'Image received but no scene description was generated.';
    return {
      description,
      tags: extractTags(description),
    };
  },
};

interface CameraContextManagerOptions {
  visionClient?: CameraVisionClient;
  nowIso?: () => string;
}

export class CameraContextManager {
  private readonly sessions = new Map<string, CameraContextSession>();
  private readonly visionClient: CameraVisionClient;
  private readonly nowIso: () => string;

  constructor(options: CameraContextManagerOptions = {}) {
    this.visionClient = options.visionClient ?? defaultCameraVisionClient;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  startSession(payload: {
    userId: string;
    threadId?: string;
    consentGranted: boolean;
    nowIso?: string;
  }): CameraContextSession {
    if (!payload.consentGranted) {
      throw new Error('Camera consent is required before starting camera context session.');
    }
    const nowIso = payload.nowIso ?? this.nowIso();
    const session: CameraContextSession = {
      id: makeId('camera-session'),
      userId: payload.userId,
      threadId: payload.threadId,
      consentGranted: payload.consentGranted,
      status: 'active',
      startedAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.sessions.set(session.id, session);
    return { ...session };
  }

  getSession(sessionId: string): CameraContextSession | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  endSession(payload: {
    sessionId: string;
    nowIso?: string;
  }): CameraContextSession {
    const session = this.requireSession(payload.sessionId);
    if (session.status === 'ended') return { ...session };

    const nowIso = payload.nowIso ?? this.nowIso();
    const next: CameraContextSession = {
      ...session,
      status: 'ended',
      endedAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.sessions.set(next.id, next);
    return { ...next };
  }

  async analyzeFrame(payload: {
    sessionId: string;
    imageBase64: string;
    mimeType: string;
    prompt?: string;
    nowIso?: string;
    decisionMatrixId?: string;
    threadId?: string;
    provenanceMessageIds?: string[];
  }): Promise<CameraContextResult> {
    const session = this.requireSession(payload.sessionId);
    if (session.status !== 'active') {
      throw new Error(`Camera session ${payload.sessionId} is not active.`);
    }
    if (!session.consentGranted) {
      throw new Error('Camera consent was revoked for this session.');
    }

    const nowIso = payload.nowIso ?? this.nowIso();
    const vision = await this.visionClient.describeScene({
      imageBase64: payload.imageBase64,
      mimeType: payload.mimeType,
      prompt: payload.prompt ?? 'What am I looking at?',
      session,
      nowIso,
    });

    const description = cleanText(vision.description);
    const tags = (vision.tags && vision.tags.length > 0 ? vision.tags : extractTags(description)).slice(0, 8);
    const source = description ? 'vision_llm' : 'fallback';

    let decisionEvidenceId: string | undefined;
    if (payload.decisionMatrixId && description) {
      const evidence = appendCameraContextDecisionEvidence({
        userId: session.userId,
        matrixId: payload.decisionMatrixId,
        contextText: description,
        sourceId: `camera:${session.id}`,
        threadId: payload.threadId ?? session.threadId,
        timestampIso: nowIso,
        provenanceMessageIds: payload.provenanceMessageIds,
      });
      decisionEvidenceId = evidence.id;
    }

    const next: CameraContextSession = {
      ...session,
      updatedAtIso: nowIso,
    };
    this.sessions.set(session.id, next);

    return {
      sessionId: session.id,
      generatedAtIso: nowIso,
      description,
      tags,
      source,
      decisionEvidenceId,
    };
  }

  private requireSession(sessionId: string): CameraContextSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Camera context session ${sessionId} not found.`);
    }
    return session;
  }
}

export const cameraContextManager = new CameraContextManager();
