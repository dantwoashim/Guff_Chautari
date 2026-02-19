import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, Mic, MicOff, Send, Volume2, VolumeX } from '../../../components/Icons';
import type { LivingPersona, Message } from '../../../types';
import { appendTtsPlaybackToConversationHistory } from '../../voice/integrations';
import { blobToBase64Audio, ingestVoiceNote, transcribeVoiceAudio } from '../../voice/voiceNote';
import { speakPersonaText } from '../../voice/ttsEngine';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

interface VoiceChatPanelProps {
  userId: string;
  threadId: string | null;
  messages: Message[];
  onSendMessage: (text: string) => Promise<void> | void;
  isStreaming?: boolean;
  livingPersona?: LivingPersona;
  ttsVoice?: string;
}

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as WindowWithSpeechRecognition;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
};

export const VoiceChatPanel: React.FC<VoiceChatPanelProps> = ({
  userId,
  threadId,
  messages,
  onSendMessage,
  isStreaming = false,
  livingPersona,
  ttsVoice,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [latestTranscript, setLatestTranscript] = useState('');
  const [status, setStatus] = useState('Hold the button to talk.');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const discardRecordingRef = useRef(false);
  const lastSpokenAssistantIdRef = useRef<string | null>(null);

  const recentMessages = useMemo(() => messages.slice(-14), [messages]);
  const latestAssistantMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === 'model' && message.text.trim().length > 0),
    [messages]
  );

  const stopSpeechRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // Ignore API stop errors.
    }
    recognitionRef.current = null;
  }, []);

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) return;
    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        let finalText = '';
        let interimText = '';
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0]?.transcript ?? '';
          if (result.isFinal) {
            finalText += ` ${transcript}`;
          } else {
            interimText += ` ${transcript}`;
          }
        }
        const combined = cleanText(`${finalText} ${interimText}`);
        if (combined) {
          setInterimTranscript(combined);
        }
      };
      recognition.onerror = () => {
        // Soft-fail: we still transcribe final audio after recording stops.
      };
      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
      };
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // Ignore unsupported browser implementations.
    }
  }, []);

  const stopMediaTracks = useCallback(() => {
    if (!mediaStreamRef.current) return;
    for (const track of mediaStreamRef.current.getTracks()) {
      track.stop();
    }
    mediaStreamRef.current = null;
  }, []);

  const finalizeRecording = useCallback(async () => {
    const capturedChunks = [...chunksRef.current];
    chunksRef.current = [];
    stopSpeechRecognition();

    if (discardRecordingRef.current) {
      discardRecordingRef.current = false;
      setInterimTranscript('');
      setStatus('Recording canceled.');
      setIsProcessing(false);
      return;
    }

    if (capturedChunks.length === 0) {
      setStatus('No audio captured. Try again.');
      setIsProcessing(false);
      return;
    }

    const audioBlob = new Blob(capturedChunks, {
      type: mediaRecorderRef.current?.mimeType || 'audio/webm',
    });

    try {
      const encoded = await blobToBase64Audio(audioBlob);
      let transcript = '';
      try {
        const voiceNote = await ingestVoiceNote({
          userId,
          audioBase64: encoded.audioBase64,
          mimeType: encoded.mimeType,
          threadId: threadId ?? undefined,
          title: `Voice Chat ${new Date().toISOString()}`,
        });
        transcript = voiceNote.transcript;
      } catch {
        transcript = await transcribeVoiceAudio({
          audioBase64: encoded.audioBase64,
          mimeType: encoded.mimeType,
        });
      }

      setLatestTranscript(transcript);
      setInterimTranscript('');

      if (!threadId) {
        setStatus('Open a chat thread before sending voice messages.');
        return;
      }

      await onSendMessage(transcript);
      setStatus('Voice transcript sent. Waiting for persona response...');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Voice transcription failed.');
    } finally {
      setIsProcessing(false);
    }
  }, [onSendMessage, stopSpeechRecognition, threadId, userId]);

  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('Microphone recording is unavailable in this environment.');
      return;
    }
    discardRecordingRef.current = false;
    setLatestTranscript('');
    setInterimTranscript('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = preferredMimeTypes.find(
        (candidate) =>
          typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stopMediaTracks();
        mediaRecorderRef.current = null;
        void finalizeRecording();
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;

      setIsRecording(true);
      setIsProcessing(false);
      setStatus('Listening... release to send.');
      startSpeechRecognition();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Unable to start microphone recording.'
      );
      stopMediaTracks();
    }
  }, [finalizeRecording, isProcessing, isRecording, startSpeechRecognition, stopMediaTracks]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === 'inactive') return;
    setIsRecording(false);
    setIsProcessing(true);
    setStatus('Transcribing voice input...');
    stopSpeechRecognition();
    mediaRecorderRef.current.stop();
  }, [stopSpeechRecognition]);

  const cancelRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    discardRecordingRef.current = true;
    setIsRecording(false);
    setIsProcessing(true);
    setStatus('Canceling recording...');
    stopSpeechRecognition();
    if (mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, [stopSpeechRecognition]);

  useEffect(() => {
    lastSpokenAssistantIdRef.current = latestAssistantMessage?.id ?? null;
  }, [threadId, latestAssistantMessage?.id]);

  useEffect(() => {
    if (!autoSpeak) return;
    if (!latestAssistantMessage?.id || !latestAssistantMessage.text.trim()) return;

    const previous = lastSpokenAssistantIdRef.current;
    if (!previous) {
      lastSpokenAssistantIdRef.current = latestAssistantMessage.id;
      return;
    }
    if (previous === latestAssistantMessage.id) return;

    lastSpokenAssistantIdRef.current = latestAssistantMessage.id;
    void speakPersonaText({
      text: latestAssistantMessage.text,
      persona: livingPersona,
      voiceName: ttsVoice,
    }).then((result) => {
      if (result.ok && threadId) {
        void appendTtsPlaybackToConversationHistory({
          userId,
          sessionId: threadId,
          messageId: latestAssistantMessage.id,
          engine: result.engine === 'web_speech' ? 'web_speech' : 'gemini_tts',
          voiceName: ttsVoice,
        });
      }
      if (!result.ok && result.reason !== 'speech_synthesis_unavailable') {
        setStatus(`TTS unavailable (${result.reason}).`);
      }
    });
  }, [autoSpeak, latestAssistantMessage, livingPersona, threadId, ttsVoice, userId]);

  useEffect(() => {
    return () => {
      stopSpeechRecognition();
      stopMediaTracks();
    };
  }, [stopMediaTracks, stopSpeechRecognition]);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-[#e9edef]">
                <Headphones size={18} />
                Voice Chat
              </h2>
              <p className="text-sm text-[#8696a0]">
                Hold to talk, transcribe, send to chat, and hear persona responses with matched TTS.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border border-[#313d45] px-3 py-1.5 text-xs text-[#c5d0d6] hover:bg-[#202c33]"
              onClick={() => setAutoSpeak((current) => !current)}
            >
              {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
              Auto Speak: {autoSpeak ? 'On' : 'Off'}
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="rounded-lg border border-[#27343d] bg-[#0f171c] p-3 text-sm text-[#d8e2e8]">
              <div className="mb-1 text-xs uppercase tracking-wide text-[#8ea1ab]">
                Live Transcript
              </div>
              <div className="min-h-20 whitespace-pre-wrap">
                {interimTranscript || latestTranscript || 'Start recording to see transcript here...'}
              </div>
            </div>

            <div className="flex flex-col justify-center gap-2">
              <button
                type="button"
                className={`inline-flex min-w-44 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                  isRecording
                    ? 'border-[#b54b56] bg-[#3a1a20] text-[#ffc9d0]'
                    : 'border-[#00a884] bg-[#12453f] text-[#d8fff7] hover:bg-[#176055]'
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void startRecording();
                }}
                onMouseUp={(event) => {
                  event.preventDefault();
                  stopRecording();
                }}
                onMouseLeave={() => {
                  if (isRecording) stopRecording();
                }}
                onTouchStart={(event) => {
                  event.preventDefault();
                  void startRecording();
                }}
                onTouchEnd={(event) => {
                  event.preventDefault();
                  stopRecording();
                }}
                disabled={isProcessing}
              >
                {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                {isRecording ? 'Release to Send' : 'Hold to Talk'}
              </button>

              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#313d45] px-4 py-2 text-xs text-[#b5c2c9] hover:bg-[#202c33]"
                onClick={cancelRecording}
                disabled={!isRecording}
              >
                <MicOff size={14} />
                Cancel
              </button>
            </div>
          </div>

          <div className="mt-3 rounded border border-[#2f4958] bg-[#102731] px-3 py-2 text-xs text-[#b8dced]">
            {status}
          </div>
        </section>

        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#e9edef]">
            <Send size={14} />
            Conversation Feed
          </div>
          <div className="space-y-2">
            {recentMessages.length === 0 ? (
              <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                No messages yet. Send a voice turn to start.
              </div>
            ) : (
              recentMessages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded border p-2 text-xs ${
                    message.role === 'user'
                      ? 'border-[#32505c] bg-[#102a36] text-[#d6ebf5]'
                      : 'border-[#2f3f46] bg-[#0f171c] text-[#c6d1d7]'
                  }`}
                >
                  <div className="mb-1 uppercase tracking-wide text-[10px] text-[#87a0ad]">
                    {message.role === 'user' ? 'You' : 'Persona'}
                    {message.role === 'model' && isStreaming && message.id === latestAssistantMessage?.id
                      ? ' • Streaming'
                      : ''}
                  </div>
                  <div className="whitespace-pre-wrap">{message.text || '[voice attachment]'}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default VoiceChatPanel;
