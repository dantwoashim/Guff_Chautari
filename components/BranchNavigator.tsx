
import React, { useState } from 'react';
import { 
  ConversationTree, 
  ConversationBranch, 
  BranchComparison, 
  Message 
} from '../types';
import { 
  Split, 
  GitMerge, 
  GitBranch, 
  Trash2, 
  ChevronRight, 
  ArrowLeftRight, 
  X, 
  Clock, 
  Layers,
  Sparkles,
  Check,
  Plus
} from './Icons';

interface BranchNavigatorProps {
  tree: ConversationTree;
  activeBranchId: string;
  onSwitchBranch: (branchId: string) => void;
  onCreateBranch: (forkPoint: number, label?: string) => void;
  onDeleteBranch: (branchId: string) => void;
  onMergeBranches: (branchA: string, branchB: string) => void;
  onCompareBranches: (branchA: string, branchB: string) => void;
  isDarkMode: boolean;
  comparisonResult?: BranchComparison & any;
}

const BranchNavigator: React.FC<BranchNavigatorProps> = ({
  tree,
  activeBranchId,
  onSwitchBranch,
  onCreateBranch,
  onDeleteBranch,
  onMergeBranches,
  onCompareBranches,
  isDarkMode,
  comparisonResult
}) => {
  const [showCompare, setShowCompare] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [hoveredBranchId, setHoveredBranchId] = useState<string | null>(null);

  const branchesArray = Object.values(tree.branches) as ConversationBranch[];

  const handleSelectForCompare = (id: string) => {
    if (selectedBranches.includes(id)) {
      setSelectedBranches(prev => prev.filter(b => b !== id));
    } else if (selectedBranches.length < 2) {
      setSelectedBranches(prev => [...prev, id]);
    }
  };

  const startComparison = () => {
    if (selectedBranches.length === 2) {
      onCompareBranches(selectedBranches[0], selectedBranches[1]);
      setShowCompare(true);
    }
  };

  return (
    <div className={`flex flex-col h-full animate-fade-in font-sans
      ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}
    `}>
      {/* HEADER */}
      <div className="flex items-center justify-between p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-sage-500/10 text-sage-400' : 'bg-sage-50 text-sage-600'}`}>
            <Layers size={20} />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold">Parallel Timelines</h2>
            <p className="text-xs opacity-50 font-mono uppercase tracking-widest mt-0.5">
              {branchesArray.length} Universes Identified
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedBranches.length === 2 && (
            <button 
              onClick={startComparison}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all animate-scale-in
                ${isDarkMode ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-indigo-600 text-white'}
              `}
            >
              <ArrowLeftRight size={14} /> Compare Selections
            </button>
          )}
          <button 
            onClick={() => onCreateBranch(tree.branches[activeBranchId]?.messages.length - 1 || 0)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all
              ${isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-100 hover:bg-gray-200'}
            `}
          >
            <Plus size={14} /> Fork Reality
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* TIMELINE VISUALIZATION (LEFT) */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
          <div className="flex flex-col gap-12">
            {branchesArray.map((branch, i) => (
              <BranchRow 
                key={branch.id} 
                branch={branch} 
                isActive={branch.id === activeBranchId}
                isHovered={hoveredBranchId === branch.id}
                isSelected={selectedBranches.includes(branch.id)}
                onSelect={onSwitchBranch}
                onHover={setHoveredBranchId}
                onSelectCompare={handleSelectForCompare}
                isDarkMode={isDarkMode}
              />
            ))}
          </div>
        </div>

        {/* BRANCH DETAILS PANEL (RIGHT) */}
        <div className={`w-full lg:w-80 border-l border-white/5 p-6 flex flex-col gap-6
          ${isDarkMode ? 'bg-white/[0.02]' : 'bg-gray-50'}
        `}>
          <h3 className="text-sm font-bold uppercase tracking-widest opacity-40">Branch Intelligence</h3>
          
          {hoveredBranchId || activeBranchId ? (
            <div className="flex flex-col gap-4 animate-slide-up">
              <BranchCard 
                branch={tree.branches[hoveredBranchId || activeBranchId]} 
                isDarkMode={isDarkMode}
                onDelete={onDeleteBranch}
              />
            </div>
          ) : (
            <div className="text-center py-12 opacity-30 italic text-sm">
              Hover over a timeline to see details
            </div>
          )}

          {/* QUICK ACTIONS */}
          <div className="mt-auto space-y-3">
             <div className="text-[10px] font-bold uppercase tracking-widest opacity-30">Quick Operations</div>
             <button 
              disabled={selectedBranches.length < 2}
              onClick={() => onMergeBranches(selectedBranches[0], selectedBranches[1])}
              className={`w-full flex items-center justify-between p-3 rounded-xl border text-sm font-medium transition-all
                ${selectedBranches.length === 2 
                  ? 'bg-sage-500/10 border-sage-500/20 text-sage-400 hover:bg-sage-500/20' 
                  : 'bg-white/5 border-white/5 text-gray-600 cursor-not-allowed opacity-50'}
              `}
             >
                <div className="flex items-center gap-2">
                  <GitMerge size={16} />
                  <span>Synthesize Merge</span>
                </div>
                <ChevronRight size={14} />
             </button>
          </div>
        </div>
      </div>

      {/* COMPARISON MODAL */}
      {showCompare && comparisonResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-black/80 animate-fade-in">
          <div className={`w-full max-w-6xl h-[90vh] rounded-[32px] border flex flex-col overflow-hidden shadow-2xl animate-scale-in
            ${isDarkMode ? 'bg-onyx-950 border-white/10' : 'bg-white border-gray-100'}
          `}>
            {/* Modal Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                  <ArrowLeftRight size={20} />
                </div>
                <h2 className="text-xl font-display font-bold">Timeline Divergence Analysis</h2>
              </div>
              <button 
                onClick={() => setShowCompare(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Branch A */}
                  <ComparisonPanel 
                    label={tree.branches[selectedBranches[0]]?.label || 'Branch A'}
                    messages={tree.branches[selectedBranches[0]]?.messages || []}
                    strengths={comparisonResult.branchAStrengths || []}
                    isDarkMode={isDarkMode}
                  />
                  {/* Branch B */}
                  <ComparisonPanel 
                    label={tree.branches[selectedBranches[1]]?.label || 'Branch B'}
                    messages={tree.branches[selectedBranches[1]]?.messages || []}
                    strengths={comparisonResult.branchBStrengths || []}
                    isDarkMode={isDarkMode}
                  />

                  {/* MERGED INSIGHTS (Full Width) */}
                  <div className={`lg:col-span-2 p-8 rounded-3xl border animate-slide-up
                    ${isDarkMode ? 'bg-sage-500/5 border-sage-500/20' : 'bg-sage-50 border-sage-200 shadow-sm'}
                  `}>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-sage-500/20 text-sage-400 rounded-lg">
                        <Sparkles size={20} />
                      </div>
                      <h3 className="text-lg font-display font-bold">AI Synthesis & Recommendation</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                      <div className="md:col-span-2">
                        <p className={`text-base leading-relaxed opacity-90 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          {comparisonResult.mergedInsights}
                        </p>
                      </div>
                      <div className="space-y-6">
                         <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 block mb-2">Key Differences</span>
                            <ul className="space-y-2">
                              {comparisonResult.keyDifferences?.map((diff: string, i: number) => (
                                <li key={i} className="text-xs flex items-start gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                                  <span className="opacity-70">{diff}</span>
                                </li>
                              ))}
                            </ul>
                         </div>
                         <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-white border-gray-100'}`}>
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 block mb-1">Recommended Path</span>
                            <div className="flex items-center gap-2 text-sage-500 font-bold">
                               <Check size={16} />
                               <span>Reality {comparisonResult.recommendedPath || 'Merged'}</span>
                            </div>
                         </div>
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- SUB-COMPONENTS ---

interface BranchRowProps {
  branch: ConversationBranch;
  isActive: boolean;
  isHovered: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onSelectCompare: (id: string) => void;
  isDarkMode: boolean;
}

const BranchRow: React.FC<BranchRowProps> = ({ 
  branch, 
  isActive, 
  isHovered, 
  isSelected, 
  onSelect, 
  onHover, 
  onSelectCompare, 
  isDarkMode 
}) => {
  return (
    <div 
      className={`relative flex items-center group transition-all duration-500 cursor-pointer
        ${isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100'}
      `}
      onMouseEnter={() => onHover(branch.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(branch.id)}
    >
      {/* Path Line */}
      <div className={`absolute left-0 right-0 h-0.5 rounded-full transition-all duration-700
        ${isActive ? 'bg-sage-500 scale-x-100' : isDarkMode ? 'bg-white/10' : 'bg-gray-200'}
        ${isHovered ? 'scale-y-150' : ''}
      `} />

      {/* Fork Connection */}
      {branch.parentId && (
        <div className={`absolute left-0 bottom-1/2 w-0.5 h-12 -translate-x-4
          ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}
        `} />
      )}

      {/* Nodes (Messages) */}
      <div className="flex gap-4 relative z-10 w-full overflow-hidden px-1">
        {branch.messages.map((_, idx) => (
          <div 
            key={idx}
            className={`w-3 h-3 rounded-full border-2 transition-all duration-300
              ${isActive && idx === branch.messages.length - 1 
                ? 'bg-sage-500 border-sage-500 scale-125 shadow-[0_0_12px_rgba(52,179,113,0.5)]' 
                : isActive ? 'bg-sage-500 border-sage-500' : isDarkMode ? 'bg-onyx-800 border-white/20' : 'bg-white border-gray-300'}
              group-hover:scale-110
            `}
          />
        ))}
      </div>

      {/* Floating Label */}
      <div className={`absolute -top-7 left-0 flex items-center gap-2 transition-all duration-300
        ${isHovered || isActive ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}
      `}>
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md
          ${isActive ? 'bg-sage-500 text-white' : isDarkMode ? 'bg-white/10 text-gray-400' : 'bg-gray-200 text-gray-600'}
        `}>
          {branch.label}
        </span>
        <button 
          onClick={(e) => { e.stopPropagation(); onSelectCompare(branch.id); }}
          className={`p-1 rounded-md transition-all ${isSelected ? 'bg-indigo-500 text-white' : 'hover:bg-white/10 opacity-40 hover:opacity-100'}`}
        >
          <ArrowLeftRight size={10} />
        </button>
      </div>
    </div>
  );
};

const BranchCard = ({ branch, isDarkMode, onDelete }: { branch: ConversationBranch, isDarkMode: boolean, onDelete: (id: string) => void }) => {
  return (
    <div className={`p-5 rounded-2xl border animate-scale-in
      ${isDarkMode ? 'bg-white/5 border-white/5 shadow-inner' : 'bg-white border-gray-100 shadow-lg'}
    `}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-sage-500" />
          <h4 className="font-bold text-sm truncate max-w-[120px]">{branch.label}</h4>
        </div>
        <button 
          onClick={() => onDelete(branch.id)}
          className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center text-xs opacity-50">
          <div className="flex items-center gap-1.5">
            <Clock size={12} />
            <span>Created</span>
          </div>
          <span className="font-mono">{new Date(branch.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="flex justify-between items-center text-xs opacity-50">
          <div className="flex items-center gap-1.5">
            <Split size={12} />
            <span>Messages</span>
          </div>
          <span className="font-mono">{branch.messages.length}</span>
        </div>
        {branch.parentId && (
          <div className="flex justify-between items-center text-xs opacity-50">
             <div className="flex items-center gap-1.5">
                <GitMerge size={12} />
                <span>Fork Point</span>
             </div>
             <span className="font-mono">#{branch.forkPoint}</span>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-widest opacity-30">Latest Activity</div>
        <p className="text-[11px] opacity-60 leading-relaxed line-clamp-2 italic">
          "{branch.messages[branch.messages.length - 1]?.text}"
        </p>
      </div>
    </div>
  );
};

const ComparisonPanel = ({ label, messages, strengths, isDarkMode }: { label: string, messages: Message[], strengths: string[], isDarkMode: boolean }) => {
  return (
    <div className={`flex flex-col gap-4 p-6 rounded-3xl border h-[400px] overflow-hidden
      ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-200'}
    `}>
      <div className="flex justify-between items-center">
        <h4 className="font-display font-bold text-lg">{label}</h4>
        <div className="flex items-center gap-2">
          {strengths.slice(0, 2).map((s, i) => (
            <span key={i} className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest
              ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-100 text-indigo-600'}
            `}>
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
        {messages.slice(-4).map((msg, i) => (
          <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <span className="text-[9px] opacity-30 uppercase font-bold tracking-widest">{msg.role}</span>
            <div className={`px-3 py-2 rounded-xl text-xs max-w-[85%]
              ${msg.role === 'user' 
                ? isDarkMode ? 'bg-white/10 text-white' : 'bg-onyx-900 text-white'
                : isDarkMode ? 'bg-black/40 text-gray-300' : 'bg-white text-gray-800 shadow-sm'}
            `}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BranchNavigator;
