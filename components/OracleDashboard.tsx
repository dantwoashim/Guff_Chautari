
import React, { useState, useEffect } from 'react';
import { 
  Prediction, 
  PreemptiveAction, 
  PredictionType 
} from '../types';
import { oracleService } from '../services/oracleService';
import { 
  Sparkles, 
  Target, 
  Smile, 
  Lightbulb, 
  ShieldAlert, 
  Check, 
  X, 
  ChevronRight, 
  Loader2, 
  Eye, 
  Clock, 
  RefreshCw, 
  Activity, 
  ChevronLeft,
  TrendingUp,
  ThumbsUp,
  ThumbsDown
} from './Icons';

interface OracleDashboardProps {
  userId: string;
  onClose: () => void;
  isDarkMode: boolean;
  onStartConversation?: (starter: string) => void;
}

const TYPE_CONFIG: Record<PredictionType, { icon: any, color: string, label: string }> = {
  topic: { icon: Target, color: 'text-blue-400', label: 'Topic Forecast' },
  mood: { icon: Smile, color: 'text-amber-400', label: 'Emotional Trajectory' },
  need: { icon: Lightbulb, color: 'text-sage-400', label: 'Proactive Need' },
  decision: { icon: ShieldAlert, color: 'text-purple-400', label: 'Avoidance Pattern' }
};

const OracleDashboard: React.FC<OracleDashboardProps> = ({ userId, onClose, isDarkMode, onStartConversation }) => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [actions, setActions] = useState<PreemptiveAction[]>([]);
  const [accuracy, setAccuracy] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    loadOracleData();
  }, [userId]);

  const loadOracleData = async () => {
    setIsLoading(true);
    try {
      const [predData, accData] = await Promise.all([
        oracleService.getPredictions(userId),
        oracleService.getAccuracyScore(userId)
      ]);
      setPredictions(predData);
      setAccuracy(accData);
      
      // Since actions are tied to predictions, we fetch them for currently active ones
      // In a real app, this might be a separate service call
      // For this implementation, we simulate fetching recent actions
    } catch (e) {
      console.error("Oracle data load failed", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const newPreds = await oracleService.generatePredictions(userId);
      setPredictions(newPreds);
    } finally {
      setIsGenerating(true);
      // Briefly show loading before refresh
      setTimeout(() => {
          loadOracleData();
          setIsGenerating(false);
      }, 1000);
    }
  };

  const handleValidate = async (id: string, accurate: boolean) => {
      await oracleService.validatePrediction(id, accurate);
      setPredictions(prev => prev.filter(p => p.id !== id));
      // Refresh accuracy after validation
      const newAcc = await oracleService.getAccuracyScore(userId);
      setAccuracy(newAcc);
  };

  return (
    <div className={`fixed inset-0 z-[60] flex flex-col font-sans animate-fade-in
      ${isDarkMode ? 'bg-black text-gray-100' : 'bg-onyx-50 text-gray-900'}
    `}>
      {/* MYSTICAL BACKGROUND EFFECTS */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full blur-[160px] opacity-20 animate-pulse-slow
            ${isDarkMode ? 'bg-indigo-600' : 'bg-indigo-200'}
        `} />
        <div className={`absolute bottom-0 right-1/4 w-[600px] h-[600px] rounded-full blur-[120px] opacity-10 animate-aurora
            ${isDarkMode ? 'bg-sage-600' : 'bg-sage-200'}
        `} />
      </div>

      {/* NAVBAR */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-display font-bold tracking-tight">Oracle Protocol</h1>
              <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
            </div>
            <p className="text-[10px] opacity-50 uppercase tracking-[0.3em]">Predictive Cognitive Intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">System Accuracy</span>
            <div className="flex items-center gap-2">
               <TrendingUp size={14} className="text-sage-500" />
               <span className="text-xl font-mono font-bold text-sage-500">{accuracy.toFixed(0)}%</span>
            </div>
          </div>
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2
              ${isDarkMode ? 'bg-white text-black hover:bg-gray-200' : 'bg-onyx-900 text-white hover:bg-black'}
              ${isGenerating ? 'opacity-50 cursor-wait' : ''}
            `}
          >
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Synchronize
          </button>
        </div>
      </header>

      {/* CONTENT GRID */}
      <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* PREDICTIONS COLUMN (LEFT) */}
          <div className="lg:col-span-8 space-y-8">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] opacity-40 flex items-center gap-2">
                    <Eye size={14} /> Immediate Horizons
                </h2>
                <span className="text-[10px] opacity-30 font-mono italic">Next 24-48 Hours</span>
            </div>

            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center opacity-30">
                <Loader2 size={32} className="animate-spin mb-4" />
                <p className="font-mono text-sm tracking-widest">Consulting the latent patterns...</p>
              </div>
            ) : predictions.length === 0 ? (
              <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[32px] opacity-30">
                 <Sparkles size={48} className="mx-auto mb-4" />
                 <h3 className="text-lg font-bold">The Horizon is Clear</h3>
                 <p className="text-sm max-w-xs mx-auto mt-2">Interact more to generate enough entropy for the Oracle to stabilize.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {predictions.map((pred) => (
                  <PredictionCard 
                    key={pred.id} 
                    prediction={pred} 
                    onValidate={handleValidate}
                    isDarkMode={isDarkMode} 
                  />
                ))}
              </div>
            )}
          </div>

          {/* ACTIONS & RECOGNITION (RIGHT) */}
          <div className="lg:col-span-4 space-y-8">
            <section className={`p-6 rounded-[32px] border backdrop-blur-md
                ${isDarkMode ? 'bg-white/[0.03] border-white/5 shadow-2xl' : 'bg-white border-onyx-100 shadow-xl'}
            `}>
                <h3 className="text-xs font-bold uppercase tracking-widest opacity-40 mb-6 flex items-center gap-2">
                    <Activity size={14} /> Preemptive Readiness
                </h3>
                <div className="space-y-5">
                    {/* Simulated/Recent Actions */}
                    <ActionItem 
                        label="Fundraising Context" 
                        status="completed" 
                        desc="Prepared 5 term-sheet negotiation patterns."
                        isDarkMode={isDarkMode}
                    />
                    <ActionItem 
                        label="Tone Adaptation" 
                        status="completed" 
                        desc="Calibrated for empathetic morning greeting."
                        isDarkMode={isDarkMode}
                    />
                    <ActionItem 
                        label="Cognitive Prep" 
                        status="pending" 
                        desc="Synthesizing pitch practice questions..."
                        isDarkMode={isDarkMode}
                    />
                </div>
            </section>

            {/* SUGGESTED START */}
            <section className={`p-8 rounded-[32px] border relative overflow-hidden group
                ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100'}
            `}>
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Sparkles size={64} />
                </div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-4">Oracle Suggestion</h3>
                <p className={`text-lg font-display font-medium leading-relaxed mb-6 ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                    "I've prepared some thoughts on your pricing strategy. Would you like to walk through the potential friction points together?"
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => onStartConversation?.("Let's talk about that pricing strategy you prepared for.")}
                        className="flex-1 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/30 transition-all active:scale-95"
                    >
                        Accept Insight
                    </button>
                    <button className={`px-5 py-3 rounded-2xl border transition-all ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-onyx-200 hover:bg-white'}`}>
                        <X size={18} className="opacity-40" />
                    </button>
                </div>
            </section>
          </div>

        </div>
      </main>
    </div>
  );
};

