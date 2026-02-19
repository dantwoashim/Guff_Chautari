import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    Plus,
    Search,
    MoreHorizontal,
    Filter,
    Archive,
    MessageSquare,
    Users,
    Settings,
    LogOut,
    Star,
    Check,
    ArrowLeft,
    Upload,
    Clipboard,
    GitBranch,
    Brain,
    Library,
    GitMerge,
    ArrowLeftRight,
    Cpu,
    Target,
    Activity,
    Heart,
    Clock,
    Headphones,
    Code,
    LayoutGrid,
    Layers,
    TrendingUp,
    Network,
    Globe,
    ShieldCheck,
    Lock
} from '../Icons';
import { Conversation, Persona } from '../../types';
import ConversationItem from '../chat/ConversationItem';
import ConversationContextMenu from '../chat/ConversationContextMenu';
import { useConversationActions } from '../../hooks/useConversationActions';

interface ConversationListProps {
    sessions: Conversation[];
    personas?: Persona[];  // NEW: Global personas to display
    currentSessionId: string | null;
    onSelectSession: (id: string) => void;
    onSelectPersona?: (personaId: string) => void;  // NEW: Handler for selecting a persona (starts new chat)
    onNewChat: () => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    isLoading?: boolean;
    onRetry?: () => void;
    title?: string;
    onViewArchived?: () => void;
    onOpenSettings?: () => void;
    onNavigate?: (view: string) => void;
    onOpenPanel?: (
      panel:
        | 'persona_import'
        | 'decision_room'
        | 'counterfactual_panel'
        | 'reflection_dashboard'
        | 'knowledge_workbench'
        | 'council_room'
        | 'boardroom'
        | 'workflow_workbench'
        | 'agent_dashboard'
        | 'activity_timeline'
        | 'autonomy_monitor'
        | 'emotional_dashboard'
        | 'plugin_studio'
        | 'template_gallery'
        | 'pack_gallery'
        | 'benchmark_dashboard'
        | 'creator_hub'
        | 'creator_analytics'
        | 'creator_earnings'
        | 'billing_dashboard'
        | 'team_playbooks'
        | 'team_dashboard'
        | 'workspace_settings'
        | 'cross_workspace_search'
        | 'org_admin_dashboard'
        | 'billing_admin'
        | 'key_vault_panel'
        | 'org_analytics_panel'
        | 'voice_chat'
        | 'ambient_mode'
        | 'api_memory_consent'
        | 'vertical_picker'
        | 'founder_dashboard'
        | 'research_dashboard'
        | 'career_dashboard'
        | 'health_dashboard'
        | 'locale_picker'
        | 'offline_queue'
        | 'platform_ops'
        | 'protocol_compiler'
    ) => void;
}

type SortOption = 'recent' | 'oldest' | 'alpha';
type FilterOption = 'all' | 'unread' | 'groups' | 'pinned';

