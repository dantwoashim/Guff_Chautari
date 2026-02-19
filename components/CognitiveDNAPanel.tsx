
import React, { useState, useRef } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  Shield, 
  Check, 
  Eye, 
  Lock, 
  Info, 
  FileText, 
  Dna,
  MessageSquare,
  Activity,
  Heart,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Trash2
} from './Icons';
import { CognitiveDNA } from '../types';

interface CognitiveDNAPanelProps {
  userId: string;
  onClose: () => void;
  isDarkMode: boolean;
  onApplyDNA?: (dna: CognitiveDNA) => void;
}

const CognitiveDNAPanel: React.FC<CognitiveDNAPanelProps> = ({ 
  userId, 
  onClose, 
  isDarkMode,
  onApplyDNA 
}) => {
  const [view, setView] = useState<'export' | 'import' | 'preview'>('export');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importedDNA, setImportedDNA] = useState<CognitiveDNA | null>(null);
  
  // Export Settings
  const [exportConfig, setExportConfig] = useState({
    preferences: true,
    context: true,
    patterns: true,
    emotions: false,
    anonymize: false,
    encrypt: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const text = await file.text();
      const dna = JSON.parse(text) as CognitiveDNA;
      // Simulate validation delay
      await new Promise(r => setTimeout(r, 1200));
      setImportedDNA(dna);
      setView('preview');
    } catch (e) {
      alert("Invalid DNA file format.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    const mockDNA: Partial<CognitiveDNA> = {
      id: 'dna_' + Date.now(),
      userId: userId,
      version: '1.0.0',
      exportedAt: Date.now(),
      communicationPreferences: exportConfig.preferences ? { technical: 0.85, formality: 'casual' } : {},
      learnedContext: exportConfig.context ? "User is focused on ASI development and clean UI." : "",
      interactionPatterns: exportConfig.patterns ? ["active_night_owl", "direct_feedback"] : [],
      signature: 'sha256_mock_sig'
    };

    const blob = new Blob([JSON.stringify(mockDNA, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ashim_DNA_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center p-6 backdrop-blur-2xl animate-fade-in
      ${isDarkMode ? 'bg-black/60' : 'bg-onyx-900/10'}
    `}>
      <div className={`relative w-full max-w-2xl rounded-[32px] border shadow-2xl overflow-hidden flex flex-col animate-scale-in
        ${isDarkMode ? 'bg-onyx-950 border-white/10 glass-dark' : 'bg-white border-onyx-100 glass-light'}
      `}>
        
        {/* Header */}
        <header className="p-8 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
              <Dna size={24} className="animate-breathe" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold">Cognitive DNA</h2>
              <p className="text-xs opacity-50 uppercase tracking-[0.2em]">Portable Persona Architecture</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors opacity-40 hover:opacity-100">
            <X size={24} />
          </button>
        </header>

        {/* Tab Navigation */}
        <div className="flex px-8 pt-6 gap-2">
          <button 
            onClick={() => setView('export')}
            className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all
              ${view === 'export' 
                ? 'bg-indigo-500 text-white shadow-lg' 
                : isDarkMode ? 'bg-white/5 text-gray-500 hover:text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
            `}
          >
            Export DNA
          </button>
          <button 
            onClick={() => setView('import')}
            className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all
              ${view === 'import' 
                ? 'bg-indigo-500 text-white shadow-lg' 
                : isDarkMode ? 'bg-white/5 text-gray-500 hover:text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
            `}
          >
            Import DNA
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          
          {/* EXPORT VIEW */}
          {view === 'export' && (
            <div className="space-y-8 animate-slide-up">
              <div className={`p-5 rounded-2xl border flex gap-4
                ${isDarkMode ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100'}
              `}>
                <Info size={20} className="text-indigo-400 shrink-0" />
                <p className="text-sm leading-relaxed opacity-80">
                  Your Cognitive DNA is a portable representation of how Ashim has learned to interact with you. Exporting this file allows you to "move" your relationship to other instances of the ASI.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Include in export:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ExportOption 
                    label="Communication Preferences" 
                    desc="Technical level, length, tone."
                    checked={exportConfig.preferences} 
                    onChange={(v) => setExportConfig({...exportConfig, preferences: v})}
                    isDarkMode={isDarkMode}
                  />
                  <ExportOption 
                    label="Learned Context" 
                    desc="Interests, active projects, goals."
                    checked={exportConfig.context} 
                    onChange={(v) => setExportConfig({...exportConfig, context: v})}
                    isDarkMode={isDarkMode}
                  />
                  <ExportOption 
                    label="Interaction Patterns" 
                    desc="Active hours, feedback styles."
                    checked={exportConfig.patterns} 
                    onChange={(v) => setExportConfig({...exportConfig, patterns: v})}
                    isDarkMode={isDarkMode}
                  />
                  <ExportOption 
                    label="Emotional Baseline" 
                    desc="Sentiment history (Sensitive data)."
                    checked={exportConfig.emotions} 
                    onChange={(v) => setExportConfig({...exportConfig, emotions: v})}
                    isDarkMode={isDarkMode}
                    warning
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/5">
                <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Privacy Options:</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => setExportConfig({...exportConfig, anonymize: !exportConfig.anonymize})}
                  >
                    <div className="flex items-center gap-3">
                      <Shield size={18} className="text-gray-400" />
                      <span className="text-sm font-medium">Anonymize Data</span>
                    </div>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${exportConfig.anonymize ? 'bg-indigo-500 border-indigo-500' : 'border-white/20'}`}>
                      {exportConfig.anonymize && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => setExportConfig({...exportConfig, encrypt: !exportConfig.encrypt})}
                  >
                    <div className="flex items-center gap-3">
                      <Lock size={18} className="text-gray-400" />
                      <span className="text-sm font-medium">Encrypt File</span>
                    </div>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${exportConfig.encrypt ? 'bg-indigo-500 border-indigo-500' : 'border-white/20'}`}>
                      {exportConfig.encrypt && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* IMPORT VIEW */}
          {view === 'import' && (
            <div className="h-full flex flex-col gap-6 animate-slide-up">
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex-1 min-h-[300px] border-2 border-dashed rounded-[40px] flex flex-col items-center justify-center transition-all duration-500 cursor-pointer
                  ${isDragging ? 'border-indigo-500 bg-indigo-500/10 scale-95 shadow-2xl' : 'border-white/10 hover:border-white/30 hover:bg-white/5'}
                `}
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 size={48} className="animate-spin text-indigo-500" />
                    <p className="text-sm font-bold uppercase tracking-widest opacity-40">Verifying Integrity...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-center px-12">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-2">
                       <Upload size={32} className="text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-bold">Import DNA Sequence</h3>
                    <p className="text-sm opacity-40 leading-relaxed">
                      Drag and drop your .json DNA file here or click to browse.
                    </p>
                  </div>
                )}
                <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} accept=".json" className="hidden" />
              </div>

              <div className={`p-4 rounded-2xl border flex gap-3
                ${isDarkMode ? 'bg-amber-500/5 border-amber-500/20 text-amber-200' : 'bg-amber-50 border-amber-100 text-amber-800'}
              `}>
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed opacity-80">
                  Importing DNA will enhance Ashim's understanding of you by merging these insights with existing learnings. It will not overwrite your current progress.
                </p>
              </div>
            </div>
          )}

          {/* PREVIEW VIEW */}
          {view === 'preview' && importedDNA && (
            <div className="space-y-8 animate-slide-up">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-display font-bold">DNA Preview</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs opacity-50 font-mono">MyDNA_2025-12-17.json</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span className="text-[10px] text-green-500 font-bold uppercase">✓ Integrity Verified</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 block">Generated</span>
                  <span className="text-xs font-medium">Dec 17, 2025</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <PreviewSection 
                  title="Communication Style" 
                  icon={MessageSquare} 
                  isDarkMode={isDarkMode}
                  items={[
                    { label: "Technical level", value: "85%" },
                    { label: "Formality", value: "Casual" },
                    { label: "Length preference", value: "Detailed" }
                  ]}
                />
                <PreviewSection 
                  title="Interests & Context" 
                  icon={FileText} 
                  isDarkMode={isDarkMode}
                  summary="AI/ML, Deep Learning, Digital Consciousness, Philosophy."
                  badge="12 topics"
                />
                <PreviewSection 
                  title="Interaction Patterns" 
                  icon={Activity} 
                  isDarkMode={isDarkMode}
                  items={[
                    { label: "Peak Activity", value: "9 PM - 12 AM" },
                    { label: "Feedback Loop", value: "Direct/Technical" }
                  ]}
                />
                <PreviewSection 
                  title="Emotional Data" 
                  icon={Heart} 
                  isDarkMode={isDarkMode}
                  status="Not included in this sequence"
                  disabled
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className={`p-8 border-t border-white/5 flex items-center justify-between
          ${isDarkMode ? 'bg-white/5' : 'bg-onyx-50/50'}
        `}>
          {view === 'export' ? (
            <>
              <button className="flex items-center gap-2 text-sm font-bold opacity-40 hover:opacity-100 transition-opacity">
                <Eye size={18} /> Preview DNA
              </button>
              <button 
                onClick={handleDownload}
                className="px-8 py-3 rounded-2xl bg-white text-black font-bold flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl"
              >
                <Download size={18} /> Download DNA File
              </button>
            </>
          ) : view === 'import' ? (
            <>
              <div className="flex items-center gap-2 opacity-30 text-xs">
                <Lock size={14} /> End-to-end local processing
              </div>
              <button onClick={() => setView('export')} className="text-sm font-bold opacity-40 hover:opacity-100">Cancel</button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setView('import')}
                className="flex items-center gap-2 text-sm font-bold opacity-40 hover:opacity-100 transition-opacity"
              >
                <ChevronRight size={18} className="rotate-180" /> Back to Upload
              </button>
              <div className="flex gap-4">
                <button 
                  onClick={() => setView('export')}
                  className="px-6 py-3 rounded-2xl border border-white/10 font-bold text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if(importedDNA && onApplyDNA) onApplyDNA(importedDNA);
                    onClose();
                  }}
                  className="px-10 py-3 rounded-2xl bg-indigo-500 text-white font-bold flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl"
                >
                  Apply DNA Sequence
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};

