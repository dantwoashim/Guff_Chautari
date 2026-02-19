
import React from 'react';
import ChatInterface from './ChatInterface';
import VoiceLab from './VoiceLab';
import MemoryPalace from './MemoryPalace';
import DreamGallery from './DreamGallery';
import OracleDashboard from './OracleDashboard';
import BranchNavigator from './BranchNavigator';
import CognitiveDNAPanel from './CognitiveDNAPanel';
import SystemVerification from './SystemVerification';
import { branchingService } from '../services/branchingService';

// We pass the entire return value of useChatLogic as props here
// for easier prop drilling without defining a massive interface manually
interface ViewContainerProps {
  logic: any;
}

const ViewContainer: React.FC<ViewContainerProps> = ({ logic }) => {
  const { state, refs, handlers } = logic;

  switch (state.currentView) {
    case 'voice_lab':
      return <VoiceLab onBack={() => handlers.setCurrentView('chat')} isDarkMode={state.isDarkMode} />;

    case 'memory_palace':
      return <MemoryPalace userId={state.session.user.id} onClose={() => handlers.setCurrentView('chat')} isDarkMode={state.isDarkMode} />;

    case 'dreams':
      return (
        <DreamGallery
          userId={state.session.user.id}
          onClose={() => handlers.setCurrentView('chat')}
          isDarkMode={state.isDarkMode}
          onDiscussDream={(d: any) => {
            handlers.setCurrentView('chat');
            handlers.sendMessage(`Let's explore your dream about ${d.themes.join(', ')}.`);
          }}
        />
      );

    case 'oracle':
      return (
        <OracleDashboard
          userId={state.session.user.id}
          onClose={() => handlers.setCurrentView('chat')}
          isDarkMode={state.isDarkMode}
          onStartConversation={(s: string) => {
            handlers.setCurrentView('chat');
            handlers.sendMessage(s);
          }}
        />
      );

    case 'dna_vault':
      return <CognitiveDNAPanel userId={state.session.user.id} onClose={() => handlers.setCurrentView('chat')} isDarkMode={state.isDarkMode} />;

    case 'verification':
      return <SystemVerification onClose={() => handlers.setCurrentView('chat')} isDarkMode={state.isDarkMode} />;

    case 'branching':
      return state.branchTree ? (
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
      ) : null;

    case 'chat':
    default:
      return (
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
          isStreaming={state.isStreaming}
          handleRegenerate={handlers.handleRegenerate}
          handleEdit={handlers.handleEdit}
          handlePaste={handlers.handlePaste}
          onBranch={handlers.handleBranching}
        />
      );
  }
};

export default ViewContainer;
