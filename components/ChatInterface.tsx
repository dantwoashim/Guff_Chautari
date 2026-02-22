import React from 'react';
import ChatArea from './chat/ChatArea';
import { Message, Attachment, LivingPersona, Persona } from '../types';

interface ChatInterfaceProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  config: { livingPersona?: LivingPersona };
  isProcessingPersona: boolean;
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isUploading: boolean;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputText: string;
  setInputText: (v: string) => void;
  sendMessage: (text: string, replyToId?: string) => void;
  sendVoiceMessage?: (blob: Blob, duration: number) => void;
  isStreaming: boolean;
  handleRegenerate: (id: string) => void;
  handleEdit: (id: string, text: string) => void;
  handlePaste?: (e: React.ClipboardEvent) => void;
  onOpenVideoCall: () => void;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
  setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
  currentSessionId?: string;
  onBack?: () => void;
  activePersona?: Persona;
  toggleChatList?: () => void;
  isChatListOpen?: boolean;
  onNewChatWithPersona?: () => void;
  onBranch?: (msgId: string) => void;
  onShowHistory?: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = (props) => {
  const displayPersona = props.activePersona || props.config.livingPersona;

  return (
    <ChatArea
      messages={props.messages}
      currentPersona={displayPersona}
      inputText={props.inputText}
      setInputText={props.setInputText}
      onSendMessage={props.sendMessage}
      onFileSelect={props.handleFileSelect}
      messagesEndRef={props.messagesEndRef}
      isStreaming={props.isStreaming}
      onOpenVideoCall={props.onOpenVideoCall}
      fileInputRef={props.fileInputRef}
      attachments={props.attachments}
      setAttachments={props.setAttachments}
      onBack={props.onBack}
      setMessages={props.setMessages}
      currentSessionId={props.currentSessionId}
      isDarkMode={props.isDarkMode}
      sendVoiceMessage={props.sendVoiceMessage}
      onRegenerate={props.handleRegenerate}
      onEdit={props.handleEdit}
      toggleChatList={props.toggleChatList}
      isChatListOpen={props.isChatListOpen}
      toggleFullscreen={props.toggleFullscreen}
      isFullscreen={props.isFullscreen}
      onNewChatWithPersona={props.onNewChatWithPersona}
      onBranch={props.onBranch}
      onShowHistory={props.onShowHistory}
    />
  );
};

export default ChatInterface;
