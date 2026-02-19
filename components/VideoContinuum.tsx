
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modality } from '@google/genai';
import { Loader2, AlertTriangle, Send, Activity, X } from './Icons';
import { ChatConfig, Message } from '../types';
import MessageBubble from './MessageBubble';
import { AudioEngine } from './video/AudioEngine';
import { GeminiLiveSession } from './video/LiveConnection';
import VideoPreview from './video/VideoPreview';

interface VideoContinuumProps {
  onClose: () => void;
  config: ChatConfig;
  isDarkMode: boolean;
  onTranscription?: (text: string, role: 'user' | 'model') => void;
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const VideoContinuum: React.FC<VideoContinuumProps> = ({ 
  onClose, 
  config, 
  isDarkMode, 
  onTranscription,
  messages,
  messagesEndRef
}) => {
  const [status, setStatus] = useState<'initializing' | 'connected' | 'reconnecting' | 'error'>('initializing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const audioEngine = useRef(new AudioEngine());
  const liveSession = useRef<GeminiLiveSession | null>(null);
  const isMutedRef = useRef(isMuted);
  const isVideoOffRef = useRef(isVideoOff);
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECTS = 5;

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isVideoOffRef.current = isVideoOff; }, [isVideoOff]);

  const cleanup = useCallback(() => {
    audioEngine.current.cleanup();
    liveSession.current?.disconnect();
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
    }
  }, [mediaStream]);

  const initializeSession = async () => {
    setStatus('initializing');
    try {
      if (!mediaStream) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: { width: 320, height: 240, frameRate: 15 }
        });
        setMediaStream(stream);
        
        audioEngine.current.initInput(stream, (base64) => {
          if (!isMutedRef.current) {
            setIsUserSpeaking(true); // Simple VAD proxy
            setTimeout(() => setIsUserSpeaking(false), 200);
            liveSession.current?.sendRealtimeInput({ mimeType: 'audio/pcm;rate=16000', data: base64 });
          }
        });
        audioEngine.current.initOutput();
      }

      liveSession.current = new GeminiLiveSession({
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
        systemInstruction: `
          ${config.systemInstruction}
          [IDENTITY: Female, Nepali, Playful, Human-like]
          You are 'Aoede'. Speak concisely. React to what you see.
        `
      }, {
        onOpen: () => {
          setStatus('connected');
          reconnectAttempts.current = 0;
        },
        onClose: () => {
          setStatus('reconnecting');
          if (reconnectAttempts.current < MAX_RECONNECTS) {
             reconnectAttempts.current++;
             const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
             setTimeout(initializeSession, delay);
          } else {
             setStatus('error');
             setErrorMessage("Connection lost. Please restart.");
          }
        },
        onError: () => setStatus('error'),
        onMessage: (msg) => {
          if (msg.serverContent?.interrupted) {
            audioEngine.current.stopAll();
            setIsModelSpeaking(false);
          }
          const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) {
            setIsModelSpeaking(true);
            audioEngine.current.playAudio(audioData, undefined, () => {
               if (audioEngine.current.scheduledSources.length === 0) setIsModelSpeaking(false);
            });
          }
        }
      });

      await liveSession.current.connect();

    } catch (e: any) {
      setErrorMessage("Setup failed: " + e.message);
      setStatus('error');
    }
  };

  useEffect(() => {
    initializeSession();
    return cleanup;
  }, []);

  const handleManualSend = () => {
    if (!inputText.trim()) return;
    liveSession.current?.sendText(inputText);
    onTranscription?.(inputText, 'user');
    setInputText('');
  };

  const handleFrameCapture = (base64: string) => {
    // Check ref to ensure we don't send if video was just turned off
    if (!isVideoOffRef.current) {
        liveSession.current?.sendRealtimeInput({ mimeType: 'image/jpeg', data: base64 });
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent relative">
      <header className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-6 z-40 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all duration-300
                ${status === 'connected' ? 'bg-green-500/10 border-green-500/30' : 
                  status === 'error' ? 'bg-red-500/10 border-red-500/30' : 
                  status === 'reconnecting' ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-white/5 border-white/10 animate-pulse'}`}>
              {status === 'initializing' || status === 'reconnecting' ? <Loader2 className="animate-spin text-white/50" size={18} /> :
               status === 'connected' ? <Activity className="text-green-400" size={18} /> :
               <AlertTriangle className="text-red-400" size={18} />}
            </div>
            <div>
              <h1 className="font-semibold text-[15px] text-white/90 drop-shadow-md">Gemini Live</h1>
              <span className="text-[11px] text-white/60 font-mono uppercase tracking-wider flex items-center gap-2">
                  {status} 
                  {status === 'connected' && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isUserSpeaking ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} title="Mic Active"/>
                  )}
              </span>
            </div>
        </div>
        <button onClick={() => { onClose(); }} className="pointer-events-auto p-2 bg-white/10 hover:bg-red-500/20 rounded-full transition-colors text-white hover:text-red-400">
          <X size={20} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar relative p-5 space-y-5 pb-40 pt-24">
          {messages.map((msg) => (
            <div key={msg.id} className="animate-fade-up">
              <MessageBubble message={msg} isDarkMode={isDarkMode} personaName={config.livingPersona?.core?.name} />
            </div>
          ))}
          <div ref={messagesEndRef} />
      </main>

      <VideoPreview 
        stream={mediaStream}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isModelSpeaking={isModelSpeaking}
        onToggleMute={() => setIsMuted(!isMuted)}
        onToggleVideo={() => setIsVideoOff(!isVideoOff)}
        onFrameCapture={handleFrameCapture}
      />

      <footer className="absolute bottom-0 left-0 right-0 p-4 z-40 bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="max-w-3xl mx-auto flex items-end gap-2 p-2 rounded-[24px] bg-white/10 backdrop-blur-xl border border-white/10 shadow-lg mr-[300px]">
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleManualSend(); } }}
              placeholder={status === 'connected' ? "Type to speak..." : "Connecting..."}
              className="flex-1 bg-transparent border-none resize-none py-3 px-4 outline-none text-white placeholder-white/40 max-h-32 min-h-[44px] text-[15px]"
              rows={1}
              disabled={status !== 'connected'}
            />
            <button onClick={handleManualSend} disabled={!inputText.trim() || status !== 'connected'} className="p-3 rounded-xl bg-white text-black hover:scale-105 disabled:opacity-50">
              <Send size={18} />
            </button>
        </div>
      </footer>

      {errorMessage && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-500/90 text-white rounded-full shadow-xl text-sm font-semibold z-50 flex items-center gap-2">
            <AlertTriangle size={16} />
            {errorMessage}
        </div>
      )}
    </div>
  );
};

export default VideoContinuum;
