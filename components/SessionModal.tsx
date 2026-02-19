
/**
 * @file SessionModal.tsx
 * @description Modal for creating and managing sessions in AI Studio
 */
import React, { useState, useEffect } from 'react';
import { X, Layers, Plus, Loader2 } from './Icons';
import { messageRepository, personaRepository, sessionRepository } from '../src/data/repositories';
interface SessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId?: string;
    isDarkMode?: boolean;
    onSessionCreated?: (session: any) => void;
}
interface Persona {
    id: string;
    name: string;
    avatar_url?: string;
}
const SessionModal: React.FC<SessionModalProps> = ({
    isOpen,
    onClose,
    userId,
    isDarkMode,
    onSessionCreated
}) => {
    const [title, setTitle] = useState('New Session');
    const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    // Load personas from database
    useEffect(() => {
        if (!isOpen || !userId) return;
        const loadPersonas = async () => {
            setIsLoading(true);
            try {
                const data = await personaRepository.listByUser(userId);
                setPersonas(data);
            } catch (error) {
                console.error('Failed to load personas:', error);
                setPersonas([]);
            } finally {
                setIsLoading(false);
            }
        };
        loadPersonas();
    }, [isOpen, userId]);
    const handleCreate = async () => {
        if (!userId) return;
        setIsCreating(true);
        try {
            await sessionRepository.deactivateByUser(userId);
            const data = await sessionRepository.createSession({
                userId,
                title: title || 'New Session',
                personaId: selectedPersonaId || null,
                sessionConfig: {}
            });
            console.log('[SessionModal] Created session:', data);
            await messageRepository.createChat({
                userId,
                sessionId: data.id,
                personaId: selectedPersonaId || null,
                title: 'New Chat',
                messages: [],
            });
            onSessionCreated?.(data);
            onClose();
        } catch (error) {
            console.error('Failed to create session:', error);
            alert('Failed to create session. Make sure the sessions table exists in Supabase.');
        } finally {
            setIsCreating(false);
        }
    };
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />
            {/* Modal */}
            <div className={`relative w-full max-w-md mx-4 p-6 rounded-2xl ${isDarkMode ? 'bg-gray-900' : 'bg-white'} shadow-2xl`}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                            <Layers size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                New Session
                            </h2>
                            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                Create a new persona session
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
                    >
                        <X size={20} />
                    </button>
                </div>
                {/* Form */}
                <div className="space-y-4">
                    {/* Session Title */}
                    <div>
                        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Session Name
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="My Session"
                            className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all ${isDarkMode
                                    ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                                }`}
                        />
                    </div>
                    {/* Persona Selection */}
                    <div>
                        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Select Persona
                        </label>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="animate-spin text-amber-500" size={24} />
                            </div>
                        ) : (
                            <select
                                value={selectedPersonaId}
                                onChange={(e) => setSelectedPersonaId(e.target.value)}
                                className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all ${isDarkMode
                                        ? 'bg-gray-800 border-gray-700 text-white'
                                        : 'bg-gray-50 border-gray-200 text-gray-900'
                                    }`}
                            >
                                <option value="">No Persona (Default AI)</option>
                                {personas.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        )}
                        {personas.length === 0 && !isLoading && (
                            <p className={`mt-2 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                Create personas in Our Site to see them here
                            </p>
                        )}
                    </div>
                </div>
                {/* Actions */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all ${isDarkMode
                                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={isCreating}
                        className="flex-1 px-4 py-3 rounded-xl font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isCreating ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Plus size={18} />
                                Create Session
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
export default SessionModal;
