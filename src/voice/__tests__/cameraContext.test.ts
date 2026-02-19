import { describe, expect, it, vi } from 'vitest';
import { CameraContextManager } from '../cameraContext';

describe('camera context manager', () => {
  it('requires explicit consent and calls vision client for image context', async () => {
    const describeScene = vi.fn(async () => ({
      description: 'You are looking at a whiteboard with sprint tasks and due dates.',
      tags: ['whiteboard', 'sprint', 'tasks'],
    }));
    const manager = new CameraContextManager({
      visionClient: { describeScene },
      nowIso: () => '2026-03-11T10:00:00.000Z',
    });

    const session = manager.startSession({
      userId: 'user-camera',
      threadId: 'thread-1',
      consentGranted: true,
    });

    const result = await manager.analyzeFrame({
      sessionId: session.id,
      imageBase64: 'BASE64_IMAGE',
      mimeType: 'image/jpeg',
      prompt: 'What am I looking at?',
      nowIso: '2026-03-11T10:01:00.000Z',
    });

    expect(describeScene).toHaveBeenCalledWith(
      expect.objectContaining({
        imageBase64: 'BASE64_IMAGE',
        mimeType: 'image/jpeg',
        prompt: 'What am I looking at?',
      })
    );
    expect(result.description.toLowerCase()).toContain('whiteboard');
    expect(result.tags).toEqual(expect.arrayContaining(['whiteboard', 'sprint']));
    expect(result.source).toBe('vision_llm');
  });

  it('throws when session starts without consent', () => {
    const manager = new CameraContextManager({
      visionClient: {
        describeScene: async () => ({ description: 'unused' }),
      },
    });

    expect(() =>
      manager.startSession({
        userId: 'user-no-consent',
        consentGranted: false,
      })
    ).toThrow(/consent/i);
  });
});
