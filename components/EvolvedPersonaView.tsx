
import React, { useState } from 'react';
import { 
  InferredPersona, 
  StyleMetrics, 
  EmotionalPattern, 
  InterestNode, 
  DecisionPattern 
} from '../types';
import { 
  User, 
  Brain, 
  Activity, 
  Zap, 
  Download, 
  RotateCcw, 
  MessageSquare, 
  TrendingUp, 
  TrendingDown, 
  Heart, 
  ChevronRight,
  ShieldAlert,
  ChevronDown,
  Edit3,
  Check
} from './Icons';

interface EvolvedPersonaViewProps {
  persona: InferredPersona;
  onCorrect: (field: string, value: any) => void;
  onReset: () => void;
  onExport: () => void;
  isDarkMode: boolean;
}

const EvolvedPersonaView: React.FC<EvolvedPersonaViewProps> = ({ 
  persona, 
  onCorrect, 
  onReset, 
  onExport, 
  isDarkMode 
}) => {
  const [editingField, setEditingField] = useState<string | null>(null);

  return (
    <div className={`flex flex-col gap-8 p-6 max-w-5xl mx-auto animate-fade-in font-sans
      ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}
    `}>
      {/* HEADER SECTION */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-white/10">
        <div className="flex items-center gap-5">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105
            ${isDarkMode ? 'bg-sage-500/10 text-sage-400 border border-sage-500/20' : 'bg-sage-50 text-sage-600 border border-sage-100'}
          `}>
            <User size={32} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-3xl font-display font-bold tracking-tight">
              {persona.name || 'Anonymous Entity'}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1
                ${isDarkMode ? 'bg-sage-500/20 text-sage-400' : 'bg-sage-100 text-sage-700'}
              `}>
                <Check size={10} /> Inferred Profile
              </span>
              <span className="text-xs opacity-50 font-mono">
                Confidence: {(persona.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={onExport}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'}
            `}
          >
            <Download size={16} /> Export DNA
          </button>
          <button 
            onClick={onReset}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${isDarkMode ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'}
            `}
          >
            <RotateCcw size={16} /> Reset Inference
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* COMMUNICATION STYLE */}
        <section className={`p-6 rounded-3xl border animate-slide-up
          ${isDarkMode ? 'bg-white/[0.02] border-white/5 shadow-inner' : 'bg-white border-gray-100 shadow-xl'}
        `}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                <MessageSquare size={18} />
              </div>
              <h3 className="text-lg font-display font-bold">Communication Style</h3>
            </div>
            <button className="text-xs font-bold uppercase tracking-widest text-sage-500 hover:text-sage-400 transition-colors">
              Correct This
            </button>
          </div>

          <div className="space-y-6">
            <StyleMetric 
              label="Technical" 
              value={persona.communicationStyle.technical} 
              isDarkMode={isDarkMode} 
              onChange={(v) => onCorrect('communicationStyle.technical', v)}
            />
            <StyleMetric 
              label="Casual" 
              value={persona.communicationStyle.casual} 
              isDarkMode={isDarkMode}
              onChange={(v) => onCorrect('communicationStyle.casual', v)}
            />
            <StyleMetric 
              label="Analytical" 
              value={persona.communicationStyle.analytical} 
              isDarkMode={isDarkMode}
              onChange={(v) => onCorrect('communicationStyle.analytical', v)}
            />
            <StyleMetric 
              label="Creative" 
              value={persona.communicationStyle.creative} 
              isDarkMode={isDarkMode}
              onChange={(v) => onCorrect('communicationStyle.creative', v)}
            />
            <StyleMetric 
              label="Empathetic" 
              value={persona.communicationStyle.empathetic} 
              isDarkMode={isDarkMode}
              onChange={(v) => onCorrect('communicationStyle.empathetic', v)}
            />
          </div>
        </section>

        {/* EMOTIONAL PATTERNS */}
        <section className={`p-6 rounded-3xl border animate-slide-up
          ${isDarkMode ? 'bg-white/[0.02] border-white/5 shadow-inner' : 'bg-white border-gray-100 shadow-xl'}
        `}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
                <Activity size={18} />
              </div>
              <h3 className="text-lg font-display font-bold">Emotional Patterns</h3>
            </div>
            <ShieldAlert size={16} className="opacity-20" />
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-end mb-4">
              <span className="text-xs font-bold uppercase tracking-widest opacity-50">Mood Cycle Heatmap</span>
              <span className="text-[10px] opacity-40">Time (Horizontal) x Intensity (Vertical)</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {[...Array(28)].map((_, i) => (
                <div 
                  key={i} 
                  className={`aspect-square rounded-[4px] transition-all duration-500
                    ${isDarkMode ? 'bg-white/[0.05]' : 'bg-gray-100'}
                  `}
                  style={{ 
                    backgroundColor: i % 5 === 0 ? 'rgba(52, 179, 113, 0.4)' : undefined,
                    opacity: 0.3 + (Math.random() * 0.7)
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-2 text-[8px] font-bold uppercase tracking-widest opacity-40">
              <span>Monday</span>
              <span>Sunday</span>
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest opacity-50 block mb-2">Inferred Triggers</span>
            <div className="flex flex-wrap gap-2">
              {['Tight Deadlines', 'Ambiguous Requirements', 'Late Night Coding', 'AI Ethics'].map(trigger => (
                <div key={trigger} className={`px-3 py-1.5 rounded-lg text-xs font-medium border
                  ${isDarkMode ? 'bg-white/5 border-white/5 text-gray-400' : 'bg-gray-50 border-gray-100 text-gray-600'}
                `}>
                  {trigger}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* INTEREST GRAVITY WELLS */}
        <section className={`p-6 rounded-3xl border lg:col-span-2 animate-slide-up
          ${isDarkMode ? 'bg-white/[0.02] border-white/5 shadow-inner' : 'bg-white border-gray-100 shadow-xl'}
        `}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                <Zap size={18} />
              </div>
              <h3 className="text-lg font-display font-bold">Interest Gravity Wells</h3>
            </div>
            <TrendingUp size={16} className="text-sage-500" />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 p-4">
            {persona.interestGraph.map((interest, i) => (
              <GravityWell 
                key={interest.topic} 
                interest={interest} 
                isDarkMode={isDarkMode} 
                index={i}
              />
            ))}
            {persona.interestGraph.length === 0 && (
                <div className="py-12 text-center opacity-40 text-sm italic">
                    No significant gravity wells identified yet. Keep interacting.
                </div>
            )}
          </div>
        </section>

        {/* DECISION PATTERNS */}
        <section className={`p-6 rounded-3xl border lg:col-span-2 animate-slide-up
          ${isDarkMode ? 'bg-white/[0.02] border-white/5 shadow-inner' : 'bg-white border-gray-100 shadow-xl'}
        `}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                <Brain size={18} />
              </div>
              <h3 className="text-lg font-display font-bold">Heuristic Decision Patterns</h3>
            </div>
            <Edit3 size={16} className="opacity-20" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {persona.decisionPatterns.map((pattern) => (
              <DecisionCard 
                key={pattern.category} 
                pattern={pattern} 
                isDarkMode={isDarkMode} 
              />
            ))}
            {persona.decisionPatterns.length === 0 && (
                <div className="col-span-2 py-8 text-center opacity-40 text-sm italic">
                    Pattern recognition in progress...
                </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

// --- SUB-COMPONENTS ---

const StyleMetric: React.FC<{ label: string, value: number, isDarkMode: boolean, onChange: (v: number) => void }> = ({ label, value, isDarkMode, onChange }) => {
  const color = value > 75 ? 'bg-sage-500' : value > 40 ? 'bg-blue-400' : 'bg-gray-400';
  
  return (
    <div className="space-y-2 group">
      <div className="flex justify-between items-center">
        <span className={`text-sm font-semibold tracking-wide ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{label}</span>
        <span className="text-xs font-mono opacity-50">{value}%</span>
      </div>
      <div className={`h-2.5 w-full rounded-full overflow-hidden cursor-pointer relative
        ${isDarkMode ? 'bg-white/5' : 'bg-gray-100'}
      `} onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = Math.round(((e.clientX - rect.left) / rect.width) * 100);
        onChange(Math.min(Math.max(percent, 0), 100));
      }}>
        <div 
          className={`h-full transition-all duration-1000 ease-out rounded-full ${color} shadow-[0_0_10px_rgba(52,179,113,0.3)]`}
          style={{ width: `${value}%` }}
        />
        {/* Invisible larger hit area for slider */}
        <div className="absolute inset-0 opacity-0 hover:opacity-10 transition-opacity bg-white" />
      </div>
    </div>
  );
};

const GravityWell: React.FC<{ interest: InterestNode, isDarkMode: boolean, index: number }> = ({ interest, isDarkMode, index }) => {
  // Size based on frequency, background color based on attraction
  const size = 60 + (interest.frequency * 8); // Scale
  const attractionColor = interest.attraction > 0 
    ? (isDarkMode ? 'rgba(52, 179, 113,' : 'rgba(52, 179, 113,')
    : (isDarkMode ? 'rgba(239, 68, 68,' : 'rgba(239, 68, 68,');
  
  const opacity = 0.05 + (Math.abs(interest.attraction) * 0.3);

  return (
    <div 
      className={`relative rounded-full flex items-center justify-center text-center p-4 transition-all duration-500 hover:scale-110 cursor-pointer border group
        ${isDarkMode ? 'border-white/5 shadow-2xl' : 'border-gray-100 shadow-lg'}
      `}
      style={{ 
        width: size, 
        height: size, 
        backgroundColor: `${attractionColor} ${opacity})`,
        animationDelay: `${index * 100}ms`
      }}
    >
      <div className="flex flex-col items-center">
        <span className={`font-bold tracking-tight leading-tight transition-all
          ${interest.frequency > 5 ? 'text-sm' : 'text-[10px]'}
          ${isDarkMode ? 'text-white' : 'text-gray-900'}
        `}>
          {interest.topic}
        </span>
        <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
           {interest.attraction > 0 ? <TrendingUp size={8} className="text-sage-500" /> : <TrendingDown size={8} className="text-red-500" />}
           <span className="text-[8px] font-mono">{(interest.attraction * 100).toFixed(0)}</span>
        </div>
      </div>
      
      {/* Halo effect */}
      <div className="absolute inset-[-4px] rounded-full border border-white/5 opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100" />
    </div>
  );
};

const DecisionCard: React.FC<{ pattern: DecisionPattern, isDarkMode: boolean }> = ({ pattern, isDarkMode }) => {
  return (
    <div className={`p-4 rounded-2xl border transition-all hover:border-sage-500/30 group
      ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-100'}
    `}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest
            ${isDarkMode ? 'bg-white/10 text-gray-400' : 'bg-white text-gray-500 border border-gray-100'}
          `}>
            {pattern.category}
          </div>
          <span className={`text-xs font-semibold ${isDarkMode ? 'text-sage-400' : 'text-sage-600'}`}>
            {pattern.style}
          </span>
        </div>
        <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0" />
      </div>
      
      <div className="space-y-2">
        {pattern.examples.map((example, i) => (
          <p key={i} className="text-[11px] leading-relaxed italic opacity-60 line-clamp-2">
            "{example}"
          </p>
        ))}
      </div>
    </div>
  );
};

export default EvolvedPersonaView;
