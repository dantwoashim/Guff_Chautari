
import React, { useState, useEffect } from 'react';
import { Plus, X, User, Check, Trash2, Loader2, Sparkles } from './Icons';
import { Persona } from '../types';
import { createPersona, deletePersona, fetchPersonas } from '../services/geminiService';

interface PersonaSelectorProps {
  userId: string;
  activePersonaId: string | null;
  onSelect: (personaId: string | null) => void;
  isDarkMode: boolean;
}

const PersonaSelector: React.FC<PersonaSelectorProps> = ({ userId, activePersonaId, onSelect, isDarkMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Create State
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newInstruction, setNewInstruction] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadPersonas();
  }, [userId]);

  const loadPersonas = async () => {
    setIsLoading(true);
    const data = await fetchPersonas(userId);
    setPersonas(data);
    setIsLoading(false);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newInstruction.trim()) return;
    setIsSubmitting(true);
    const newPersona = await createPersona(userId, newName, newInstruction, newDesc);
    if (newPersona) {
        setPersonas([newPersona, ...personas]);
        setIsCreating(false);
        setNewName('');
        setNewDesc('');
        setNewInstruction('');
        onSelect(newPersona.id); // Auto-select new persona
        setIsOpen(false);
    } else {
        alert("Failed to create persona. Check database setup.");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm("Permanently delete this persona?")) return;
      await deletePersona(id);
      setPersonas(personas.filter(p => p.id !== id));
      if (activePersonaId === id) onSelect(null); // Revert to default if active deleted
  };

  const activePersona = personas.find(p => p.id === activePersonaId);

  return (
    <div className="relative z-40">
        {/* Trigger Button */}
        <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300
                ${isDarkMode 
                    ? 'bg-onyx-900 border-white/10 hover:bg-onyx-800 text-white' 
                    : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-800'}
                ${isOpen ? 'ring-2 ring-sage-500/50' : ''}
            `}
        >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${activePersona ? 'bg-indigo-500 text-white' : isDarkMode ? 'bg-white/10' : 'bg-gray-100'}`}>
                {activePersona ? activePersona.name[0].toUpperCase() : <User size={12} />}
            </div>
            <span className="max-w-[100px] truncate">
                {activePersona ? activePersona.name : 'Default User'}
            </span>
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
            <>
                <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                <div className={`absolute top-full left-0 mt-2 w-72 rounded-xl border shadow-2xl z-50 overflow-hidden animate-scale-in flex flex-col max-h-[400px]
                    ${isDarkMode ? 'bg-onyx-950 border-white/10 shadow-black/50' : 'bg-white border-gray-200 shadow-xl'}
                `}>
                    
                    {/* Header */}
                    <div className={`p-3 border-b flex justify-between items-center ${isDarkMode ? 'border-white/5 bg-white/5' : 'border-gray-100 bg-gray-50'}`}>
                        <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Select User Profile</span>
                        {!isCreating && (
                            <button 
                                onClick={() => setIsCreating(true)} 
                                className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors
                                    ${isDarkMode ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}
                                `}
                            >
                                <Plus size={12} /> New Profile
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                        {isCreating ? (
                            <div className="space-y-3 p-1">
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1">User Name</label>
                                    <input 
                                        autoFocus
                                        value={newName} 
                                        onChange={(e) => setNewName(e.target.value)}
                                        className={`w-full p-2 rounded-lg text-sm border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${isDarkMode ? 'bg-onyx-900 border-white/10 text-white' : 'bg-white border-gray-200'}`}
                                        placeholder="e.g. Prabin"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1">Role / Tagline</label>
                                    <input 
                                        value={newDesc} 
                                        onChange={(e) => setNewDesc(e.target.value)}
                                        className={`w-full p-2 rounded-lg text-sm border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${isDarkMode ? 'bg-onyx-900 border-white/10 text-white' : 'bg-white border-gray-200'}`}
                                        placeholder="e.g. Software Engineer"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1">User Bio / Context</label>
                                    <textarea 
                                        value={newInstruction} 
                                        onChange={(e) => setNewInstruction(e.target.value)}
                                        className={`w-full p-2 rounded-lg text-sm border focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[80px] resize-none ${isDarkMode ? 'bg-onyx-900 border-white/10 text-white' : 'bg-white border-gray-200'}`}
                                        placeholder="I am Prabin, I love coding. I want you to explain things technically..."
                                    />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button 
                                        onClick={handleCreate}
                                        disabled={isSubmitting || !newName}
                                        className="flex-1 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-semibold hover:bg-indigo-600 flex justify-center"
                                    >
                                        {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : "Create Profile"}
                                    </button>
                                    <button 
                                        onClick={() => setIsCreating(false)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {/* Default Option */}
                                <div 
                                    onClick={() => { onSelect(null); setIsOpen(false); }}
                                    className={`p-2 rounded-lg cursor-pointer flex items-center justify-between group transition-colors
                                        ${activePersonaId === null 
                                            ? isDarkMode ? 'bg-white/10' : 'bg-gray-100' 
                                            : isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
                                            <Sparkles size={14} />
                                        </div>
                                        <div>
                                            <div className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Default User</div>
                                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Standard Context</div>
                                        </div>
                                    </div>
                                    {activePersonaId === null && <Check size={14} className="text-green-500" />}
                                </div>

                                {/* Custom Personas */}
                                {isLoading ? (
                                    <div className="py-4 flex justify-center opacity-50"><Loader2 className="animate-spin" /></div>
                                ) : (
                                    personas.map(persona => (
                                        <div 
                                            key={persona.id}
                                            onClick={() => { onSelect(persona.id); setIsOpen(false); }}
                                            className={`p-2 rounded-lg cursor-pointer flex items-center justify-between group transition-colors relative
                                                ${activePersonaId === persona.id 
                                                    ? isDarkMode ? 'bg-white/10' : 'bg-gray-100' 
                                                    : isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}
                                            `}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-indigo-500 text-white font-bold text-xs`}>
                                                    {persona.name[0].toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className={`text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{persona.name}</div>
                                                    <div className={`text-xs truncate ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{persona.description || 'Custom Profile'}</div>
                                                </div>
                                            </div>
                                            
                                            {activePersonaId === persona.id ? (
                                                <Check size={14} className="text-green-500 flex-shrink-0" />
                                            ) : (
                                                <button 
                                                    onClick={(e) => handleDelete(persona.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded absolute right-2"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </>
        )}
    </div>
  );
};

export default PersonaSelector;
