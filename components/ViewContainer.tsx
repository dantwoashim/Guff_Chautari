import React, { useEffect, useMemo, useRef, lazy, Suspense, useState } from 'react';
import ChatInterface from './ChatInterface';
import ChatHistoryModal from './modals/ChatHistoryModal';
import { branchingService } from '../services/branchingService';
import { v4 as uuidv4 } from 'uuid';
import { Loader2 } from './Icons';
import { createPersona } from '../services/geminiService';
import { PersonaImportPanel } from '../src/components/persona/PersonaImportPanel';
import { DecisionRoomPanel } from '../src/components/decision/DecisionRoomPanel';
import { ReflectionDashboardPanel } from '../src/components/reflection/ReflectionDashboardPanel';
import { KnowledgeWorkbenchPanel } from '../src/components/knowledge/KnowledgeWorkbenchPanel';
import { CouncilPanel } from '../src/components/council/CouncilPanel';
import { BoardroomPanel } from '../src/components/boardroom/BoardroomPanel';
import { WorkflowWorkbenchPanel } from '../src/components/workflows/WorkflowWorkbenchPanel';
import { AgentDashboardPanel } from '../src/components/workflows/AgentDashboardPanel';
import { ActivityTimelinePanel } from '../src/components/activity/ActivityTimelinePanel';
import { EmotionalContinuityPanel } from '../src/components/analytics/EmotionalContinuityPanel';
import { AutonomyMonitorPanel } from '../src/components/autonomy/AutonomyMonitorPanel';
import { PluginStudioPanel } from '../src/components/plugins/PluginStudioPanel';
import { TemplateGalleryPanel } from '../src/components/marketplace/TemplateGalleryPanel';
import { PackGalleryPanel } from '../src/components/marketplace/PackGalleryPanel';
import { SharedPackPreviewPanel } from '../src/components/marketplace/SharedPackPreviewPanel';
import { CounterfactualPanel } from '../src/components/counterfactual/CounterfactualPanel';
import { BenchmarkPublishingPanel } from '../src/components/benchmark/BenchmarkPublishingPanel';
import { CreatorHubPanel } from '../src/components/creator/CreatorHubPanel';
import { CreatorAnalyticsPanel } from '../src/components/creator/CreatorAnalyticsPanel';
import { CreatorEarningsPanel } from '../src/components/creator/CreatorEarningsPanel';
import { BillingDashboardPanel } from '../src/components/billing/BillingDashboardPanel';
import { PlaybookPanel } from '../src/components/team/PlaybookPanel';
import { TeamDashboardPanel } from '../src/components/team/TeamDashboardPanel';
import { WorkspaceSettingsPanel } from '../src/components/team/WorkspaceSettingsPanel';
import { CrossWorkspaceSearchPanel } from '../src/components/team/CrossWorkspaceSearchPanel';
import { OrgAdminDashboardPanel } from '../src/components/enterprise/OrgAdminDashboardPanel';
import { BillingAdminPanel } from '../src/components/enterprise/BillingAdminPanel';
import { KeyVaultPanel } from '../src/components/enterprise/KeyVaultPanel';
import { OrgAnalyticsPanel } from '../src/components/enterprise/OrgAnalyticsPanel';
import { VoiceChatPanel } from '../src/components/voice/VoiceChatPanel';
import { AmbientPanel } from '../src/components/voice/AmbientPanel';
import { MemoryConsentPanel } from '../src/components/api/MemoryConsentPanel';
import { PlatformOpsPanel } from '../src/components/api/PlatformOpsPanel';
import { VerticalPickerPanel } from '../src/components/verticals/VerticalPickerPanel';
import { FounderDashboardPanel } from '../src/components/verticals/founder/FounderDashboardPanel';
import { ResearchDashboardPanel } from '../src/components/verticals/research/ResearchDashboardPanel';
import { CareerDashboardPanel } from '../src/components/verticals/career/CareerDashboardPanel';
import { HealthDashboardPanel } from '../src/components/verticals/health/HealthDashboardPanel';
import { LocalePickerPanel } from '../src/components/i18n/LocalePickerPanel';
import { OfflineQueuePanel } from '../src/components/offline/OfflineQueuePanel';
import { ProtocolCompilerPanel } from '../src/components/protocol/ProtocolCompilerPanel';
import { DecisionTelemetry, type DecisionMatrix } from '../src/decision';
import { messageRepository } from '../src/data/repositories';
import { emitActivityEvent } from '../src/activity';
import {
  captureCounterfactualDecisionRecord,
  listCounterfactualDecisionRecords,
  updateCounterfactualDecisionSelection,
} from '../src/counterfactual';
import type { Message } from '../types';
import type { MemoryHit } from '@ashim/engine';
import { verticalRuntime, type VerticalId } from '../src/verticals';

