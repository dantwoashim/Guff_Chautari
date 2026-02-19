/**
 * @file components/admin/PersonaList.tsx
 * @description List of global personas with actions
 */
import React from 'react';
import { Persona } from '../../types';
import { Zap, Edit, Trash2, ToggleLeft, ToggleRight, Image as ImageIcon, CheckCircle, Clock } from '../Icons';

interface PersonaListProps {
    personas: Persona[];
    onEdit: (persona: Persona) => void;
    onProcess: (personaId: string) => void;
    onToggleActive: (personaId: string, isActive: boolean) => void;
    onDelete: (personaId: string) => void;
    processingId: string | null;
}

const PersonaList: React.FC<PersonaListProps> = ({
    personas,
    onEdit,
    onProcess,
    onToggleActive,
    onDelete,
    processingId
}) => {
    if (personas.length === 0) {
        return (
            <div className="text-center py-12 text-[#8696a0]">
                <p className="text-lg">No personas yet</p>
                <p className="text-sm mt-2">Create your first global persona to get started</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-[#2a3942] text-left">
                        <th className="pb-3 text-[#8696a0] text-xs font-medium">Persona</th>
                        <th className="pb-3 text-[#8696a0] text-xs font-medium">Status</th>
                        <th className="pb-3 text-[#8696a0] text-xs font-medium">Processed</th>
                        <th className="pb-3 text-[#8696a0] text-xs font-medium text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {personas.map((persona: any) => (
                        <tr
                            key={persona.id}
                            className="border-b border-[#2a3942]/30 hover:bg-[#2a3942]/20 transition-colors"
                        >
                            {/* Persona Info */}
                            <td className="py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#2a3942] overflow-hidden flex items-center justify-center">
                                        {persona.avatar_url ? (
                                            <img
                                                src={persona.avatar_url}
                                                alt={persona.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-lg text-[#00a884]">
                                                {persona.name?.[0]?.toUpperCase() || '?'}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <div className="text-[#e9edef] font-medium">{persona.name}</div>
                                        <div className="text-[#8696a0] text-xs truncate max-w-[200px]">
                                            {persona.description || 'No description'}
                                        </div>
                                    </div>
                                </div>
                            </td>

                            {/* Active Status */}
                            <td className="py-4">
                                <button
                                    onClick={() => onToggleActive(persona.id, !persona.is_active)}
                                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs transition-colors ${persona.is_active
                                        ? 'bg-[#00a884]/20 text-[#00a884]'
                                        : 'bg-[#8696a0]/20 text-[#8696a0]'
                                        }`}
                                >
                                    {persona.is_active ? (
                                        <>
                                            <ToggleRight size={14} />
                                            Active
                                        </>
                                    ) : (
                                        <>
                                            <ToggleLeft size={14} />
                                            Inactive
                                        </>
                                    )}
                                </button>
                            </td>

                            {/* Processing Status */}
                            <td className="py-4">
                                {processingId === persona.id ? (
                                    <div className="flex items-center gap-2 text-[#f59e0b]">
                                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        <span className="text-xs">Processing...</span>
                                    </div>
                                ) : persona.is_processed ? (
                                    <div className="flex items-center gap-2 text-[#00a884]">
                                        <CheckCircle size={14} />
                                        <span className="text-xs">Ready</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-[#8696a0]">
                                        <Clock size={14} />
                                        <span className="text-xs">Not processed</span>
                                    </div>
                                )}
                            </td>

                            {/* Actions */}
                            <td className="py-4">
                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        onClick={() => onProcess(persona.id)}
                                        disabled={processingId !== null}
                                        className="p-2 rounded-lg bg-[#f59e0b]/20 text-[#f59e0b] hover:bg-[#f59e0b]/30 
                                                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        title="Process Persona (Run AI Analysis)"
                                    >
                                        <Zap size={16} />
                                    </button>
                                    <button
                                        onClick={() => onEdit(persona)}
                                        className="p-2 rounded-lg bg-[#3b82f6]/20 text-[#3b82f6] hover:bg-[#3b82f6]/30 transition-colors"
                                        title="Edit Persona"
                                    >
                                        <Edit size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            console.log('[PersonaList] Deleting:', persona.name, persona.id);
                                            onDelete(persona.id);
                                        }}
                                        className="p-2 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors"
                                        title="Delete Persona"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default PersonaList;
