
import React, { useState, useEffect } from 'react';
import { 
  Dream, 
  DreamArtifact, 
  DreamArtifactType 
} from '../types';
import { dreamEngine } from '../services/dreamService';
import { 
  X, 
  Moon, 
  Sparkles, 
  Image as ImageIcon, 
  Play, 
  Square, 
  Code, 
  FileText, 
  Trash2, 
  Share2, 
  Save, 
  Clock, 
  ChevronLeft, 
  Loader2,
  MessageSquare,
  Activity
} from './Icons';

interface DreamGalleryProps {
  userId: string;
  onClose: () => void;
  isDarkMode: boolean;
  onDiscussDream?: (dream: Dream) => void;
}

const DreamGallery: React.FC<DreamGalleryProps> = ({ userId, onClose, isDarkMode, onDiscussDream }) => {
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDream, setSelectedDream] = useState<Dream | null>(null);

  useEffect(() => {
    loadDreams();
  }, [userId]);

  const loadDreams = async () => {
    setIsLoading(true);
    try {
      const data = await dreamEngine.getDreamGallery(userId);
      setDreams(data);
    } catch (e) {
      console.error("Failed to load dreams", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("Banish this dream to oblivion?")) {
      await dreamEngine.deleteDream(id);
      setDreams(prev => prev.filter(d => d.id !== id));
      if (selectedDream?.id === id) setSelectedDream(null);
    }
  };

  return (
    <div className={`fixed inset-0 z-[60] flex flex-col font-sans animate-fade-in
      ${isDarkMode ? 'bg-onyx-950 text-gray-100' : 'bg-onyx-50 text-gray-900'}
    `}>
      {/* BACKGROUND DECO */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-sage-500/20 blur-[120px] rounded-full animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full animate-aurora" />
      </div>

      {/* HEADER */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-display font-bold tracking-tight">Ashim's Dreams</h1>
              <Sparkles size={18} className="text-sage-400 animate-pulse" />
            </div>
            <p className="text-xs opacity-50 uppercase tracking-[0.2em]">Autonomous Subconscious Generation</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10
            ${isDarkMode ? 'bg-white/5 text-sage-400' : 'bg-white text-sage-600'}
          `}>
            {dreams.length} Neuronal Snapshots
          </div>
        </div>
      </header>

      {/* GALLERY GRID */}
      <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-8">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <Loader2 className="animate-spin mb-4" size={32} />
            <p className="text-sm font-mono tracking-widest">Traversing Latent Space...</p>
          </div>
        ) : dreams.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto opacity-30">
            <Moon size={48} className="mb-6" />
            <h2 className="text-xl font-display font-bold">The Mind is Silent</h2>
            <p className="text-sm mt-2">Ashim dreams when you are away. Interact more to seed the next creative cycle.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {dreams.map((dream) => (
              <DreamCard 
                key={dream.id} 
                dream={dream} 
                isDarkMode={isDarkMode} 
                onClick={() => setSelectedDream(dream)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {/* DETAIL MODAL */}
      {selectedDream && (
        <DreamDetail 
          dream={selectedDream} 
          isDarkMode={isDarkMode} 
          onClose={() => setSelectedDream(null)} 
          onDelete={(e) => handleDelete(e, selectedDream.id)}
          onDiscuss={() => onDiscussDream && onDiscussDream(selectedDream)}
        />
      )}
    </div>
  );
};

// --- SUB-COMPONENTS ---

const DreamCard: React.FC<{ 
  dream: Dream, 
  isDarkMode: boolean, 
  onClick: () => void,
  onDelete: (e: React.MouseEvent, id: string) => void
}> = ({ dream, isDarkMode, onClick, onDelete }) => {
  const artifact = dream.artifacts[0];
  const Icon = artifact.type === 'image' ? ImageIcon : artifact.type === 'audio' ? Play : artifact.type === 'code' ? Code : FileText;

  return (
    <div 
      onClick={onClick}
      className={`group relative aspect-[4/5] rounded-[32px] overflow-hidden cursor-pointer border transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-sage-500/10
        ${isDarkMode ? 'bg-white/[0.03] border-white/5' : 'bg-white border-onyx-100 shadow-lg'}
      `}
    >
      {/* CARD CONTENT */}
      {artifact.type === 'image' ? (
        <div className="absolute inset-0">
          <img src={artifact.content} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="dream" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        </div>
      ) : (
        <div className={`absolute inset-0 flex flex-col p-8
          ${isDarkMode ? 'bg-gradient-to-br from-indigo-500/5 to-sage-500/5' : 'bg-gradient-to-br from-onyx-50 to-white'}
        `}>
          <div className="flex-1 flex items-center justify-center">
             <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-transform duration-500 group-hover:scale-110
               ${isDarkMode ? 'bg-white/5 text-sage-400' : 'bg-onyx-900 text-white'}
             `}>
               <Icon size={32} />
             </div>
          </div>
          {artifact.type === 'text' && (
            <p className="text-xs line-clamp-4 italic opacity-60 text-center font-serif leading-relaxed mb-12">
              "{artifact.content}"
            </p>
          )}
        </div>
      )}

      {/* CARD INFO OVERLAY */}
      <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50 flex items-center gap-1.5">
            <Clock size={10} /> {new Date(dream.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          <button 
            onClick={(e) => onDelete(e, dream.id)}
            className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
          >
            <Trash2 size={14} />
          </button>
        </div>
        <h3 className="text-lg font-display font-bold leading-tight line-clamp-2">
          {artifact.description}
        </h3>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {dream.themes.slice(0, 2).map(theme => (
            <span key={theme} className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/60">
              #{theme}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const DreamDetail = ({ dream, isDarkMode, onClose, onDelete, onDiscuss }: { 
  dream: Dream, 
  isDarkMode: boolean, 
  onClose: () => void,
  onDelete: (e: React.MouseEvent) => void,
  onDiscuss: () => void
}) => {
  const artifact = dream.artifacts[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-2xl bg-black/60 animate-fade-in">
      <div className={`relative w-full max-w-5xl h-[85vh] rounded-[40px] shadow-2xl border overflow-hidden flex flex-col animate-scale-in
        ${isDarkMode ? 'bg-onyx-950 border-white/10 shadow-black/50' : 'bg-white border-onyx-100 shadow-xl'}
      `}>
        {/* CLOSE BUTTON */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-20 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
        >
          <X size={24} />
        </button>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* VISUAL HALF */}
          <div className="md:w-3/5 bg-black flex items-center justify-center relative overflow-hidden">
            {artifact.type === 'image' ? (
              <img src={artifact.content} className="w-full h-full object-cover" alt="dream large" />
            ) : artifact.type === 'audio' ? (
              <div className="flex flex-col items-center gap-6">
                <div className="w-32 h-32 rounded-full bg-sage-500/20 flex items-center justify-center animate-pulse-slow">
                  <Play size={48} className="text-sage-400" />
                </div>
                <div className="flex gap-1 h-12 items-center">
                  {[...Array(20)].map((_, i) => (
                    <div key={i} className="w-1 bg-sage-500/40 rounded-full animate-shimmer" style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              </div>
            ) : artifact.type === 'code' ? (
              <div className="w-full h-full p-8 font-mono text-sm overflow-auto custom-scrollbar bg-[#0D1117]">
                 <pre className="text-blue-300">{artifact.content}</pre>
              </div>
            ) : (
              <div className="p-12 text-center max-w-md">
                <blockquote className="text-2xl font-serif italic text-sage-300 leading-relaxed">
                  "{artifact.content}"
                </blockquote>
              </div>
            )}
          </div>

          {/* INFO HALF */}
          <div className={`md:w-2/5 p-10 overflow-y-auto custom-scrollbar flex flex-col
            ${isDarkMode ? 'bg-onyx-950' : 'bg-white'}
          `}>
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2 text-sage-500">
                <ImageIcon size={14} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Dream Analysis</span>
              </div>
              <h2 className="text-3xl font-display font-bold leading-tight">{artifact.description}</h2>
              <div className="flex items-center gap-2 mt-4 text-xs opacity-50">
                <Clock size={12} />
                <span>Generated {new Date(dream.createdAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-8 flex-1">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Subconscious Themes</h4>
                <div className="flex flex-wrap gap-2">
                  {dream.themes.map(theme => (
                    <span key={theme} className={`px-3 py-1 rounded-full text-xs font-medium
                      ${isDarkMode ? 'bg-white/5 border border-white/5 text-gray-400' : 'bg-gray-100 text-gray-700'}
                    `}>
                      #{theme}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Emotional Baseline</h4>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-sage-500/10 text-sage-400 rounded-lg">
                    <Activity size={16} />
                  </div>
                  <span className="text-sm font-semibold italic">"{dream.emotionalTone}"</span>
                </div>
              </div>

              {/* ACTION ROW */}
              <div className="pt-8 border-t border-white/5 grid grid-cols-2 gap-3">
                <button 
                  onClick={onDiscuss}
                  className="col-span-2 py-4 rounded-2xl bg-sage-500 hover:bg-sage-600 text-white font-bold transition-all shadow-lg shadow-sage-500/20 flex items-center justify-center gap-2"
                >
                  <MessageSquare size={18} /> Tell Me More
                </button>
                <button className={`py-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-medium transition-colors
                  ${isDarkMode ? 'border-white/5 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}
                `}>
                  <Save size={16} /> Archive
                </button>
                <button className={`py-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-medium transition-colors
                   ${isDarkMode ? 'border-white/5 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}
                `}>
                  <Share2 size={16} /> Share
                </button>
                <button 
                  onClick={onDelete}
                  className="col-span-2 py-3 text-xs font-bold uppercase tracking-widest text-red-500/50 hover:text-red-500 transition-colors"
                >
                  Dissolve into Consciousness
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DreamGallery;