// Lazy load heavy components
const VoiceLab = lazy(() => import('./VoiceLab'));
const MemoryPalace = lazy(() => import('./MemoryPalace'));
const DreamGallery = lazy(() => import('./DreamGallery'));
const OracleDashboard = lazy(() => import('./OracleDashboard'));
const BranchNavigator = lazy(() => import('./BranchNavigator'));
const CognitiveDNAPanel = lazy(() => import('./CognitiveDNAPanel'));
const SystemVerification = lazy(() => import('./SystemVerification'));
const VideoContinuum = lazy(() => import('./VideoContinuum'));
const AdminDashboard = lazy(() => import('./admin/AdminDashboard')); // Added

interface ViewContainerProps {
  logic: any;
  onBack?: () => void;
  toggleChatList?: () => void;
  isChatListOpen?: boolean;
}

const LoadingFallback = () => (
  <div className="flex h-full items-center justify-center">
    <Loader2 className="animate-spin text-white/20" size={32} />
  </div>
);

const buildDecisionMatrix = (question: string, decisionId: string): DecisionMatrix => ({
  id: decisionId,
  question,
  criteria: [
    {
      id: 'impact',
      title: 'Impact',
      description: 'Expected leverage on outcomes',
      weight: 0.42,
    },
    {
      id: 'speed',
      title: 'Speed',
      description: 'Time to execute',
      weight: 0.28,
    },
    {
      id: 'risk',
      title: 'Risk',
      description: 'Downside risk',
      weight: 0.3,
    },
  ],
  options: [
    {
      id: 'opt-focus',
      title: 'Focus One Loop',
      description: 'Ship a single measurable weekly loop first',
      scores: { impact: 0.86, speed: 0.78, risk: 0.68 },
      assumption_ids: ['a1', 'a2'],
    },
    {
      id: 'opt-broad',
      title: 'Ship Broad Surface',
      description: 'Launch multiple features together',
      scores: { impact: 0.71, speed: 0.49, risk: 0.42 },
      assumption_ids: ['a1', 'a3'],
    },
    {
      id: 'opt-delay',
      title: 'Delay and Research',
      description: 'Run more interviews before shipping',
      scores: { impact: 0.58, speed: 0.28, risk: 0.82 },
      assumption_ids: ['a4'],
    },
  ],
  assumptions: [
    {
      id: 'a1',
      text: 'User demand exists for this workflow.',
      confidence: 0.76,
      impact: 'high',
    },
    {
      id: 'a2',
      text: 'A focused weekly loop improves retention faster.',
      confidence: 0.72,
      impact: 'medium',
    },
    {
      id: 'a3',
      text: 'Broad launch will not overload onboarding.',
      confidence: 0.41,
      impact: 'high',
    },
    {
      id: 'a4',
      text: 'Additional research materially improves choices.',
      confidence: 0.63,
      impact: 'medium',
    },
  ],
  branches: [
    {
      id: 'branch-downside',
      label: 'Downside Case',
      parent_id: null,
      option_score_overrides: {
        'opt-focus': { risk: 0.52 },
        'opt-broad': { risk: 0.31 },
      },
    },
    {
      id: 'branch-upside',
      label: 'Upside Case',
      parent_id: null,
      option_score_overrides: {
        'opt-focus': { impact: 0.9 },
        'opt-broad': { impact: 0.8 },
      },
    },
  ],
  created_at_iso: new Date().toISOString(),
});

