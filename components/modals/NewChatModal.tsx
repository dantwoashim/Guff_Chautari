
import React, { useState, useMemo } from 'react';
import { X, Search, ArrowLeft, MessageSquare, Sparkles, Star, Plus, Loader2, Save } from '../Icons';
import { Persona } from '../../types';
import { createPersona } from '../../services/geminiService';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  personas: Persona[];
  onSelectPersona: (personaId: string, withMemory: boolean) => void;
  userId: string;
}

const NewChatModal: React.FC<NewChatModalProps> = ({
  isOpen,
  onClose,
  personas,
  onSelectPersona,
  userId
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [step, setStep] = useState<'select' | 'options' | 'create'>('select');
  
  const filteredPersonas = useMemo(() => {
    if (!searchQuery.trim()) return personas;
    const q = searchQuery.toLowerCase();
    return personas.filter(p => 
      p.name.toLowerCase().includes(q) ||
      p.status_text?.toLowerCase().includes(q)
    );
  }, [personas, searchQuery]);

  const handlePersonaSelect = (persona: Persona) => {
    setSelectedPersona(persona);
    setStep('options');
  };

  const handleConfirm = (withMemory: boolean) => {
    if (!selectedPersona) return;
    onSelectPersona(selectedPersona.id, withMemory);
    handleClose();
  };

  const handleClose = () => {
      setStep('select');
      setSearchQuery('');
      setSelectedPersona(null);
      onClose();
  };

  const handleCreateSuccess = (newPersona: Persona) => {
      onSelectPersona(newPersona.id, false); // Start fresh with new persona
      handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#202c33] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-[#2a3942] animate-scale-in flex flex-col max-h-[80vh]">
        {step === 'select' ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#2a3942] shrink-0">
              <h2 className="text-lg font-medium text-[#e9edef]">
                Select Persona
              </h2>
              <button onClick={handleClose} className="p-2 hover:bg-[#2a3942] rounded-full transition-colors">
                <X size={20} className="text-[#8696a0]" />
              </button>
            </div>
            
            {/* Search */}
            <div className="p-3 border-b border-[#2a3942] shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0]" size={18} />
                <input
                  type="text"
                  placeholder="Search personas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#111b21] rounded-lg py-2 pl-10 pr-4 text-[#e9edef] placeholder-[#8696a0] outline-none border border-transparent focus:border-[#00a884]/50 transition-all"
                  autoFocus
                />
              </div>
            </div>
            
            {/* Persona List */}
            <div className="overflow-y-auto custom-scrollbar flex-1 p-2">
              <button
                onClick={() => setStep('create')}
                className="w-full flex items-center gap-4 p-3 hover:bg-[#2a3942] transition-colors rounded-xl group mb-2 border border-dashed border-[#2a3942] hover:border-[#00a884]/30"
              >
                <div className="w-12 h-12 rounded-full bg-[#00a884]/10 flex items-center justify-center border border-[#00a884]/20 group-hover:bg-[#00a884]/20 transition-colors">
                    <Plus size={24} className="text-[#00a884]" />
                </div>
                <div className="text-left">
                    <div className="font-medium text-[#e9edef]">Create New Persona</div>
                    <div className="text-sm text-[#8696a0]">Design a custom AI character</div>
                </div>
              </button>

              {filteredPersonas.length === 0 && searchQuery && (
                <div className="p-8 text-center text-[#8696a0] flex flex-col items-center">
                  <div className="w-12 h-12 bg-[#2a3942] rounded-full flex items-center justify-center mb-3">
                    <Search size={24} opacity={0.5} />
                  </div>
                  <p>No personas found</p>
                </div>
              )}

              {filteredPersonas.map(persona => (
                  <button
                    key={persona.id}
                    onClick={() => handlePersonaSelect(persona)}
                    className="w-full flex items-center gap-4 p-3 hover:bg-[#2a3942] transition-colors rounded-xl group"
                  >
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-[#2a3942] flex items-center justify-center overflow-hidden border border-[#2a3942] group-hover:border-[#00a884]/30">
                            {persona.avatar_url ? (
                                <img src={persona.avatar_url} className="w-full h-full object-cover" alt={persona.name} />
                            ) : (
                                <span className="text-lg text-[#8696a0] font-bold">{persona.name[0]}</span>
                            )}
                        </div>
                        {persona.is_online && (
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#00a884] rounded-full border-2 border-[#202c33]" />
                        )}
                    </div>
                    
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-medium text-[#e9edef] flex items-center gap-2">
                        {persona.name}
                      </div>
                      <div className="text-sm text-[#8696a0] truncate">
                        {persona.status_text || persona.description || 'Available'}
                      </div>
                    </div>
                  </button>
                ))
              }
            </div>
          </>
        ) : step === 'options' && selectedPersona ? (
          <MemoryOptions 
            persona={selectedPersona}
            onBack={() => setStep('select')}
            onConfirm={handleConfirm}
          />
        ) : step === 'create' ? (
            <CreatePersonaForm 
                userId={userId}
                onBack={() => setStep('select')}
                onSuccess={handleCreateSuccess}
            />
        ) : null}
      </div>
    </div>
  );
};

interface MemoryOptionsProps {
  persona: Persona;
  onBack: () => void;
  onConfirm: (withMemory: boolean) => void;
}

const MemoryOptions: React.FC<MemoryOptionsProps> = ({ persona, onBack, onConfirm }) => {
  return (
    <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-[#2a3942] shrink-0">
            <button onClick={onBack} className="p-2 -ml-2 hover:bg-[#2a3942] rounded-full transition-colors text-[#8696a0] hover:text-[#e9edef]">
            <ArrowLeft size={20} />
            </button>
            <h3 className="text-[#e9edef] font-medium text-lg">Start Chat</h3>
        </div>

        <div className="p-6 flex flex-col items-center flex-1">
            <div className="w-20 h-20 rounded-full bg-[#2a3942] mb-4 overflow-hidden border-4 border-[#111b21] shadow-xl">
                {persona.avatar_url ? (
                    <img src={persona.avatar_url} className="w-full h-full object-cover" alt={persona.name} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl text-[#8696a0]">{persona.name[0]}</div>
                )}
            </div>
            <h2 className="text-xl font-bold text-[#e9edef] mb-1">{persona.name}</h2>
            <p className="text-sm text-[#8696a0] mb-8 max-w-[200px] text-center line-clamp-2">
                {persona.status_text || 'Choose how you want to start this conversation.'}
            </p>
            
            {/* Options */}
            <div className="space-y-3 w-full">
                <button
                onClick={() => onConfirm(false)}
                className="w-full p-4 bg-[#2a3942] hover:bg-[#374248] rounded-xl text-left transition-all border border-transparent hover:border-[#00a884]/30 group"
                >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Sparkles size={20} className="text-indigo-400" />
                    </div>
                    <div>
                    <div className="font-semibold text-[#e9edef]">Start New Conversation</div>
                    <div className="text-xs text-[#8696a0]">
                        Open a fresh chat with {persona.name}
                    </div>
                    </div>
                </div>
                </button>

                <button
                onClick={() => onConfirm(true)}
                className="w-full p-4 bg-[#2a3942] hover:bg-[#374248] rounded-xl text-left transition-all border border-transparent hover:border-[#00a884]/30 group"
                >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#00a884]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <MessageSquare size={20} className="text-[#00a884]" />
                    </div>
                    <div>
                    <div className="font-semibold text-[#e9edef]">Continue with Memory</div>
                    <div className="text-xs text-[#8696a0]">
                        Create a new chat but keep memory context
                    </div>
                    </div>
                </div>
                </button>
            </div>
            
            {/* Info */}
            <p className="mt-auto pt-6 text-[11px] text-[#8696a0]/60 text-center max-w-xs">
                Every time you start a chat, a new entry is added to your history. You can always revisit old conversations.
            </p>
        </div>
    </div>
  );
};

interface CreatePersonaFormProps {
    userId: string;
    onBack: () => void;
    onSuccess: (persona: Persona) => void;
}

const CreatePersonaForm: React.FC<CreatePersonaFormProps> = ({ userId, onBack, onSuccess }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [instruction, setInstruction] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !instruction) return;

        setIsSubmitting(true);
        try {
            const newPersona = await createPersona(userId, name, instruction, description, avatarUrl);
            if (newPersona) {
                onSuccess(newPersona);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to create persona");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <div className="flex items-center gap-3 p-4 border-b border-[#2a3942] shrink-0">
                <button type="button" onClick={onBack} className="p-2 -ml-2 hover:bg-[#2a3942] rounded-full transition-colors text-[#8696a0] hover:text-[#e9edef]">
                    <ArrowLeft size={20} />
                </button>
                <h3 className="text-[#e9edef] font-medium text-lg">Create New Persona</h3>
            </div>

            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-[#8696a0] uppercase tracking-wider mb-1.5">Name</label>
                    <input 
                        className="w-full bg-[#111b21] rounded-lg p-3 text-[#e9edef] placeholder-[#8696a0] outline-none border border-transparent focus:border-[#00a884]"
                        placeholder="e.g. Maya"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-[#8696a0] uppercase tracking-wider mb-1.5">Description</label>
                    <input 
                        className="w-full bg-[#111b21] rounded-lg p-3 text-[#e9edef] placeholder-[#8696a0] outline-none border border-transparent focus:border-[#00a884]"
                        placeholder="Short tagline (e.g. Friendly Assistant)"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-[#8696a0] uppercase tracking-wider mb-1.5">Avatar URL (Optional)</label>
                    <input 
                        className="w-full bg-[#111b21] rounded-lg p-3 text-[#e9edef] placeholder-[#8696a0] outline-none border border-transparent focus:border-[#00a884]"
                        placeholder="https://..."
                        value={avatarUrl}
                        onChange={e => setAvatarUrl(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-[#8696a0] uppercase tracking-wider mb-1.5">System Instructions</label>
                    <textarea 
                        className="w-full bg-[#111b21] rounded-lg p-3 text-[#e9edef] placeholder-[#8696a0] outline-none border border-transparent focus:border-[#00a884] min-h-[150px] resize-none"
                        placeholder="Define the personality, behavior, and traits..."
                        value={instruction}
                        onChange={e => setInstruction(e.target.value)}
                        required
                    />
                    <p className="text-[11px] text-[#8696a0] mt-1">
                        Tip: Be specific about how they should speak and behave.
                    </p>
                </div>
            </div>

            <div className="p-4 border-t border-[#2a3942]">
                <button 
                    type="submit"
                    disabled={isSubmitting || !name || !instruction}
                    className="w-full py-3 bg-[#00a884] hover:bg-[#008f72] text-[#111b21] font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    Create Persona
                </button>
            </div>
        </form>
    );
};

export default NewChatModal;
