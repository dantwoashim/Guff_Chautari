
import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  X, 
  ShieldCheck, 
  FlaskConical,
  Brain,
  Moon,
  Activity,
  GitBranch,
  Layers,
  Dna,
  Eye,
  Volume2,
  Palette,
  RotateCcw,
  Zap,
  Info
} from './Icons';

interface TestItem {
  id: string;
  label: string;
}

interface TestCategory {
  title: string;
  icon: any;
  items: TestItem[];
}

const TEST_SCHEMA: TestCategory[] = [
  {
    title: "Memory System",
    icon: Brain,
    items: [
      { id: "mem_manual", label: "Create a new memory manually" },
      { id: "mem_palace", label: "Memory appears in Memory Palace" },
      { id: "mem_auto", label: "Memory is auto-extracted from conversation" },
      { id: "mem_search", label: "Search memories by content" },
      { id: "mem_connect", label: "Connect two memories" },
      { id: "mem_decay", label: "Memory decay over time" },
      { id: "mem_delete", label: "Delete memory" }
    ]
  },
  {
    title: "Consciousness Stream",
    icon: Activity,
    items: [
      { id: "con_indicator", label: "Indicator shows correct state" },
      { id: "con_proactive", label: "Proactive message appears after idle" },
      { id: "con_accept", label: "Accept/dismiss proactive message" },
      { id: "con_quiet", label: "Quiet hours respected" },
      { id: "con_interrupt", label: "Interruption level respected" }
    ]
  },
  {
    title: "Mirror Protocol",
    icon: Layers,
    items: [
      { id: "mir_layers", label: "Response shows thought layers when depth > 0" },
      { id: "mir_collapse", label: "Layers are collapsible" },
      { id: "mir_incorporate", label: "Final response incorporates insights" },
      { id: "mir_toggle", label: "Can toggle depth in settings" }
    ]
  },
  {
    title: "Persona Inference",
    icon: ShieldCheck,
    items: [
      { id: "per_infer", label: "Persona inferred after conversations" },
      { id: "per_view", label: "Persona view shows metrics" },
      { id: "per_correct", label: "Can correct inferred values" },
      { id: "per_affect", label: "Persona affects response style" }
    ]
  },
  {
    title: "Branching",
    icon: GitBranch,
    items: [
      { id: "bra_create", label: "Create branch from message" },
      { id: "bra_switch", label: "Switch between branches" },
      { id: "bra_nav", label: "Branch navigator displays tree" },
      { id: "bra_merge", label: "Merge branches shows synthesis" },
      { id: "bra_compare", label: "Compare branches works" }
    ]
  },
  {
    title: "Dream Engine",
    icon: Moon,
    items: [
      { id: "dre_gen", label: "Dream generated after idle period" },
      { id: "dre_gal", label: "Dream gallery shows dreams" },
      { id: "dre_types", label: "Dream types (image/text) work" },
      { id: "dre_more", label: "Tell me more starts conversation" }
    ]
  },
  {
    title: "Oracle Protocol",
    icon: Eye,
    items: [
      { id: "ora_pred", label: "Predictions generate daily" },
      { id: "ora_acc", label: "Accuracy tracking works" },
      { id: "ora_preempt", label: "Preemptive actions execute" },
      { id: "ora_dash", label: "Dashboard displays correctly" }
    ]
  },
  {
    title: "Voice Continuum",
    icon: Volume2,
    items: [
      { id: "voi_clone", label: "Voice cloning works" },
      { id: "voi_emot", label: "Emotional adaptation in TTS" },
      { id: "voi_duet", label: "Duet mode real-time sync" }
    ]
  },
  {
    title: "Design System",
    icon: Palette,
    items: [
      { id: "des_temp", label: "Temporal theme changes with time" },
      { id: "des_emot", label: "Emotional colors inject correctly" },
      { id: "des_anim", label: "Animations are smooth" },
      { id: "des_mode", label: "Dark/light mode works" }
    ]
  },
  {
    title: "Cognitive DNA",
    icon: Dna,
    items: [
      { id: "dna_export", label: "Export creates valid file" },
      { id: "dna_import", label: "Import validates and applies" },
      { id: "dna_preview", label: "Preview shows correct data" }
    ]
  }
];

interface SystemVerificationProps {
  onClose: () => void;
  isDarkMode: boolean;
}