const mapMessagesToEvidenceMemories = (messages: ReadonlyArray<any>): ReadonlyArray<MemoryHit> => {
  return messages
    .slice(-8)
    .map((message, index) => ({
      id: `history-memory-${message.id ?? index}`,
      content: message.text ?? '',
      type: message.role ?? 'history',
      score: 0.7,
      emotionalValence: message.role === 'user' ? 0.5 : 0.4,
      timestamp: message.timestamp ?? Date.now(),
      timestampIso: new Date(message.timestamp ?? Date.now()).toISOString(),
      provenanceMessageIds: message.id ? [message.id] : [],
    }))
    .filter((entry) => entry.content.trim().length > 0);
};

const ViewContainer: React.FC<ViewContainerProps> = ({ logic, onBack, toggleChatList, isChatListOpen }) => {
  const { state, refs, handlers } = logic;
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const trackedMessageIdsRef = useRef<Set<string>>(new Set());
  const decisionCreatedRef = useRef<Set<string>>(new Set());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [decisionTelemetry] = useState(() => new DecisionTelemetry());
  const [decisionEvents, setDecisionEvents] = useState(() => decisionTelemetry.listAll());
  const [counterfactualTick, setCounterfactualTick] = useState(0);
  const [counterfactualLaunch, setCounterfactualLaunch] = useState<{
    initialQuery: string;
    decisionIdHint: string;
  } | null>(null);
  const workspaceRuntimeId = `workspace-${state.session.user.id}`;
  const [activeVerticalId, setActiveVerticalId] = useState<VerticalId | null>(() => {
    return verticalRuntime.getActive(workspaceRuntimeId)?.verticalId ?? null;
  });

  const handleLiveTranscription = (text: string, role: 'user' | 'model') => {
    if (!text || text.trim().length < 1) return;

    const newMessage: Message = {
      id: uuidv4(),
      role: role,
      text: text,
      timestamp: Date.now()
    };

    handlers.setMessages((prev: Message[]) => [...prev, newMessage]);

    saveQueueRef.current = saveQueueRef.current.then(async () => {
      if (!state.currentSessionId) return;

      try {
        await messageRepository.upsertMessage(state.currentSessionId, newMessage);
      } catch (e) {
        console.error("Message persistence failed:", e);
      }
    });
  };

  // Find active conversation object to get immediate persona details
  const activeConversation = state.conversations.find(
    (c: any) => c.id === state.currentSessionId || c.session_id === state.currentSessionId
  );

  const decisionQuestion = useMemo(() => {
    const personaName = activeConversation?.persona?.name || 'this conversation';
    return `What is the highest-leverage next step with ${personaName}?`;
  }, [activeConversation?.persona?.name]);

  const decisionMatrixId = useMemo(
    () => `decision-${state.currentSessionId || 'default'}`,
    [state.currentSessionId]
  );
  const decisionMatrix = useMemo(
    () => buildDecisionMatrix(decisionQuestion, decisionMatrixId),
    [decisionMatrixId, decisionQuestion]
  );
  const pastCounterfactualDecisions = useMemo(() => {
    void counterfactualTick;
    return listCounterfactualDecisionRecords({
      userId: state.session.user.id,
      limit: 10,
    })
      .filter((record) => record.decisionId !== decisionMatrix.id)
      .map((record) => ({
        decisionId: record.decisionId,
        question: record.question,
        createdAtIso: record.createdAtIso,
        selectedOptionId: record.selectedOptionId,
      }));
  }, [counterfactualTick, decisionMatrix.id, state.session.user.id]);
  const decisionMemories = useMemo(
    () => mapMessagesToEvidenceMemories(state.messages),
    [state.messages]
  );

  const handlePersonaImported = async (persona: any) => {
    if (!state.session?.user?.id) return;
    try {
      const saved = await createPersona(
        state.session.user.id,
        persona.name,
        persona.system_instruction,
        persona.description || '',
        persona.avatar_url
      );

      if (!saved) {
        window.alert('Persona validated, but saving to database failed.');
        return;
      }

      await handlers.fetchSessions?.();
      window.alert(`Persona "${saved.name}" imported.`);
      handlers.setCurrentView('chat');
    } catch (error) {
      console.error('Persona import save failed:', error);
      window.alert('Persona validated, but saving failed.');
    }
  };

  const handleActivateVertical = (verticalId: VerticalId) => {
    verticalRuntime.activate({
      workspaceId: workspaceRuntimeId,
      userId: state.session.user.id,
      verticalId,
    });
    setActiveVerticalId(verticalId);

    if (verticalId === 'founder_os') {
      handlers.setCurrentView('founder_dashboard');
      return;
    }
    if (verticalId === 'research_writing_lab') {
      handlers.setCurrentView('research_dashboard');
      return;
    }
    if (verticalId === 'career_studio') {
      handlers.setCurrentView('career_dashboard');
      return;
    }
    if (verticalId === 'health_habit_planning') {
      handlers.setCurrentView('health_dashboard');
      return;
    }
    handlers.setCurrentView('chat');
  };

  const recordDecisionEvent = (event: 'completed' | 'follow_through', value: string) => {
    if (event === 'completed') {
      const selected = decisionMatrix.options.find((option) => option.id === value);
      const assumptionCount = selected?.assumption_ids?.length ?? 0;
      decisionTelemetry.recordDecisionCompleted(decisionMatrix.id, value, assumptionCount);
      emitActivityEvent({
        userId: state.session.user.id,
        category: 'decision',
        eventType: 'decision.completed',
        title: 'Decision completed',
        description: `Selected option ${value} in Decision Room.`,
        threadId: state.currentSessionId,
        metadata: {
          decision_id: decisionMatrix.id,
          selected_option_id: value,
          question: decisionMatrix.question,
        },
      });
      captureCounterfactualDecisionRecord({
        userId: state.session.user.id,
        matrix: decisionMatrix,
        history: state.messages,
        threadId: state.currentSessionId ?? undefined,
        selectedOptionId: value,
      });
      updateCounterfactualDecisionSelection({
        userId: state.session.user.id,
        decisionId: decisionMatrix.id,
        selectedOptionId: value,
      });
      setCounterfactualTick((tick) => tick + 1);
    } else {
      const score = value === 'success' ? 0.9 : value === 'partial' ? 0.55 : 0.2;
      decisionTelemetry.recordDecisionFollowThrough(
        decisionMatrix.id,
        value as 'success' | 'partial' | 'failed',
        score
      );
      emitActivityEvent({
        userId: state.session.user.id,
        category: 'decision',
        eventType: 'decision.follow_through',
        title: 'Decision follow-through logged',
        description: `Follow-through outcome recorded as ${value}.`,
        threadId: state.currentSessionId,
        metadata: {
          decision_id: decisionMatrix.id,
          outcome: value,
          question: decisionMatrix.question,
        },
      });
    }

    setDecisionEvents(decisionTelemetry.listByDecision(decisionMatrix.id));
  };

  useEffect(() => {
    if (state.currentView !== 'decision_room') return;
    if (decisionCreatedRef.current.has(decisionMatrix.id)) return;
    decisionCreatedRef.current.add(decisionMatrix.id);
    decisionTelemetry.recordDecisionCreated(
      decisionMatrix.id,
      decisionMatrix.options.length,
      decisionMatrix.criteria.length
    );
    emitActivityEvent({
      userId: state.session.user.id,
      category: 'decision',
      eventType: 'decision.created',
      title: 'Decision session created',
      description: `Decision Room opened for question: ${decisionMatrix.question}`,
      threadId: state.currentSessionId,
      metadata: {
        decision_id: decisionMatrix.id,
        question: decisionMatrix.question,
      },
    });
    captureCounterfactualDecisionRecord({
      userId: state.session.user.id,
      matrix: decisionMatrix,
      history: state.messages,
      threadId: state.currentSessionId ?? undefined,
    });
    setCounterfactualTick((tick) => tick + 1);
    setDecisionEvents(decisionTelemetry.listByDecision(decisionMatrix.id));
  }, [
    decisionMatrix.criteria.length,
    decisionMatrix.id,
    decisionMatrix.options.length,
    decisionTelemetry,
    decisionMatrix.question,
    state.currentSessionId,
    state.currentView,
    state.messages,
    state.session.user.id,
  ]);

  useEffect(() => {
    if (!state.currentSessionId) return;
    for (const message of state.messages) {
      if (trackedMessageIdsRef.current.has(message.id)) continue;
      trackedMessageIdsRef.current.add(message.id);

      emitActivityEvent({
        userId: state.session.user.id,
        category: 'chat',
        eventType: `chat.message_${message.role}`,
        title: message.role === 'user' ? 'User message sent' : 'Assistant message received',
        description: message.text.slice(0, 160) || '[empty message]',
        threadId: state.currentSessionId,
      });
    }
  }, [state.currentSessionId, state.messages, state.session.user.id]);

  switch (state.currentView) {
    case 'persona_import':
      return (
        <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#e9edef]">Persona Import (.persona)</h2>
                <p className="text-sm text-[#8696a0]">Validate YAML and import directly into your persona list.</p>
              </div>
              <button
                type="button"
                className="rounded border border-[#313d45] px-3 py-1.5 text-xs text-[#aebac1] hover:bg-[#202c33]"
                onClick={() => handlers.setCurrentView('chat')}
              >
                Back to Chat
              </button>
            </div>
            {state.session?.user?.id ? (
              <PersonaImportPanel userId={state.session.user.id} onImported={handlePersonaImported} />
            ) : (
              <div className="rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#aebac1]">
                You must be signed in to import personas.
              </div>
            )}
          </div>
        </div>
      );

    case 'decision_room':
      return (
        <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#e9edef]">Decision Room</h2>
                <p className="text-sm text-[#8696a0]">Compare options with assumptions, scenarios, and evidence.</p>
              </div>
              <button
                type="button"
                className="rounded border border-[#313d45] px-3 py-1.5 text-xs text-[#aebac1] hover:bg-[#202c33]"
                onClick={() => handlers.setCurrentView('chat')}
              >
                Back to Chat
              </button>
            </div>

            <DecisionRoomPanel
              userId={state.session.user.id}
              matrix={decisionMatrix}
              memories={decisionMemories}
              history={state.messages}
              telemetryEvents={decisionEvents}
              pastDecisions={pastCounterfactualDecisions}
              onComplete={(optionId) => recordDecisionEvent('completed', optionId)}
              onFollowThrough={(outcome) => recordDecisionEvent('follow_through', outcome)}
              onOpenCounterfactual={(payload) => {
                setCounterfactualLaunch({
                  initialQuery: payload.query,
                  decisionIdHint: payload.decisionId,
                });
                handlers.setCurrentView('counterfactual_panel');
              }}
            />

            {decisionEvents.length > 0 ? (
              <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-100">Lifecycle Events</h3>
                <ul className="space-y-1 text-xs text-zinc-300">
                  {decisionEvents.map((event) => (
                    <li key={event.id}>
                      {new Date(event.created_at_iso).toLocaleTimeString()} - {event.type}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      );

    case 'reflection_dashboard':
      return (
        <ReflectionDashboardPanel
          userId={state.session.user.id}
          threadId={state.currentSessionId || 'unknown-thread'}
          personaId={activeConversation?.persona_id || state.config?.livingPersona?.id || 'default'}
          messages={state.messages}
        />
      );

    case 'knowledge_workbench':
      return (
        <KnowledgeWorkbenchPanel userId={state.session.user.id} />
      );

    case 'council_room':
      return (
        <CouncilPanel userId={state.session.user.id} personas={state.personas} />
      );

    case 'boardroom':
      return (
        <BoardroomPanel
          userId={state.session.user.id}
          personas={state.personas}
          decisionMatrix={decisionMatrix}
          threadId={state.currentSessionId}
        />
      );

    case 'workflow_workbench':
      return (
        <WorkflowWorkbenchPanel userId={state.session.user.id} />
      );

    case 'agent_dashboard':
      return (
        <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
          <div className="mx-auto max-w-6xl">
            <AgentDashboardPanel userId={state.session.user.id} />
          </div>
        </div>
      );

    case 'activity_timeline':
      return <ActivityTimelinePanel userId={state.session.user.id} />;

    case 'autonomy_monitor':
      return (
        <AutonomyMonitorPanel
          userId={state.session.user.id}
          workspaceId={workspaceRuntimeId}
        />
      );

    case 'emotional_dashboard':
      return (
        <EmotionalContinuityPanel
          userId={state.session.user.id}
          personaId={activeConversation?.persona_id || state.config?.livingPersona?.id || 'default'}
          messages={state.messages}
        />
      );

    case 'plugin_studio':
      return <PluginStudioPanel userId={state.session.user.id} />;

    case 'template_gallery':
      return <TemplateGalleryPanel userId={state.session.user.id} />;

    case 'pack_gallery':
      return <PackGalleryPanel userId={state.session.user.id} />;

    case 'counterfactual_panel':
      return (
        <CounterfactualPanel
          userId={state.session.user.id}
          messages={state.messages}
          threadId={state.currentSessionId}
          initialQuery={counterfactualLaunch?.initialQuery}
          decisionIdHint={counterfactualLaunch?.decisionIdHint}
          onBack={() => handlers.setCurrentView('decision_room')}
        />
      );

    case 'shared_pack_preview':
      return <SharedPackPreviewPanel userId={state.session.user.id} />;

    case 'benchmark_dashboard':
      return <BenchmarkPublishingPanel userId={state.session.user.id} />;

    case 'creator_hub':
      return <CreatorHubPanel userId={state.session.user.id} />;

    case 'creator_analytics':
      return <CreatorAnalyticsPanel userId={state.session.user.id} />;

    case 'creator_earnings':
      return <CreatorEarningsPanel userId={state.session.user.id} />;

    case 'billing_dashboard':
      return <BillingDashboardPanel userId={state.session.user.id} />;

    case 'team_playbooks':
      return <PlaybookPanel userId={state.session.user.id} />;

    case 'team_dashboard':
      return <TeamDashboardPanel userId={state.session.user.id} />;

    case 'workspace_settings':
      return <WorkspaceSettingsPanel userId={state.session.user.id} />;

    case 'cross_workspace_search':
      return <CrossWorkspaceSearchPanel userId={state.session.user.id} />;

    case 'org_admin_dashboard':
      return <OrgAdminDashboardPanel userId={state.session.user.id} />;

    case 'billing_admin':
      return <BillingAdminPanel userId={state.session.user.id} />;

    case 'key_vault_panel':
      return <KeyVaultPanel userId={state.session.user.id} />;

    case 'org_analytics_panel':
      return <OrgAnalyticsPanel userId={state.session.user.id} />;

    case 'api_memory_consent':
      return (
        <MemoryConsentPanel
          userId={state.session.user.id}
          workspaceId={workspaceRuntimeId}
        />
      );

    case 'platform_ops':
      return <PlatformOpsPanel userId={state.session.user.id} />;

    case 'vertical_picker':
      return (
        <VerticalPickerPanel
          activeVerticalId={activeVerticalId}
          onActivate={handleActivateVertical}
        />
      );

    case 'founder_dashboard':
      return <FounderDashboardPanel userId={state.session.user.id} />;

    case 'research_dashboard':
      return <ResearchDashboardPanel userId={state.session.user.id} />;

    case 'career_dashboard':
      return <CareerDashboardPanel userId={state.session.user.id} />;

    case 'health_dashboard':
      return <HealthDashboardPanel userId={state.session.user.id} />;

    case 'locale_picker':
      return <LocalePickerPanel workspaceId={workspaceRuntimeId} />;

    case 'offline_queue':
      return (
        <OfflineQueuePanel
          userId={state.session.user.id}
          activeSessionId={state.currentSessionId}
        />
      );

    case 'protocol_compiler':
      return (
        <ProtocolCompilerPanel
          userId={state.session.user.id}
          workspaceId={workspaceRuntimeId}
        />
      );

    case 'voice_chat':
      return (
        <VoiceChatPanel
          userId={state.session.user.id}
          threadId={state.currentSessionId}
          messages={state.messages}
          onSendMessage={handlers.sendMessage}
          isStreaming={state.isStreaming}
          livingPersona={state.config.livingPersona}
          ttsVoice={state.config.ttsVoice}
        />
      );

    case 'ambient_mode':
      return <AmbientPanel userId={state.session.user.id} />;

    case 'admin':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <AdminDashboard userId={state.session.user.id} onClose={() => handlers.setCurrentView('chat')} />
        </Suspense>
      );

    case 'voice_lab':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <VoiceLab onBack={() => handlers.setCurrentView('chat')} isDarkMode={state.isDarkMode} />
        </Suspense>
      );

    case 'video_call':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <VideoContinuum
            onClose={() => handlers.setCurrentView('chat')}
            config={state.config}
            isDarkMode={state.isDarkMode}
            onTranscription={handleLiveTranscription}
            messages={state.messages}
            messagesEndRef={refs.messagesEndRef}
          />
        </Suspense>
      );

    case 'memory_palace':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <MemoryPalace userId={state.session.user.id} onClose={() => handlers.setCurrentView('chat')} isDarkMode={state.isDarkMode} />
        </Suspense>
      );

    case 'dreams':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <DreamGallery
            userId={state.session.user.id}
            onClose={() => handlers.setCurrentView('chat')}
            isDarkMode={state.isDarkMode}
            onDiscussDream={(d: any) => {
              handlers.setCurrentView('chat');
              handlers.sendMessage(`Let's explore your dream about ${d.themes.join(', ')}.`);
            }}
          />
        </Suspense>
      );

    case 'oracle':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <OracleDashboard
            userId={state.session.user.id}
            onClose={() => handlers.setCurrentView('chat')}
            isDarkMode={state.isDarkMode}
            onStartConversation={(s: string) => {
              handlers.setCurrentView('chat');
              handlers.sendMessage(s);
            }}
          />
        </Suspense>
      );

    case 'dna_vault':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <CognitiveDNAPanel userId={state.session.user.id} onClose={() => handlers.setCurrentView('chat')} isDarkMode={state.isDarkMode} />
        </Suspense>
      );

    case 'verification':
      return (
        <Suspense fallback={<LoadingFallback />}>
          <SystemVerification onClose={() => handlers.setCurrentView('chat')} isDarkMode={state.isDarkMode} />
        </Suspense>
      );

    case 'branching':
      return state.branchTree ? (
        <Suspense fallback={<LoadingFallback />}>
          <BranchNavigator
            tree={state.branchTree}
            activeBranchId={state.branchTree.activeBranchId}
            isDarkMode={state.isDarkMode}
            onSwitchBranch={() => { }}
            onCreateBranch={(fp: number, label?: string) =>
              branchingService.createBranch(state.currentSessionId, state.branchTree.activeBranchId, fp, label || "New Branch")
            }
            onDeleteBranch={(bid: string) => branchingService.deleteBranch(bid)}
            onMergeBranches={(a: string, b: string) => branchingService.mergeBranches(a, b)}
            onCompareBranches={(a: string, b: string) => branchingService.compareBranches(a, b)}
          />
        </Suspense>
      ) : null;

    case 'chat':
    default:
      return (
        <>
          <ChatInterface
            isSidebarOpen={state.isSidebarOpen}
            setIsSidebarOpen={handlers.setIsSidebarOpen}
            isFullscreen={state.isFullscreen}
            toggleFullscreen={handlers.toggleFullscreen}
            isDarkMode={state.isDarkMode}
            setIsDarkMode={handlers.setIsDarkMode}
            config={state.config}
            isProcessingPersona={state.isProcessingPersona}
            messages={state.messages}
            messagesEndRef={refs.messagesEndRef}
            attachments={state.attachments}
            setAttachments={handlers.setAttachments}
            fileInputRef={refs.fileInputRef}
            isUploading={state.isUploading}
            handleFileSelect={handlers.handleFileSelect}
            inputText={state.inputText}
            setInputText={handlers.setInputText}
            sendMessage={handlers.sendMessage}
            sendVoiceMessage={handlers.sendVoiceMessage}
            isStreaming={state.isStreaming}
            handleRegenerate={handlers.handleRegenerate}
            handleEdit={handlers.handleEdit}
            handlePaste={handlers.handlePaste}
            onOpenVideoCall={() => handlers.setCurrentView('video_call')}
            hasMoreMessages={state.hasMoreMessages}
            onLoadMore={handlers.loadMoreMessages}
            setMessages={handlers.setMessages}
            currentSessionId={state.currentSessionId}
            onBack={onBack}
            activePersona={activeConversation?.persona}
            toggleChatList={toggleChatList}
            isChatListOpen={isChatListOpen}
            onNewChatWithPersona={handlers.handleNewChatWithCurrentPersona}
            onBranch={handlers.handleBranching}
            onShowHistory={() => setIsHistoryOpen(true)}
          />

          <ChatHistoryModal
            isOpen={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            personaId={activeConversation?.persona?.id || ''}
            personaName={activeConversation?.persona?.name || 'Unknown'}
            currentSessionId={state.currentSessionId}
            onSelectSession={(sessionId) => {
              handlers.updateCurrentSession(sessionId);
            }}
          />
        </>
      );
  }
};

export default ViewContainer;
