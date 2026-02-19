
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, Square, Headphones, Loader2, Sparkles, X, Activity, Volume2, MicOff } from './Icons';
import { ChatConfig } from '../types';
import { resolveGeminiApiKey } from '../lib/env';

interface VoiceContinuumProps {
  onClose: () => void;
  config: ChatConfig;
  isDarkMode: boolean;
  onTranscription: (text: string, role: 'user' | 'model') => void;
}

const VoiceContinuum: React.FC<VoiceContinuumProps> = ({ onClose, config, isDarkMode, onTranscription }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [userSpeechDetected, setUserSpeechDetected] = useState(false);
  const [modelSpeechDetected, setModelSpeechDetected] = useState(false);
  const [lastUserTranscript, setLastUserTranscript] = useState('');
  const [lastModelTranscript, setLastModelTranscript] = useState('');

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // UTILS: Manual Encode/Decode for PCM Raw Data as per guidelines
  const decodeBase64ToBytes = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const encodeBytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const createPCM16Blob = (data: Float32Array): { data: string, mimeType: string } => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: encodeBytesToBase64(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  };

  const stopActiveSession = useCallback(() => {
    if (sessionRef.current) {
      try {
          sessionRef.current.close();
      } catch (e) { console.warn("Session close error", e); }
      sessionRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
          audioContextRef.current.close();
      } catch (e) { console.warn("AudioContext close error", e); }
      audioContextRef.current = null;
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      try {
          outputAudioContextRef.current.close();
      } catch (e) { console.warn("OutputAudioContext close error", e); }
      outputAudioContextRef.current = null;
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setIsActive(false);
  }, []);

  const startContinuum = async () => {
    setIsConnecting(true);
    // Safe initialization with check
    const apiKey = resolveGeminiApiKey();
    const ai = new GoogleGenAI({ apiKey: apiKey || '' });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      audioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createPCM16Blob(inputData);
              sessionPromise.then((session) => {
                try {
                    session.sendRealtimeInput({ media: pcmBlob });
                } catch(e) { /* Ignore */ }
              });
              
              // Simple VAD for UI indicator
              const volume = inputData.reduce((a, b) => a + Math.abs(b), 0) / inputData.length;
              setUserSpeechDetected(volume > 0.01);
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Interruption handling
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setModelSpeechDetected(false);
            }

            // Audio handling
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
              const audioBytes = decodeBase64ToBytes(base64Audio);
              const audioBuffer = await decodeAudioData(audioBytes, outputCtx, 24000, 1);
              
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              
              sourcesRef.current.add(source);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setModelSpeechDetected(false);
              };
              setModelSpeechDetected(true);
            }

            // Transcription handling
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              if (text) {
                setLastUserTranscript(prev => prev + ' ' + text);
                if (message.serverContent.turnComplete) {
                   onTranscription(lastUserTranscript + ' ' + text, 'user');
                   setLastUserTranscript('');
                }
              }
            }
            if (message.serverContent?.outputTranscription) {
               const text = message.serverContent.outputTranscription.text;
               if (text) {
                  setLastModelTranscript(prev => prev + text);
                  if (message.serverContent.turnComplete) {
                    onTranscription(lastModelTranscript + text, 'model');
                    setLastModelTranscript('');
                  }
               }
            }
          },
          onerror: (e) => {
            console.error("Voice Session Error", e);
            stopActiveSession();
          },
          onclose: () => {
            stopActiveSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: config.ttsVoice || 'Puck' } }
          },
          systemInstruction: config.systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (e) {
      console.error("Microphone access failed", e);
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    return () => stopActiveSession();
  }, [stopActiveSession]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center p-8 backdrop-blur-3xl animate-fade-in bg-black/90">
      
      {/* HEADER */}
      <div className="absolute top-8 left-8 right-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl ${isDarkMode ? 'bg-sage-500/10 text-sage-400' : 'bg-sage-50 text-sage-600'}`}>
            <Headphones size={24} />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-white">Voice Continuum</h2>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Real-time Multimodal Sync</p>
          </div>
        </div>
        <button onClick={onClose} className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/60 transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* CORE VISUALIZER / INTERACTION */}
      <div className="flex-1 flex flex-col items-center justify-center gap-12 w-full max-w-2xl">
        
        {/* WAVEFORMS */}
        <div className="relative flex items-center justify-center h-64 w-full">
           {/* Model Pulse */}
           <div className={`absolute w-48 h-48 rounded-full blur-3xl transition-all duration-1000 ${modelSpeechDetected ? 'bg-sage-500/30 scale-125' : 'bg-white/5 scale-100'}`} />
           
           {/* Visualizer Lines */}
           <div className="flex items-center gap-1.5 h-32 relative z-10">
              {[...Array(24)].map((_, i) => {
                const isActive_ = modelSpeechDetected || userSpeechDetected;
                const height = isActive_ ? 20 + Math.random() * 80 : 10;
                return (
                  <div 
                    key={i} 
                    className={`w-1.5 rounded-full transition-all duration-150 ${userSpeechDetected ? 'bg-white' : modelSpeechDetected ? 'bg-sage-500' : 'bg-white/10'}`}
                    style={{ height: `${height}%` }}
                  />
                );
              })}
           </div>

           {/* Inferred Presence */}
           <div className="absolute bottom-[-40px] text-center">
              <span className={`text-xs font-bold uppercase tracking-widest transition-opacity duration-300 ${userSpeechDetected ? 'opacity-100 text-white' : 'opacity-0'}`}>Listening...</span>
              <span className={`text-xs font-bold uppercase tracking-widest transition-opacity duration-300 absolute left-1/2 -translate-x-1/2 whitespace-nowrap ${modelSpeechDetected ? 'opacity-100 text-sage-400' : 'opacity-0'}`}>Ashim Speaking</span>
           </div>
        </div>

        {/* TRANSCRIPTION TAPE */}
        <div className="w-full flex flex-col gap-4 max-h-48 overflow-y-auto custom-scrollbar p-4 bg-white/5 rounded-[32px] border border-white/5">
           {lastUserTranscript && (
             <div className="flex flex-col gap-1 items-end animate-fade-in">
                <span className="text-[8px] font-bold uppercase tracking-widest opacity-30 text-white">You</span>
                <p className="text-sm text-white/80 italic text-right">"{lastUserTranscript}..."</p>
             </div>
           )}
           {lastModelTranscript && (
             <div className="flex flex-col gap-1 items-start animate-fade-in">
                <span className="text-[8px] font-bold uppercase tracking-widest opacity-30 text-sage-400">Ashim</span>
                <p className="text-sm text-sage-400 italic">"{lastModelTranscript}..."</p>
             </div>
           )}
           {!lastUserTranscript && !lastModelTranscript && (
              <div className="h-full flex items-center justify-center py-8 opacity-20 italic text-sm text-white">
                 Duet protocol active. Speak naturally.
              </div>
           )}
        </div>
      </div>

      {/* CONTROLS */}
      <div className="flex items-center gap-8 mb-12">
        <button 
          onClick={isActive ? stopActiveSession : startContinuum}
          disabled={isConnecting}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 relative group
            ${isActive ? 'bg-white text-black' : 'bg-sage-500 text-white shadow-2xl shadow-sage-500/40'}
            ${isConnecting ? 'opacity-50 cursor-wait' : 'hover:scale-110 active:scale-95'}
          `}
        >
          {isConnecting ? <Loader2 size={32} className="animate-spin" /> : isActive ? <MicOff size={32} /> : <Mic size={32} />}
          
          {/* Pulse Ring */}
          {!isActive && !isConnecting && (
            <div className="absolute inset-0 rounded-full border-2 border-sage-500 animate-ping opacity-20 pointer-events-none" />
          )}
        </button>

        <div className="flex flex-col">
           <span className="text-xs font-bold text-white uppercase tracking-widest">Duet Mode</span>
           <span className="text-[10px] text-white/40 uppercase tracking-tight">Interruption Protocol: Enabled</span>
        </div>
      </div>

    </div>
  );
};

export default VoiceContinuum;
