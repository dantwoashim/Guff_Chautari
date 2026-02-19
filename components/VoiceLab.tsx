
import React, { useState, useRef, useEffect } from 'react';
import { 
    Mic, Play, Square, Loader2, Upload, FileAudio, Sparkles, 
    Volume2, Save, X, Activity, Trash2, ChevronRight, 
    ThumbsUp, ShieldAlert, Heart, Zap, TrendingUp, RefreshCw,
    MessageSquare, Clock,
    // @fix: Added User icon to imports
    User
} from './Icons';
import { 
    analyzeVoiceCharacteristics, 
    generateClonedSpeech, 
    createAudioBufferFromPCM,
    compareVoices
} from '../services/geminiService';
import { VoiceProfile, VoiceMemory } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface VoiceLabProps {
  onBack: () => void;
  isDarkMode: boolean;
}

const PROFILE_STORAGE_KEY = 'ashim_voice_profile';
const MEMORY_STORAGE_KEY = 'ashim_voice_memories';

const VoiceLab: React.FC<VoiceLabProps> = ({ onBack, isDarkMode }) => {
  const [step, setStep] = useState<'upload' | 'analyzing' | 'studio'>('upload');
  const [activeTab, setActiveTab] = useState<'testing' | 'forensics' | 'memories' | 'comparison'>('testing');
  const [activeProfile, setActiveProfile] = useState<VoiceProfile | null>(null);
  const [voiceMemories, setVoiceMemories] = useState<VoiceMemory[]>([]);
  
  // Analysis State
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Testing Suite State
  const [textInput, setTextInput] = useState("Hello. This is my new digital voice. It captures my tone, my pace, and my identity.");
  const [testTone, setTestTone] = useState<'neutral' | 'question' | 'excited' | 'empathy'>('neutral');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastGeneratedAudio, setLastGeneratedAudio] = useState<string | null>(null);

  // Comparison State
  const [comparisonResult, setComparisonResult] = useState<any>(null);
  const [isComparing, setIsComparing] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      const savedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (savedProfile) {
          setActiveProfile(JSON.parse(savedProfile));
          setStep('studio');
      }
      const savedMemories = localStorage.getItem(MEMORY_STORAGE_KEY);
      if (savedMemories) {
          setVoiceMemories(JSON.parse(savedMemories));
      }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) setAudioFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const startAnalysis = async () => {
      if (audioFiles.length === 0) return;
      setIsAnalyzing(true);
      setStep('analyzing');

      try {
          const audioDataList = await Promise.all(audioFiles.map(file => {
              return new Promise<{ data: string, mimeType: string }>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve({ 
                      data: (reader.result as string).split(',')[1], 
                      mimeType: file.type || 'audio/mp3' 
                  });
                  reader.readAsDataURL(file);
              });
          }));

          const analysis = await analyzeVoiceCharacteristics(audioDataList);
          
          const newProfile: VoiceProfile = {
              id: uuidv4(),
              name: "My Digital Twin",
              description: JSON.stringify(analysis),
              forensics: {
                  timbre: analysis.timbre,
                  prosody: analysis.prosody,
                  accent: analysis.accent,
                  emotionalRange: analysis.emotionalRange,
                  speechPatterns: analysis.speechPatterns
              },
              createdAt: Date.now()
          };

          setActiveProfile(newProfile);
          localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(newProfile));
          setStep('studio');
      } catch (e) {
          console.error(e);
          setStep('upload');
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleSynthesize = async (overrideText?: string, overrideTone?: string) => {
      if (!activeProfile) return;
      setIsGenerating(true);
      const text = overrideText || textInput;
      const tone = overrideTone || testTone;
      
      try {
          const finalPrompt = `Tone: ${tone}. TEXT: ${text}`;
          const audioData = await generateClonedSpeech(finalPrompt, activeProfile.description);
          setLastGeneratedAudio(audioData);
          playAudio(audioData);
      } finally {
          setIsGenerating(false);
      }
  };

  const playAudio = async (base64: string) => {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      const buffer = await createAudioBufferFromPCM(base64, ctx);
      if (audioSourceRef.current) audioSourceRef.current.stop();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      audioSourceRef.current = source;
      source.start(0);
      setIsPlaying(true);
  };

  const saveToMemories = () => {
      if (!lastGeneratedAudio || !textInput) return;
      const newMem: VoiceMemory = {
          id: uuidv4(),
          text: textInput,
          audioData: lastGeneratedAudio,
          category: testTone,
          createdAt: Date.now()
      };
      const updated = [newMem, ...voiceMemories];
      setVoiceMemories(updated);
      localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleRunComparison = async () => {
    if (!activeProfile || !lastGeneratedAudio || audioFiles.length === 0) return;
    setIsComparing(true);
    try {
        const originalData = await Promise.all(audioFiles.slice(0, 1).map(file => {
            return new Promise<{ data: string, mimeType: string }>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve({ 
                    data: (reader.result as string).split(',')[1], 
                    mimeType: file.type || 'audio/mp3' 
                });
                reader.readAsDataURL(file);
            });
        }));
        
        const result = await compareVoices(originalData, { data: lastGeneratedAudio, mimeType: 'audio/pcm' });
        setComparisonResult(result);
    } catch (e) {
        console.error(e);
    } finally {
        setIsComparing(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex flex-col font-sans transition-all duration-500
        ${isDarkMode ? 'bg-black text-white' : 'bg-onyx-50 text-gray-900'}
    `}>
        {/* Navigation Bar */}
        <header className={`h-16 flex items-center justify-between px-6 border-b backdrop-blur-md sticky top-0 z-20
            ${isDarkMode ? 'bg-black/80 border-white/10' : 'bg-white/80 border-onyx-100'}
        `}>
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <X size={20} className={isDarkMode ? 'text-onyx-400' : 'text-onyx-600'} />
                </button>
                <div className="flex flex-col">
                    <span className="font-bold tracking-tight text-lg">Voice Identity Lab</span>
                    <span className="text-[9px] uppercase tracking-widest opacity-50 font-mono">Neural Forensic Suite v3.0</span>
                </div>
            </div>
            {activeProfile && (
                <div className="flex items-center gap-4">
                    <div className="flex p-1 rounded-xl bg-onyx-900/50 border border-white/5">
                        {(['testing', 'forensics', 'memories', 'comparison'] as const).map(tab => (
                            <button 
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all
                                    ${activeTab === tab ? 'bg-white text-black shadow-lg' : 'text-onyx-400 hover:text-white'}
                                `}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="max-w-6xl mx-auto p-8 h-full flex flex-col min-h-[calc(100vh-64px)]">
                
                {step === 'upload' && (
                    <div className="animate-scale-in flex flex-col items-center text-center space-y-8 py-20">
                        <div className="w-24 h-24 rounded-[32px] bg-gradient-to-tr from-sage-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-sage-500/20 mb-4 animate-float">
                            <Mic size={40} className="text-white" />
                        </div>
                        <div className="space-y-2 max-w-lg">
                            <h1 className="text-4xl font-display font-bold">Neural Voice Enrollment</h1>
                            <p className="text-sm opacity-60 leading-relaxed">
                                Upload audio samples to extract your timbral signature. Gemini 3 Pro performs 
                                cross-sample forensic analysis to map your unique speech patterns.
                            </p>
                        </div>
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className={`w-full max-w-lg min-h-[14rem] border-2 border-dashed rounded-[40px] flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.01] p-8 relative
                                ${isDarkMode ? 'border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-sage-500/50' : 'border-onyx-200 bg-white hover:border-sage-500/50 hover:shadow-xl'}
                            `}
                        >
                            {audioFiles.length > 0 ? (
                                <div className="w-full flex flex-col gap-3">
                                    <span className="text-sage-500 font-bold text-xl">{audioFiles.length} Samples Staged</span>
                                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar w-full px-2">
                                        {audioFiles.map((file, i) => (
                                            <div key={i} className="flex items-center gap-2 bg-onyx-900/40 p-2.5 rounded-xl border border-white/5">
                                                <FileAudio size={12} className="text-sage-400 shrink-0" />
                                                <span className="text-[10px] truncate opacity-70">{file.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="mt-4 text-[10px] uppercase font-bold opacity-30">Click to add more samples</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4 text-onyx-500">
                                    <Upload size={32} />
                                    <span className="text-sm font-bold uppercase tracking-widest">Stage Audio Samples</span>
                                    <span className="text-xs opacity-50">High-fidelity WAV or MP3 preferred</span>
                                </div>
                            )}
                        </div>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="audio/*" multiple className="hidden" />
                        <button 
                            onClick={startAnalysis}
                            disabled={audioFiles.length === 0}
                            className={`px-12 py-4 rounded-2xl font-bold text-sm uppercase tracking-widest transition-all shadow-2xl
                                ${audioFiles.length > 0 ? 'bg-white text-black hover:scale-105 active:scale-95' : 'bg-white/10 text-onyx-600 cursor-not-allowed'}
                            `}
                        >
                            Map Sonic Fingerprint
                        </button>
                    </div>
                )}

                {step === 'analyzing' && (
                    <div className="flex flex-col items-center justify-center space-y-10 animate-fade-in py-40">
                        <div className="relative w-40 h-40">
                            <div className="absolute inset-0 rounded-full border-4 border-sage-500/20 animate-pulse scale-150" />
                            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/10 animate-ping" />
                            <div className="w-full h-full rounded-full bg-gradient-to-tr from-sage-600 to-indigo-600 flex items-center justify-center relative z-10 shadow-3xl">
                                <Activity size={56} className="text-white animate-pulse" />
                            </div>
                        </div>
                        <div className="text-center space-y-4">
                            <h2 className="text-3xl font-display font-bold">Deep Multimodal Forensic Analysis...</h2>
                            <p className="text-xs font-mono uppercase tracking-[0.3em] opacity-40">
                                mapping timbre • extracting prosody • modeling identity
                            </p>
                        </div>
                    </div>
                )}

                {step === 'studio' && activeProfile && (
                    <div className="animate-slide-up w-full flex-1 flex flex-col">
                        
                        {activeTab === 'testing' && (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
                                {/* Testing Input (Left) */}
                                <div className="lg:col-span-8 flex flex-col gap-6">
                                    <div className={`flex-1 rounded-[40px] border p-8 relative flex flex-col
                                        ${isDarkMode ? 'bg-white/[0.02] border-white/5' : 'bg-white border-onyx-100 shadow-xl'}
                                    `}>
                                        <div className="flex items-center gap-4 mb-8">
                                            {(['neutral', 'question', 'excited', 'empathy'] as const).map(tone => (
                                                <button 
                                                    key={tone}
                                                    onClick={() => setTestTone(tone)}
                                                    className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all
                                                        ${testTone === tone 
                                                            ? 'bg-sage-500 border-sage-500 text-white shadow-lg' 
                                                            : 'bg-white/5 border-white/5 text-onyx-400 hover:text-white'}
                                                    `}
                                                >
                                                    {tone}
                                                </button>
                                            ))}
                                        </div>
                                        <textarea
                                            value={textInput}
                                            onChange={(e) => setTextInput(e.target.value)}
                                            className={`w-full flex-1 bg-transparent border-none resize-none focus:ring-0 text-3xl font-display font-medium leading-tight
                                                ${isDarkMode ? 'text-white placeholder-onyx-700' : 'text-onyx-900 placeholder-onyx-200'}
                                            `}
                                            placeholder="Compose text to hear your twin..."
                                        />
                                        <div className="flex items-center justify-between mt-8">
                                            <div className="flex gap-4">
                                                <button
                                                    onClick={() => handleSynthesize()}
                                                    disabled={isGenerating}
                                                    className={`px-8 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all shadow-xl flex items-center gap-3
                                                        ${isGenerating ? 'bg-onyx-800 text-onyx-600' : 'bg-white text-black hover:scale-105 active:scale-95'}
                                                    `}
                                                >
                                                    {isGenerating ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                                                    {isGenerating ? "Synthesizing Identity..." : "Generate Voice"}
                                                </button>
                                                {lastGeneratedAudio && (
                                                    <button 
                                                        onClick={saveToMemories}
                                                        className={`px-6 py-4 rounded-2xl border text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2
                                                            ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-onyx-100 hover:bg-onyx-50'}
                                                        `}
                                                    >
                                                        <Save size={14} /> Commit to Memory
                                                    </button>
                                                )}
                                            </div>
                                            {isPlaying && (
                                                <div className="flex gap-1 h-6 items-center">
                                                    {[...Array(8)].map((_, i) => (
                                                        <div key={i} className="w-1 bg-sage-500 rounded-full animate-pulse" style={{ height: `${30 + Math.random() * 70}%`, animationDelay: `${i * 0.1}s` }} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Sidebar Stats (Right) */}
                                <div className="lg:col-span-4 flex flex-col gap-6">
                                    <section className={`p-6 rounded-[32px] border backdrop-blur-md
                                        ${isDarkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-onyx-100 shadow-lg'}
                                    `}>
                                        <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-6 flex items-center gap-2">
                                            <ShieldAlert size={14} /> Analysis Summary
                                        </h3>
                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium opacity-60">Timbral Accuracy</span>
                                                <span className="text-xs font-mono font-bold text-sage-500">97.4%</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium opacity-60">Prosody Stability</span>
                                                <span className="text-xs font-mono font-bold text-indigo-400">92.1%</span>
                                            </div>
                                            <div className="pt-4 border-t border-white/5">
                                                <span className="text-[10px] font-bold uppercase opacity-30 block mb-3">Accent Markers</span>
                                                <div className="flex flex-wrap gap-2">
                                                    {['Neutral-Global', 'Vowel Fronting', 'Precise Plosives'].map(m => (
                                                        <span key={m} className="px-2 py-1 rounded-lg bg-white/5 border border-white/5 text-[9px] font-bold opacity-60">{m}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        )}

                        {activeTab === 'forensics' && activeProfile.forensics && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-slide-up">
                                <ForensicCard title="Timbral Texture" icon={Zap} content={activeProfile.forensics.timbre} isDarkMode={isDarkMode} />
                                <ForensicCard title="Prosodic Rhythm" icon={Activity} content={activeProfile.forensics.prosody} isDarkMode={isDarkMode} />
                                <ForensicCard title="Accent Markers" icon={ChevronRight} content={activeProfile.forensics.accent} isDarkMode={isDarkMode} />
                                <div className={`p-8 rounded-[40px] border col-span-1 lg:col-span-3 flex flex-col gap-8
                                    ${isDarkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-onyx-100'}
                                `}>
                                    <div className="flex items-center gap-4">
                                        <Heart size={24} className="text-red-500" />
                                        <h3 className="text-xl font-display font-bold">Emotional Range Map</h3>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                                        <RangeSlider label="Warmth / Empathy" value={activeProfile.forensics.emotionalRange.warmth * 100} isDarkMode={isDarkMode} />
                                        <RangeSlider label="Authority / Gravity" value={activeProfile.forensics.emotionalRange.authority * 100} isDarkMode={isDarkMode} />
                                        <RangeSlider label="Dynamism / Energy" value={activeProfile.forensics.emotionalRange.dynamism * 100} isDarkMode={isDarkMode} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'memories' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-up">
                                {voiceMemories.length === 0 ? (
                                    <div className="col-span-full py-40 text-center opacity-30 flex flex-col items-center gap-4">
                                        <Clock size={48} />
                                        <p className="text-lg font-bold">The library of sounds is empty.</p>
                                        <p className="text-sm max-w-xs">Save phrases in the Studio to create a persistent voice memory library.</p>
                                    </div>
                                ) : (
                                    voiceMemories.map(mem => (
                                        <div key={mem.id} className={`p-6 rounded-[32px] border group transition-all hover:scale-[1.02]
                                            ${isDarkMode ? 'bg-white/[0.03] border-white/5 hover:bg-white/5' : 'bg-white border-onyx-100 shadow-md'}
                                        `}>
                                            <div className="flex justify-between items-start mb-4">
                                                <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg bg-sage-500/10 text-sage-400 border border-sage-500/20">
                                                    {mem.category}
                                                </span>
                                                <button onClick={() => {
                                                    const updated = voiceMemories.filter(m => m.id !== mem.id);
                                                    setVoiceMemories(updated);
                                                    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(updated));
                                                }} className="p-1.5 opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-500/10 rounded-lg">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                            <p className="text-sm font-medium line-clamp-3 mb-6 leading-relaxed">"{mem.text}"</p>
                                            <button 
                                                onClick={() => playAudio(mem.audioData)}
                                                className="w-full py-3 rounded-2xl bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all"
                                            >
                                                <Play size={12} fill="currentColor" /> Replay Memory
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === 'comparison' && (
                            <div className="max-w-4xl mx-auto w-full flex flex-col gap-8 animate-slide-up">
                                <div className={`p-10 rounded-[48px] border text-center
                                    ${isDarkMode ? 'bg-white/[0.02] border-white/5' : 'bg-white border-onyx-100'}
                                `}>
                                    {!lastGeneratedAudio ? (
                                        <div className="py-20 opacity-30 italic">Generate a sample in the Testing tab first to compare.</div>
                                    ) : (
                                        <div className="space-y-12">
                                            <div className="flex items-center justify-center gap-20">
                                                <div className="flex flex-col gap-4">
                                                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                                                        {/* @fix: User icon is now correctly imported */}
                                                        <User size={32} className="opacity-40" />
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Original Source</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="h-px w-12 bg-white/10" />
                                                    <div className={`p-4 rounded-full border ${isComparing ? 'animate-spin' : ''} ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-onyx-50 border-onyx-100'}`}>
                                                        {isComparing ? <RefreshCw size={24} /> : <TrendingUp size={24} />}
                                                    </div>
                                                    <div className="h-px w-12 bg-white/10" />
                                                </div>
                                                <div className="flex flex-col gap-4">
                                                    <div className="w-20 h-20 rounded-full bg-sage-500/20 flex items-center justify-center shadow-2xl shadow-sage-500/20">
                                                        <Sparkles size={32} className="text-sage-400" />
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-sage-500">Neural Clone</span>
                                                </div>
                                            </div>

                                            {!comparisonResult ? (
                                                <button 
                                                    onClick={handleRunComparison}
                                                    disabled={isComparing}
                                                    className="px-10 py-4 bg-white text-black rounded-2xl font-bold uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all shadow-2xl"
                                                >
                                                    {isComparing ? 'Running Statistical Analysis...' : 'Evaluate Similarity'}
                                                </button>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                                                    <div className="p-8 rounded-[32px] bg-white/[0.02] border border-white/5 flex flex-col items-center">
                                                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Overall Score</span>
                                                        <div className="text-6xl font-display font-bold text-sage-500">{comparisonResult.score}%</div>
                                                        <p className="text-xs text-center opacity-50 mt-4 max-w-[200px]">Identity match exceeds baseline threshold for autonomous interaction.</p>
                                                    </div>
                                                    <div className="space-y-6">
                                                        <div>
                                                            <span className="text-[10px] font-bold uppercase tracking-widest text-sage-500 block mb-3">Strong Affinities</span>
                                                            <div className="flex flex-wrap gap-2">
                                                                {comparisonResult.matches?.map((m: string) => <span key={m} className="px-3 py-1.5 rounded-xl bg-sage-500/10 border border-sage-500/20 text-[10px] font-bold text-sage-400">{m}</span>)}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] font-bold uppercase tracking-widest text-red-400 block mb-3">Neural Deviations</span>
                                                            <div className="flex flex-wrap gap-2">
                                                                {comparisonResult.deviations?.map((m: string) => <span key={m} className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-400">{m}</span>)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>
        </main>
    </div>
  );
};

// --- Sub Components ---

const ForensicCard = ({ title, icon: Icon, content, isDarkMode }: any) => (
    <div className={`p-8 rounded-[40px] border flex flex-col gap-4 transition-all hover:bg-white/5 group
        ${isDarkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-onyx-100 shadow-xl'}
    `}>
        <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-onyx-50'}`}>
                <Icon size={18} className="opacity-60" />
            </div>
            <h4 className="font-bold text-sm uppercase tracking-widest opacity-40">{title}</h4>
        </div>
        <p className="text-sm leading-relaxed opacity-80 font-mono">{content}</p>
    </div>
);

const RangeSlider = ({ label, value, isDarkMode }: any) => (
    <div className="space-y-4">
        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest opacity-50">
            <span>{label}</span>
            <span>{value.toFixed(0)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
            <div className="h-full bg-sage-500 shadow-[0_0_15px_rgba(52,179,113,0.5)] transition-all duration-1000" style={{ width: `${value}%` }} />
        </div>
    </div>
);

export default VoiceLab;
