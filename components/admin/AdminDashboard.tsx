/**
 * @file components/admin/AdminDashboard.tsx
 * @description Main admin dashboard with persona management
 */
import React, { useState, useEffect } from 'react';
import { Users, Settings, Shield, X, Plus, RefreshCw } from '../Icons';
import {
    fetchAllUsers,
    fetchAllPersonas,
    fetchSystemStats,
    togglePersonaActive,
    deletePersona,
    UserStats,
    SystemStats
} from '../../services/adminService';
import { preprocessPersona, ProcessingProgress } from '../../services/personaPreprocessor';
import { Persona } from '../../types';
import PersonaList from './PersonaList';
import PersonaEditor from './PersonaEditor';
import ProcessingStatus from './ProcessingStatus';

interface AdminDashboardProps {
    userId: string;
    onClose: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ userId, onClose }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'personas' | 'settings'>('personas');
    const [users, setUsers] = useState<UserStats[]>([]);
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [loading, setLoading] = useState(true);

    // Editor state
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingPersona, setEditingPersona] = useState<Persona | null>(null);

    // Processing state
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [processingOpen, setProcessingOpen] = useState(false);
    const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
    const [processingComplete, setProcessingComplete] = useState(false);
    const [processingError, setProcessingError] = useState<string | null>(null);
    const [processingName, setProcessingName] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        const [usersData, personasData, statsData] = await Promise.all([
            fetchAllUsers(),
            fetchAllPersonas(),
            fetchSystemStats()
        ]);
        setUsers(usersData);
        setPersonas(personasData);
        setStats(statsData);
        setLoading(false);
    };

    const handleEdit = (persona: Persona) => {
        setEditingPersona(persona);
        setEditorOpen(true);
    };

    const handleCreate = () => {
        setEditingPersona(null);
        setEditorOpen(true);
    };

    const handleProcess = async (personaId: string) => {
        const persona = personas.find(p => p.id === personaId);
        if (!persona) return;

        setProcessingId(personaId);
        setProcessingName(persona.name);
        setProcessingProgress(null);
        setProcessingComplete(false);
        setProcessingError(null);
        setProcessingOpen(true);

        const result = await preprocessPersona(personaId, (progress) => {
            setProcessingProgress(progress);
        });

        setProcessingComplete(true);
        setProcessingId(null);

        if (!result.success) {
            setProcessingError(result.error || 'Unknown error');
        } else {
            // Reload personas to show updated status
            const updatedPersonas = await fetchAllPersonas();
            setPersonas(updatedPersonas);
        }
    };

    const handleToggleActive = async (personaId: string, isActive: boolean) => {
        await togglePersonaActive(personaId, isActive);
        setPersonas(prev => prev.map(p =>
            p.id === personaId ? { ...p, is_active: isActive } as any : p
        ));
    };

    const handleDelete = async (personaId: string) => {
        console.log('[AdminDashboard] Deleting persona:', personaId);
        try {
            const success = await deletePersona(personaId);
            if (success) {
                console.log('[AdminDashboard] Delete successful');
                setPersonas(prev => prev.filter(p => p.id !== personaId));
            } else {
                console.error('[AdminDashboard] Delete failed - function returned false');
                alert('Failed to delete persona. Check console for details.');
            }
        } catch (error) {
            console.error('[AdminDashboard] Delete error:', error);
            alert('Error deleting persona: ' + (error as Error).message);
        }
    };

    const handleEditorClose = () => {
        setEditorOpen(false);
        setEditingPersona(null);
    };

    const handleEditorSaved = async () => {
        const updatedPersonas = await fetchAllPersonas();
        setPersonas(updatedPersonas);
    };

    return (
        <>
            <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
                <div className="bg-[#111b21] rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl border border-[#2a3942]">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-[#2a3942]">
                        <h1 className="text-xl font-bold text-[#e9edef] flex items-center gap-2">
                            <Shield size={24} className="text-[#00a884]" />
                            Admin Dashboard
                        </h1>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={loadData}
                                className="p-2 hover:bg-[#2a3942] rounded-full text-[#8696a0] hover:text-[#e9edef]"
                                title="Refresh"
                            >
                                <RefreshCw size={18} />
                            </button>
                            <button onClick={onClose} className="p-2 hover:bg-[#2a3942] rounded-full">
                                <X size={20} className="text-[#8696a0]" />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-[#2a3942]">
                        {['overview', 'personas', 'users', 'settings'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={`px-6 py-3 text-sm font-medium capitalize transition-colors
                                    ${activeTab === tab
                                        ? 'text-[#00a884] border-b-2 border-[#00a884]'
                                        : 'text-[#8696a0] hover:text-[#e9edef]'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
                        {loading ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="animate-spin w-8 h-8 border-2 border-[#00a884] border-t-transparent rounded-full" />
                            </div>
                        ) : (
                            <>
                                {/* Overview Tab */}
                                {activeTab === 'overview' && (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <StatCard label="Total Users" value={stats?.total_users || 0} />
                                            <StatCard label="Conversations" value={stats?.total_conversations || 0} />
                                            <StatCard label="Personas" value={stats?.total_personas || 0} />
                                            <StatCard label="Processed" value={stats?.processed_personas || 0} color="green" />
                                        </div>
                                    </div>
                                )}

                                {/* Personas Tab */}
                                {activeTab === 'personas' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h2 className="text-lg font-semibold text-[#e9edef]">Global Personas</h2>
                                                <p className="text-sm text-[#8696a0]">
                                                    {personas.length} persona{personas.length !== 1 ? 's' : ''} •
                                                    {personas.filter((p: any) => p.is_processed).length} processed
                                                </p>
                                            </div>
                                            <button
                                                onClick={handleCreate}
                                                className="flex items-center gap-2 px-4 py-2 bg-[#00a884] text-[#111b21] 
                                                         rounded-lg font-medium hover:bg-[#00a884]/80 transition-colors"
                                            >
                                                <Plus size={18} />
                                                New Persona
                                            </button>
                                        </div>
                                        <PersonaList
                                            personas={personas}
                                            onEdit={handleEdit}
                                            onProcess={handleProcess}
                                            onToggleActive={handleToggleActive}
                                            onDelete={handleDelete}
                                            processingId={processingId}
                                        />
                                    </div>
                                )}

                                {/* Users Tab */}
                                {activeTab === 'users' && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-[#2a3942] text-left">
                                                    <th className="pb-3 text-[#8696a0] text-xs">Email</th>
                                                    <th className="pb-3 text-[#8696a0] text-xs">Joined</th>
                                                    <th className="pb-3 text-[#8696a0] text-xs">Conversations</th>
                                                    <th className="pb-3 text-[#8696a0] text-xs">Last Active</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {users.map(user => (
                                                    <tr key={user.id} className="border-b border-[#2a3942]/30">
                                                        <td className="py-3 text-[#e9edef]">{user.email}</td>
                                                        <td className="py-3 text-[#8696a0]">
                                                            {new Date(user.created_at).toLocaleDateString()}
                                                        </td>
                                                        <td className="py-3 text-[#e9edef]">{user.conversation_count}</td>
                                                        <td className="py-3 text-[#8696a0]">
                                                            {user.last_active
                                                                ? new Date(user.last_active).toLocaleDateString()
                                                                : 'Never'}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {users.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="py-8 text-center text-[#8696a0]">
                                                            No users yet
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Settings Tab */}
                                {activeTab === 'settings' && (
                                    <div className="text-[#8696a0]">
                                        <p>System settings coming soon...</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Persona Editor Modal */}
            <PersonaEditor
                isOpen={editorOpen}
                onClose={handleEditorClose}
                persona={editingPersona}
                onSaved={handleEditorSaved}
            />

            {/* Processing Status Modal */}
            <ProcessingStatus
                isOpen={processingOpen}
                onClose={() => setProcessingOpen(false)}
                personaName={processingName}
                personaId={processingId || undefined}
                progress={processingProgress}
                isComplete={processingComplete}
                error={processingError}
            />
        </>
    );
};

const StatCard = ({ label, value, color = 'default' }: { label: string; value: number; color?: string }) => (
    <div className="p-4 rounded-xl bg-[#2a3942]/50 border border-[#2a3942]">
        <div className={`text-2xl font-bold ${color === 'green' ? 'text-[#00a884]' : 'text-[#e9edef]'}`}>
            {value}
        </div>
        <div className="text-xs text-[#8696a0]">{label}</div>
    </div>
);

export default AdminDashboard;
