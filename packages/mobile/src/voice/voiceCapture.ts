export interface VoiceCommand {
  id: string;
  transcript: string;
  source: 'assistant_shortcut' | 'background_note' | 'handsfree';
  capturedAtIso: string;
}

export interface VoiceCaptureResult {
  command: VoiceCommand;
  knowledgeEntry: {
    id: string;
    title: string;
    content: string;
    createdAtIso: string;
  };
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export const processVoiceCapture = (payload: {
  transcript: string;
  source: VoiceCommand['source'];
  capturedAtIso: string;
}): VoiceCaptureResult => {
  const command: VoiceCommand = {
    id: makeId('voice-command'),
    transcript: payload.transcript,
    source: payload.source,
    capturedAtIso: payload.capturedAtIso,
  };

  return {
    command,
    knowledgeEntry: {
      id: makeId('knowledge-voice'),
      title: 'Voice capture note',
      content: payload.transcript,
      createdAtIso: payload.capturedAtIso,
    },
  };
};
