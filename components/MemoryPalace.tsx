
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Memory, MemoryType } from '../types';
import { 
  getRecentMemories, 
  deleteMemory, 
  updateMemoryDecay 
} from '../services/memoryService';
import { 
  X, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  Filter, 
  Clock, 
  Brain, 
  Maximize, 
  Trash2, 
  RefreshCw, 
  Activity, 
  ChevronRight,
  Sparkles,
  Info,
  // @fix: Added missing Loader2 import
  Loader2
} from './Icons';

interface MemoryPalaceProps {
  userId: string;
  onClose: () => void;
  onMemorySelect?: (memory: Memory) => void;
  isDarkMode: boolean;
}

interface NodePosition {
  id: string;
  x: number;
  y: number;
  z: number;
}

const TYPE_COLORS: Record<MemoryType, string> = {
  episodic: 'bg-blue-500',
  semantic: 'bg-emerald-500',
  emotional: 'bg-pink-500',
  procedural: 'bg-amber-500'
};

const MemoryPalace: React.FC<MemoryPalaceProps> = ({ userId, onClose, onMemorySelect, isDarkMode }) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MemoryType | 'all'>('all');
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  
  // 3D Perspective state
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    loadMemories();
  }, [userId]);

  const loadMemories = async () => {
    setLoading(true);
    // Fetch a large batch for the palace view
    const data = await getRecentMemories(userId, undefined, 720); // Last month
    setMemories(data);
    setLoading(false);
  };

  // Generate deterministic 3D positions for memories
  const positions = useMemo(() => {
    const posMap: Record<string, NodePosition> = {};
    memories.forEach((m, i) => {
      // Use a golden spiral / spherical distribution or just random spread
      const phi = Math.acos(-1 + (2 * i) / memories.length);
      const theta = Math.sqrt(memories.length * Math.PI) * phi;
      
      const radius = 300;
      posMap[m.id] = {
        id: m.id,
        x: Math.cos(theta) * Math.sin(phi) * radius,
        y: Math.sin(theta) * Math.sin(phi) * radius,
        z: Math.cos(phi) * radius
      };
    });
    return posMap;
  }, [memories]);

  const filteredMemories = useMemo(() => {
    return memories.filter(m => {
      const matchesSearch = m.content.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || m.type === filter;
      return matchesSearch && matchesFilter;
    });
  }, [memories, search, filter]);

  const selectedMemory = memories.find(m => m.id === selectedId);

  const handleReinforce = async (id: string) => {
    await updateMemoryDecay(id, 1.0);
    setMemories(prev => prev.map(m => m.id === id ? { ...m, decayFactor: 1.0 } : m));
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Banish this memory to the void?")) {
      await deleteMemory(id);
      setMemories(prev => prev.filter(m => m.id !== id));
      setSelectedId(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setRotation(prev => ({
      x: prev.x - dy * 0.5,
      y: prev.y + dx * 0.5
    }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <div 
      className={`fixed inset-0 z-[80] flex flex-col font-sans transition-all duration-500 overflow-hidden
        ${isDarkMode ? 'bg-black text-white' : 'bg-onyx-50 text-gray-900'}
      `}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Background Decor */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-sage-500/10 blur-[120px] animate-pulse-slow" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl ${isDarkMode ? 'bg-sage-500/10 text-sage-400' : 'bg-sage-50 text-sage-600'}`}>
            <Brain size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Memory Palace</h1>
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-40">Semantic Graph Architecture</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" />
            <input 
              type="text" 
              placeholder="Search memories..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`pl-10 pr-4 py-2 rounded-xl text-sm border outline-none transition-all w-64
                ${isDarkMode ? 'bg-white/5 border-white/10 focus:border-sage-500/50' : 'bg-white border-onyx-100 focus:border-sage-500'}
              `}
            />
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors opacity-60">
            <X size={24} />
          </button>
        </div>
      </header>

      <div className="flex-1 relative flex">
        {/* Main 3D Canvas Area */}
        <div 
          className="flex-1 relative cursor-grab active:cursor-grabbing perspective-[1000px]"
          onMouseDown={handleMouseDown}
        >
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40">
              <Loader2 className="animate-spin mb-4" size={32} />
              <p className="text-xs font-mono tracking-widest uppercase">Building Neural Architecture...</p>
            </div>
          ) : (
            <div 
              className="absolute inset-0 transition-transform duration-100 ease-out preserve-3d"
              style={{ 
                transform: `translateZ(${zoom * 100}px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
                transformStyle: 'preserve-3d'
              }}
            >
              {/* Connection Lines (SVG) */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible preserve-3d">
                {memories.flatMap(m => (m.connections || []).map(targetId => {
                  const p1 = positions[m.id];
                  const p2 = positions[targetId];
                  if (!p1 || !p2) return null;
                  
                  const isRelated = selectedId === m.id || selectedId === targetId;
                  const opacity = isRelated ? 0.6 : 0.1;

                  return (
                    <line 
                      key={`${m.id}-${targetId}`}
                      x1={`calc(50% + ${p1.x}px)`}
                      y1={`calc(50% + ${p1.y}px)`}
                      x2={`calc(50% + ${p2.x}px)`}
                      y2={`calc(50% + ${p2.y}px)`}
                      stroke={isDarkMode ? 'white' : 'black'}
                      strokeWidth={isRelated ? 2 : 1}
                      strokeOpacity={opacity}
                      style={{ transform: `translateZ(${p1.z}px)` }}
                    />
                  );
                }))}
              </svg>

              {/* Memory Nodes */}
              {filteredMemories.map((m) => {
                const pos = positions[m.id];
                if (!pos) return null;

                const isSelected = selectedId === m.id;
                const isHovered = hoveredId === m.id;
                const isRelated = selectedId && (m.id === selectedId || m.connections?.includes(selectedId));
                
                // Scale based on connection count
                const baseSize = 12;
                const scale = 1 + (m.connections?.length || 0) * 0.15;
                const size = baseSize * scale;

                return (
                  <div
                    key={m.id}
                    onMouseEnter={() => setHoveredId(m.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(m.id);
                      if (onMemorySelect) onMemorySelect(m);
                    }}
                    onDoubleClick={() => handleReinforce(m.id)}
                    className={`absolute rounded-full transition-all duration-300 cursor-pointer shadow-lg preserve-3d
                      ${TYPE_COLORS[m.type]}
                      ${isSelected ? 'ring-4 ring-white shadow-[0_0_20px_rgba(255,255,255,0.5)]' : ''}
                      ${isRelated && !isSelected ? 'ring-2 ring-white/50' : ''}
                    `}
                    style={{
                      left: `calc(50% + ${pos.x}px)`,
                      top: `calc(50% + ${pos.y}px)`,
                      width: size,
                      height: size,
                      opacity: m.decayFactor * (filter === 'all' || m.type === filter ? 1 : 0.2),
                      transform: `translateZ(${pos.z}px) translate(-50%, -50%) scale(${isHovered || isSelected ? 1.5 : 1})`,
                      zIndex: Math.round(pos.z + 1000)
                    }}
                  >
                    {(isHovered || isSelected) && (
                      <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg whitespace-nowrap text-[10px] font-bold uppercase tracking-wider shadow-xl border animate-scale-in
                        ${isDarkMode ? 'bg-onyx-900 border-white/10 text-white' : 'bg-white border-onyx-200 text-onyx-900'}
                      `}>
                        {m.content.slice(0, 30)}{m.content.length > 30 ? '...' : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel (Right) */}
        <div className={`w-80 border-l border-white/5 flex flex-col transition-all duration-500
          ${selectedId ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}
          ${isDarkMode ? 'bg-white/[0.02]' : 'bg-white shadow-xl'}
        `}>
          {selectedMemory && (
            <div className="p-8 flex flex-col gap-8 h-full overflow-y-auto custom-scrollbar">
              <div className="flex justify-between items-start">
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${TYPE_COLORS[selectedMemory.type]} text-white`}>
                  {selectedMemory.type}
                </div>
                <button onClick={() => setSelectedId(null)} className="opacity-40 hover:opacity-100">
                  <X size={18} />
                </button>
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Content</h3>
                <p className="text-sm leading-relaxed font-medium">"{selectedMemory.content}"</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Created</span>
                  <span className="text-xs font-mono">{new Date(selectedMemory.timestamp).toLocaleDateString()}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Connections</span>
                  <span className="text-xs font-mono">{selectedMemory.connections?.length || 0} nodes</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Stability</span>
                  <span className="text-[10px] font-mono">{(selectedMemory.decayFactor * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ${TYPE_COLORS[selectedMemory.type]}`} 
                    style={{ width: `${selectedMemory.decayFactor * 100}%` }} 
                  />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/5">
                <button 
                  onClick={() => handleReinforce(selectedMemory.id)}
                  className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest transition-all
                    ${isDarkMode ? 'bg-white text-black hover:bg-sage-50' : 'bg-onyx-900 text-white hover:bg-black'}
                  `}
                >
                  <RefreshCw size={14} /> Reinforce Memory
                </button>
                <button 
                  onClick={() => handleDelete(selectedMemory.id)}
                  className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-all"
                >
                  <Trash2 size={14} /> Erase Fragment
                </button>
              </div>

              {selectedMemory.connections && selectedMemory.connections.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-40">Connected Nodes</h4>
                  <div className="flex flex-col gap-2">
                    {selectedMemory.connections.map(cid => {
                      const connected = memories.find(m => m.id === cid);
                      if (!connected) return null;
                      return (
                        <div 
                          key={cid}
                          onClick={() => setSelectedId(cid)}
                          className={`p-3 rounded-xl border text-[11px] cursor-pointer transition-all hover:scale-[1.02] line-clamp-1
                            ${isDarkMode ? 'bg-white/5 border-white/5 hover:bg-white/10' : 'bg-onyx-50 border-onyx-100 hover:bg-white'}
                          `}
                        >
                          {connected.content}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls Footer */}
      <footer className="relative z-10 px-8 py-6 border-t border-white/5 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-white/5 rounded-xl p-1">
            {(['all', 'episodic', 'semantic', 'emotional', 'procedural'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all
                  ${filter === t 
                    ? isDarkMode ? 'bg-white text-black' : 'bg-onyx-900 text-white'
                    : 'opacity-40 hover:opacity-100'}
                `}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setZoom(prev => Math.min(prev + 0.2, 3))}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10"
            >
              <ZoomIn size={18} />
            </button>
            <button 
              onClick={() => setZoom(prev => Math.max(prev - 0.2, 0.5))}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10"
            >
              <ZoomOut size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em] opacity-30">
          <Activity size={14} className="animate-pulse" />
          <span>Active Cognitive Threads: {filteredMemories.length}</span>
        </div>
      </footer>
    </div>
  );
};

export default MemoryPalace;