// --- Sub-components ---

const ExportOption = ({ label, desc, checked, onChange, isDarkMode, warning }: any) => (
  <div 
    onClick={() => onChange(!checked)}
    className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start gap-4
      ${checked 
        ? isDarkMode ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-indigo-50 border-indigo-200' 
        : isDarkMode ? 'bg-white/5 border-white/5' : 'bg-white border-onyx-100'}
    `}
  >
    <div className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-all
      ${checked ? 'bg-indigo-500 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.4)]' : 'border-white/10'}
    `}>
      {checked && <Check size={12} className="text-white" />}
    </div>
    <div>
      <h4 className={`text-sm font-bold ${warning && checked ? 'text-amber-500' : ''}`}>{label}</h4>
      <p className="text-[11px] opacity-40 mt-0.5">{desc}</p>
    </div>
  </div>
);

const PreviewSection = ({ title, icon: Icon, items, summary, badge, status, disabled, isDarkMode }: any) => (
  <div className={`p-5 rounded-2xl border transition-all
    ${disabled ? 'opacity-40' : ''}
    ${isDarkMode ? 'bg-white/[0.03] border-white/5' : 'bg-gray-50 border-gray-100'}
  `}>
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-white'}`}>
          <Icon size={16} className="text-indigo-400" />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest">{title}</span>
      </div>
      {badge && <span className="text-[9px] font-bold uppercase bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-md">{badge}</span>}
    </div>

    {status && <p className="text-xs italic opacity-40">{status}</p>}
    {summary && <p className="text-sm opacity-80 leading-relaxed">{summary}</p>}
    
    {items && (
      <div className="space-y-2">
        {items.map((item: any, i: number) => (
          <div key={i} className="flex justify-between items-center text-xs">
            <span className="opacity-40">{item.label}</span>
            <span className="font-semibold">{item.value}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default CognitiveDNAPanel;