const SystemVerification: React.FC<SystemVerificationProps> = ({ onClose, isDarkMode }) => {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem('ashim_verification_state');
    if (saved) {
      try {
        setCheckedItems(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error("Failed to load verification state");
      }
    }
  }, []);

  const toggleItem = (id: string) => {
    const next = new Set(checkedItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedItems(next);
    localStorage.setItem('ashim_verification_state', JSON.stringify(Array.from(next)));
  };

  const resetAll = () => {
    if (window.confirm("Reset all test progress?")) {
      setCheckedItems(new Set());
      localStorage.removeItem('ashim_verification_state');
    }
  };

  const totalItems = TEST_SCHEMA.reduce((acc, cat) => acc + cat.items.length, 0);
  const completedItems = checkedItems.size;
  const progress = (completedItems / totalItems) * 100;

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col font-sans animate-fade-in
      ${isDarkMode ? 'bg-onyx-950 text-gray-100' : 'bg-onyx-50 text-gray-900'}
    `}>
      {/* HEADER */}
      <header className="px-8 py-6 border-b border-white/5 backdrop-blur-xl flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
            <FlaskConical size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">System Verification</h1>
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-40 font-mono">Ashim ASI Integration Suite v3.2</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex flex-col items-end gap-1">
             <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Overall Readiness</span>
             <div className="flex items-center gap-3">
                <div className={`h-2 w-48 rounded-full overflow-hidden ${isDarkMode ? 'bg-white/5' : 'bg-gray-200'}`}>
                   <div 
                    className="h-full bg-sage-500 shadow-[0_0_10px_rgba(52,179,113,0.5)] transition-all duration-1000" 
                    style={{ width: `${progress}%` }} 
                   />
                </div>
                <span className="text-sm font-mono font-bold text-sage-500">{progress.toFixed(0)}%</span>
             </div>
          </div>
          <div className="h-10 w-px bg-white/10" />
          <div className="flex gap-2">
            <button 
              onClick={resetAll}
              className={`p-2 rounded-xl transition-all ${isDarkMode ? 'hover:bg-white/5 text-onyx-500 hover:text-red-400' : 'hover:bg-gray-100 text-gray-400 hover:text-red-600'}`}
              title="Reset All Progress"
            >
              <RotateCcw size={20} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors opacity-60">
              <X size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* CONTENT GRID */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-12">
        <div className="max-w-6xl mx-auto space-y-16">
          
          <div className={`p-6 rounded-3xl border flex gap-4 animate-slide-up
            ${isDarkMode ? 'bg-indigo-500/5 border-indigo-500/10' : 'bg-indigo-50 border-indigo-100'}
          `}>
             <Info size={20} className="text-indigo-400 shrink-0 mt-0.5" />
             <p className="text-sm leading-relaxed opacity-80">
               Use this suite to verify the operational integrity of all Ashim sub-systems. Checked items are persisted locally to track your verification process across sessions.
             </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {TEST_SCHEMA.map((category, idx) => (
              <section key={category.title} className="space-y-6 animate-slide-up" style={{ animationDelay: `${idx * 100}ms` }}>
                <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                  <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-onyx-50'}`}>
                    <category.icon size={18} className="opacity-60" />
                  </div>
                  <h3 className="text-lg font-display font-bold">{category.title}</h3>
                </div>

                <div className="space-y-1">
                  {category.items.map((item) => {
                    const isChecked = checkedItems.has(item.id);
                    return (
                      <div 
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className={`group flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all
                          ${isChecked 
                            ? isDarkMode ? 'bg-sage-500/10 text-sage-400' : 'bg-sage-50 text-sage-700' 
                            : isDarkMode ? 'hover:bg-white/5 text-gray-500 hover:text-gray-300' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-800'}
                        `}
                      >
                        <div className="shrink-0">
                          {isChecked ? (
                            <CheckCircle2 size={20} className="text-sage-500 animate-scale-in" />
                          ) : (
                            <Circle size={20} className="opacity-20 group-hover:opacity-40 transition-opacity" />
                          )}
                        </div>
                        <span className={`text-sm font-medium transition-colors ${isChecked ? 'font-semibold' : ''}`}>
                          {item.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

        </div>

        <div className="py-20 text-center opacity-20">
           <Zap size={32} className="mx-auto mb-4" />
           <p className="text-xs uppercase tracking-[0.4em] font-bold">End of Verification Matrix</p>
        </div>
      </main>
    </div>
  );
};

export default SystemVerification;
