import React, { useRef, lazy, Suspense, useState } from 'react';
import ChatInterface from './ChatInterface';
import ChatHistoryModal from './modals/ChatHistoryModal';
import { branchingService } from '../services/branchingService';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { Loader2 } from './Icons';

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

const ViewContainer: React.FC<ViewContainerProps> = ({ logic, onBack, toggleChatList, isChatListOpen }) => {
  const { state, refs, handlers } = logic;
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const handleLiveTranscription = (text: string, role: 'user' | 'model') => {
    if (!text || text.trim().length < 1) return;

    const newMessage = {
      id: uuidv4(),
      role: role,
      text: text,
      timestamp: Date.now()
    };

    handlers.setSessions((prev: any[]) => prev.map((s: any) => {
      if (s.id === state.currentSessionId) {
        return { ...s, messages: [...s.messages, newMessage] };
      }
      return s;
    }));

    saveQueueRef.current = saveQueueRef.current.then(async () => {
      if (!state.currentSessionId) return;

      try {
        const { data: chatData, error } = await supabase
          .from('chats')
          .select('messages')
          .eq('id', state.currentSessionId)
          .single();

        if (error || !chatData) {
          return;
        }

        const currentMessages = chatData.messages || [];
        const updatedMessages = [...currentMessages, newMessage];

        await supabase
          .from('chats')
          .update({ messages: updatedMessages })
          .eq('id', state.currentSessionId);

      } catch (e) {
        console.error("Message persistence failed:", e);
      }
    });
  };

  // Find active conversation object to get immediate persona details
  const activeConversation = state.conversations.find(
    (c: any) => c.id === state.currentSessionId || c.session_id === state.currentSessionId
  );

  switch (state.currentView) {
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