const ConversationList: React.FC<ConversationListProps> = ({
    sessions,
    personas = [],  // NEW: Default to empty array
    currentSessionId,
    onSelectSession,
    onSelectPersona,  // NEW: Handler for persona selection
    onNewChat,
    searchTerm,
    setSearchTerm,
    isLoading,
    title = "Chats",
    onViewArchived,
    onOpenSettings,
    onNavigate,
    onOpenPanel
}) => {
    const [filter, setFilter] = useState<FilterOption>('all');
    const [sort, setSort] = useState<SortOption>('recent');

    // Dropdown States
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversation: Conversation } | null>(null);

    const filterRef = useRef<HTMLDivElement>(null);
    const moreRef = useRef<HTMLDivElement>(null);

    const { togglePin, toggleMute, toggleArchive, markUnread, executeDelete } = useConversationActions();

    // Close menus on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setShowFilterMenu(false);
            }
            if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
                setShowMoreMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, conversation: Conversation) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, conversation });
    };

    const handleContextAction = async (action: 'archive' | 'pin' | 'mute' | 'mark_unread' | 'delete') => {
        if (!contextMenu) return;
        const { conversation } = contextMenu;
        const currentPinnedCount = sessions.filter(s => s.is_pinned).length;

        switch (action) {
            case 'archive':
                await toggleArchive(conversation.id, !!conversation.is_archived);
                break;
            case 'pin':
                await togglePin(conversation.id, !!conversation.is_pinned, currentPinnedCount);
                break;
            case 'mute':
                await toggleMute(conversation.id, !!conversation.is_muted);
                break;
            case 'mark_unread':
                await markUnread(conversation.id); // Typically toggles or sets to unread
                break;
            case 'delete':
                if (window.confirm(`Delete chat with ${conversation.persona?.name}?`)) {
                    await executeDelete(conversation.id);
                }
                break;
        }
        setContextMenu(null);
    };

    const filteredSessions = useMemo(() => {
        // Build a map of persona_id -> conversation for quick lookup
        const conversationsByPersona = new Map<string, Conversation>();
        sessions.forEach(s => {
            if (s.persona_id) {
                conversationsByPersona.set(s.persona_id, s);
            }
        });

        // Create unified list: existing conversations + personas without conversations
        let result: Conversation[] = [];

        // Add all personas (either with their conversation or as virtual items)
        personas.forEach(persona => {
            const existingConv = conversationsByPersona.get(persona.id);
            if (existingConv) {
                // Use existing conversation with persona data merged
                result.push({ ...existingConv, persona });
            } else {
                // Create a "virtual" conversation item for personas without chats
                result.push({
                    id: `persona-${persona.id}`, // Virtual ID
                    persona_id: persona.id,
                    user_id: '',
                    created_at: persona.created_at || new Date().toISOString(),
                    last_message_at: null,
                    last_message_text: persona.status_text || 'Start chatting',
                    unread_count: 0,
                    is_pinned: false,
                    is_muted: false,
                    is_archived: false,
                    persona: persona
                } as Conversation);
            }
        });

        // 1. Search
        if (searchTerm) {
            result = result.filter(s =>
                (s.persona?.name || 'New Chat').toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // 2. Filter
        if (filter === 'unread') {
            result = result.filter(s => (s.unread_count || 0) > 0);
        } else if (filter === 'pinned') {
            result = result.filter(s => s.is_pinned);
        } else if (filter === 'groups') {
            result = [];
        }

        // 3. Sort: Conversations with messages first, then personas without
        result = [...result].sort((a, b) => {
            // Pinned always first
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;

            // Items with messages before items without
            const aHasMessages = !!a.last_message_at;
            const bHasMessages = !!b.last_message_at;
            if (aHasMessages && !bHasMessages) return -1;
            if (!aHasMessages && bHasMessages) return 1;

            if (sort === 'alpha') {
                return (a.persona?.name || '').localeCompare(b.persona?.name || '');
            }
            const timeA = new Date(a.last_message_at || (a as any).created_at || 0).getTime();
            const timeB = new Date(b.last_message_at || (b as any).created_at || 0).getTime();
            return sort === 'oldest' ? timeA - timeB : timeB - timeA;
        });

        return result;
    }, [sessions, personas, searchTerm, filter, sort]);

    const isArchivedView = title === "Archived";

    return (
        <div className="flex flex-col h-full bg-[#111b21] w-full border-r border-[#313d45]">
            {/* 1. Header */}
            <div className="h-[59px] px-4 flex items-center justify-between bg-[#202c33] shrink-0 border-b border-transparent">
                <div className="flex items-center gap-3">
                    {isArchivedView && onNavigate && (
                        <button onClick={() => onNavigate('chat')} className="text-[#aebac1] hover:text-white transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <h1 className="text-xl font-bold text-[#e9edef] tracking-tight">{title}</h1>
                </div>

                <div className="flex items-center gap-2.5 text-[#aebac1]">
                    <button
                        onClick={onNewChat}
                        className="p-2 hover:bg-[#374248] rounded-full transition-colors"
                        title="New Chat"
                    >
                        <Plus size={20} strokeWidth={2.5} />
                    </button>

                    <div className="relative" ref={moreRef}>
                        <button
                            onClick={() => setShowMoreMenu(!showMoreMenu)}
                            className={`p-2 hover:bg-[#374248] rounded-full transition-colors ${showMoreMenu ? 'bg-[#374248] text-[#e9edef]' : ''}`}
                        >
                            <MoreHorizontal size={20} strokeWidth={2.5} />
                        </button>

                        {showMoreMenu && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-[#233138] rounded-md shadow-xl py-2 border border-[#111b21]/50 z-50 animate-scale-in origin-top-right">
                                <button className="w-full px-4 py-2.5 text-left text-[14.5px] text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3">
                                    <Users size={16} /> New Group
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); if (onNavigate) onNavigate('starred'); }}
                                    className="w-full px-4 py-2.5 text-left text-[14.5px] text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Star size={16} /> Starred messages
                                </button>
                                {!isArchivedView && (
                                    <button
                                        onClick={() => { setShowMoreMenu(false); onViewArchived?.(); }}
                                        className="w-full px-4 py-2.5 text-left text-[14.5px] text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                    >
                                        <Archive size={16} /> Archived
                                    </button>
                                )}
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenSettings?.(); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Settings size={16} /> Settings
                                </button>
                                <div className="h-px bg-[#313d45] my-1 opacity-50" />
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('persona_import'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Upload size={16} /> Import Persona
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('decision_room'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Clipboard size={16} /> Decision Room
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('counterfactual_panel'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <GitBranch size={16} /> What If Lab
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('reflection_dashboard'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Brain size={16} /> Reflection Dashboard
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('knowledge_workbench'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Library size={16} /> Knowledge Workbench
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('council_room'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <GitMerge size={16} /> Council Room
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('boardroom'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <ArrowLeftRight size={16} /> AI Boardroom
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('workflow_workbench'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Cpu size={16} /> Workflow Workbench
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('agent_dashboard'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Target size={16} /> Agent Dashboard
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('activity_timeline'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Activity size={16} /> Activity Timeline
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('autonomy_monitor'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <ShieldCheck size={16} /> Autonomy Monitor
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('emotional_dashboard'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Heart size={16} /> Emotional Continuity
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('voice_chat'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Headphones size={16} /> Voice Chat
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('ambient_mode'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Clock size={16} /> Ambient Mode
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('plugin_studio'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Code size={16} /> Plugin Studio
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('template_gallery'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <LayoutGrid size={16} /> Template Gallery
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('pack_gallery'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Layers size={16} /> Pack Gallery
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('benchmark_dashboard'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <TrendingUp size={16} /> Benchmark Dashboard
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('creator_hub'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Users size={16} /> Creator Hub
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('creator_analytics'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <TrendingUp size={16} /> Creator Analytics
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('creator_earnings'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <TrendingUp size={16} /> Creator Earnings
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('billing_dashboard'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Activity size={16} /> Billing Dashboard
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('team_playbooks'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Clipboard size={16} /> Team Playbooks
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('team_dashboard'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Network size={16} /> Team Dashboard
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('workspace_settings'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Settings size={16} /> Workspace Settings
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('cross_workspace_search'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Search size={16} /> Workspace Search
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('org_admin_dashboard'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <ShieldCheck size={16} /> Org Admin Dashboard
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('billing_admin'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <ShieldCheck size={16} /> Billing Admin
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('key_vault_panel'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Lock size={16} /> Managed Key Vault
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('org_analytics_panel'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <TrendingUp size={16} /> Org Analytics
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('api_memory_consent'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Settings size={16} /> Memory Consent
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('platform_ops'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <ShieldCheck size={16} /> Platform Ops
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('vertical_picker'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <LayoutGrid size={16} /> Vertical Picker
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('founder_dashboard'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Target size={16} /> Founder Dashboard
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('research_dashboard'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Library size={16} /> Research Dashboard
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('career_dashboard'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <TrendingUp size={16} /> Career Dashboard
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('health_dashboard'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Heart size={16} /> Health Dashboard
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('locale_picker'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Globe size={16} /> Language & Region
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('offline_queue'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Clock size={16} /> Offline Queue
                                </button>
                                <button
                                    onClick={() => { setShowMoreMenu(false); onOpenPanel?.('protocol_compiler'); }}
                                    className="w-full px-4 py-2.5 text-left text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                                >
                                    <Clipboard size={16} /> Protocol Compiler
                                </button>
                                <div className="h-px bg-[#313d45] my-1 opacity-50" />
                                <button className="w-full px-4 py-2.5 text-left text-[14.5px] text-red-400 hover:bg-[#111b21] transition-colors flex items-center gap-3">
                                    <LogOut size={16} /> Log out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 2. Search & Filter */}
            <div className="px-3 py-2 shrink-0 border-b border-[#313d45]/30">
                <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0] transition-colors">
                            <Search size={18} />
                        </div>
                        <input
                            type="text"
                            placeholder="Search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-[#202c33] rounded-lg py-[7px] pl-10 pr-4 text-[14px] text-[#e9edef] placeholder-[#8696a0] outline-none border border-transparent focus:border-[#00a884]/0"
                        />
                    </div>

                    <div className="relative" ref={filterRef}>
                        <button
                            onClick={() => setShowFilterMenu(!showFilterMenu)}
                            className={`p-1.5 rounded-full transition-colors ${showFilterMenu ? 'bg-[#00a884] text-white' : filter !== 'all' ? 'text-[#00a884]' : 'text-[#8696a0] hover:bg-[#202c33] hover:text-[#e9edef]'}`}
                        >
                            <Filter size={18} strokeWidth={filter !== 'all' ? 2.5 : 2} />
                        </button>

                        {showFilterMenu && (
                            <div className="absolute right-0 top-full mt-1 w-52 bg-[#233138] rounded-md shadow-xl py-2 border border-[#111b21]/50 z-50 animate-scale-in origin-top-right">
                                <div className="px-4 py-2 text-[13px] font-bold text-[#8696a0] uppercase tracking-wider">Filter By</div>
                                <FilterMenuItem label="Unread" active={filter === 'unread'} onClick={() => { setFilter(filter === 'unread' ? 'all' : 'unread'); setShowFilterMenu(false); }} />
                                <FilterMenuItem label="Pinned" active={filter === 'pinned'} onClick={() => { setFilter(filter === 'pinned' ? 'all' : 'pinned'); setShowFilterMenu(false); }} />
                                <FilterMenuItem label="Groups" active={filter === 'groups'} onClick={() => { setFilter(filter === 'groups' ? 'all' : 'groups'); setShowFilterMenu(false); }} />

                                <div className="h-px bg-[#313d45] my-2 opacity-50" />

                                <div className="px-4 py-2 text-[13px] font-bold text-[#8696a0] uppercase tracking-wider">Sort By</div>
                                <FilterMenuItem label="Recent" active={sort === 'recent'} onClick={() => { setSort('recent'); setShowFilterMenu(false); }} />
                                <FilterMenuItem label="Oldest" active={sort === 'oldest'} onClick={() => { setSort('oldest'); setShowFilterMenu(false); }} />
                                <FilterMenuItem label="Name (A-Z)" active={sort === 'alpha'} onClick={() => { setSort('alpha'); setShowFilterMenu(false); }} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Chips */}
                <div className="flex items-center gap-2 mt-2 overflow-x-auto scrollbar-hide pb-1">
                    {['All', 'Unread', 'Groups'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(filter === f.toLowerCase() ? 'all' : f.toLowerCase() as FilterOption)}
                            className={`
                        px-3 py-1 rounded-full text-[13px] font-medium transition-colors
                        ${filter === f.toLowerCase()
                                    ? 'bg-[#005c4b]/30 text-[#00a884]'
                                    : 'bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942]'}
                    `}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. Archived Row (Hidden in archived view) */}
            {!isArchivedView && (
                <div
                    onClick={onViewArchived}
                    className="px-4 py-3 flex items-center gap-4 text-[#e9edef] hover:bg-[#202c33] cursor-pointer transition-colors shrink-0"
                >
                    <div className="w-5 flex justify-center"><Archive size={18} className="text-[#00a884]" /></div>
                    <span className="text-[15px] font-medium">Archived</span>
                </div>
            )}

            {/* 4. Chat List */}
            <div className="flex-1 overflow-y-auto wa-scroll">
                {isLoading ? (
                    <div className="p-4 text-center text-[#8696a0] text-sm">Loading chats...</div>
                ) : filteredSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center opacity-60">
                        <div className="mb-2 text-[#8696a0]"><Filter size={32} /></div>
                        <p className="text-[#8696a0] text-sm">No chats found</p>
                    </div>
                ) : (
                    filteredSessions.map(session => {
                        // Check if this is a virtual item (no existing conversation)
                        const isVirtualItem = session.id.startsWith('persona-');
                        const personaId = session.persona_id;

                        return (
                            <ConversationItem
                                key={session.id}
                                id={session.id}
                                personaId={personaId}
                                personaName={session.persona?.name || 'Unknown'}
                                personaAvatar={session.persona?.avatar_url}
                                lastMessage={session.last_message_text}
                                lastMessageAt={session.last_message_at}
                                unreadCount={session.unread_count || 0}
                                isSelected={session.id === currentSessionId || (isVirtualItem && session.persona_id === currentSessionId)}
                                onClick={() => {
                                    if (isVirtualItem && onSelectPersona) {
                                        // New chat with persona - call selectPersona which creates conversation
                                        onSelectPersona(personaId);
                                    } else {
                                        // Existing conversation - select it
                                        onSelectSession(session.id);
                                    }
                                }}
                                isPinned={session.is_pinned}
                                isMuted={session.is_muted}
                                isOnline={session.persona?.is_online || false}
                                isTyping={false}
                                onContextMenu={(e) => handleContextMenu(e, session)}
                            />
                        );
                    })
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <ConversationContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    isPinned={contextMenu.conversation.is_pinned}
                    isMuted={contextMenu.conversation.is_muted}
                    hasUnread={contextMenu.conversation.unread_count > 0}
                    onClose={() => setContextMenu(null)}
                    onAction={handleContextAction}
                />
            )}
        </div>
    );
};

const FilterMenuItem: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className="w-full px-4 py-2 text-left text-[14px] text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center justify-between group"
    >
        <span>{label}</span>
        {active && <Check size={16} className="text-[#00a884]" />}
    </button>
);

export default ConversationList;