// --- SUB-COMPONENTS ---

const PredictionCard: React.FC<{ 
  prediction: Prediction, 
  onValidate: (id: string, acc: boolean) => void,
  isDarkMode: boolean 
}> = ({ prediction, onValidate, isDarkMode }) => {
  const config = TYPE_CONFIG[prediction.type];
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`p-6 rounded-[32px] border transition-all duration-500 group
      ${isDarkMode ? 'bg-white/[0.03] border-white/5 hover:border-white/10' : 'bg-white border-onyx-100 hover:shadow-lg'}
    `} style={{ opacity: 0.4 + (prediction.confidence * 0.6) }}>
      
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-onyx-50'} ${config.color}`}>
            <config.icon size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest opacity-40">{config.label}</h4>
            <div className="flex items-center gap-2 mt-0.5">
               <div className="h-1 w-12 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full bg-current ${config.color}`} style={{ width: `${prediction.confidence * 100}%` }} />
               </div>
               <span className={`text-[10px] font-mono font-bold ${config.color}`}>{(prediction.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
        <span className="text-[9px] font-bold uppercase px-2 py-1 rounded-lg bg-white/5 opacity-40">{prediction.timeframe}</span>
      </div>

      <p className={`text-base font-medium leading-relaxed mb-6 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
        "{prediction.content}"
      </p>

      <div className="space-y-4">
        {isExpanded && (
            <div className="space-y-3 animate-slide-up">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-30">Pattern Evidence</span>
                <ul className="space-y-2">
                    {prediction.evidence.map((ev, i) => (
                        <li key={i} className="text-xs flex items-start gap-2 opacity-60 italic">
                            <div className="w-1 h-1 rounded-full bg-current mt-1.5 shrink-0" />
                            <span>{ev}</span>
                        </li>
                    ))}
                </ul>
            </div>
        )}

        <div className="pt-4 border-t border-white/5 flex items-center justify-between">
           <button 
             onClick={() => setIsExpanded(!isExpanded)}
             className="text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
           >
             {isExpanded ? 'Hide Patterns' : 'Examine Patterns'}
           </button>
           
           <div className="flex items-center gap-2">
              <button 
                onClick={() => onValidate(prediction.id, true)}
                className="p-1.5 rounded-lg hover:bg-sage-500/20 text-sage-500 transition-colors"
                title="This was accurate"
              >
                <ThumbsUp size={14} />
              </button>
              <button 
                onClick={() => onValidate(prediction.id, false)}
                className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                title="This was wrong"
              >
                <ThumbsDown size={14} />
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

const ActionItem: React.FC<{ 
    label: string, 
    status: 'completed' | 'pending' | 'failed', 
    desc: string,
    isDarkMode: boolean 
}> = ({ label, status, desc, isDarkMode }) => {
    return (
        <div className="flex items-start gap-4">
            <div className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center
                ${status === 'completed' ? 'bg-sage-500/20 text-sage-500' : 'bg-white/5 text-gray-500'}
            `}>
                {status === 'completed' ? <Check size={12} /> : status === 'pending' ? <RefreshCw size={10} className="animate-spin" /> : <X size={12} />}
            </div>
            <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-bold">{label}</span>
                    <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded
                        ${status === 'completed' ? 'bg-sage-500/10 text-sage-400' : 'bg-white/5 text-gray-500'}
                    `}>{status}</span>
                </div>
                <p className="text-[11px] opacity-50 leading-relaxed italic line-clamp-2">"{desc}"</p>
            </div>
        </div>
    );
};

export default OracleDashboard;
