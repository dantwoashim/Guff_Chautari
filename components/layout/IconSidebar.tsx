
import React from 'react';
import { 
  MessageSquare, 
  CircleDashed, 
  Users, 
  Search,
  Settings, 
  User, 
  Archive,
  Star,
  Shield,
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
  ShieldCheck,
  Lock,
} from '../Icons';

interface IconSidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onOpenSettings: () => void;
  onProfileClick: () => void;
  canAccessAdmin?: boolean;
  activeFeatureView?: string | null;
  onOpenFeatureView?: (
    view:
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

const IconSidebar: React.FC<IconSidebarProps> = ({ 
  currentView, 
  onViewChange, 
  onOpenSettings,
  onProfileClick,
  canAccessAdmin = true,
  activeFeatureView,
  onOpenFeatureView
}) => {
  const topNavItems = [
    { id: 'chat', icon: MessageSquare, label: 'Chats' },
    { id: 'status', icon: CircleDashed, label: 'Status' },
    { id: 'communities', icon: Users, label: 'Communities' },
  ];

  const featureNavItems: Array<{
    id:
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
      | 'protocol_compiler';
    icon: any;
    label: string;
  }> = [
    { id: 'persona_import', icon: Upload, label: 'Import Persona' },
    { id: 'decision_room', icon: Clipboard, label: 'Decision Room' },
    { id: 'counterfactual_panel', icon: GitBranch, label: 'What If Lab' },
    { id: 'reflection_dashboard', icon: Brain, label: 'Reflection Dashboard' },
    { id: 'knowledge_workbench', icon: Library, label: 'Knowledge Workbench' },
    { id: 'council_room', icon: GitMerge, label: 'Council Room' },
    { id: 'boardroom', icon: ArrowLeftRight, label: 'AI Boardroom' },
    { id: 'workflow_workbench', icon: Cpu, label: 'Workflow Workbench' },
    { id: 'agent_dashboard', icon: Target, label: 'Agent Dashboard' },
    { id: 'activity_timeline', icon: Activity, label: 'Activity Timeline' },
    { id: 'autonomy_monitor', icon: ShieldCheck, label: 'Autonomy Monitor' },
    { id: 'emotional_dashboard', icon: Heart, label: 'Emotional Continuity' },
    { id: 'plugin_studio', icon: Code, label: 'Plugin Studio' },
    { id: 'template_gallery', icon: LayoutGrid, label: 'Template Gallery' },
    { id: 'pack_gallery', icon: Layers, label: 'Pack Gallery' },
    { id: 'benchmark_dashboard', icon: TrendingUp, label: 'Benchmark Dashboard' },
    { id: 'creator_hub', icon: Users, label: 'Creator Hub' },
    { id: 'creator_analytics', icon: TrendingUp, label: 'Creator Analytics' },
    { id: 'creator_earnings', icon: TrendingUp, label: 'Creator Earnings' },
    { id: 'billing_dashboard', icon: Activity, label: 'Billing Dashboard' },
    { id: 'team_playbooks', icon: Clipboard, label: 'Team Playbooks' },
    { id: 'team_dashboard', icon: Network, label: 'Team Dashboard' },
    { id: 'workspace_settings', icon: Settings, label: 'Workspace Settings' },
    { id: 'cross_workspace_search', icon: Search, label: 'Workspace Search' },
    { id: 'org_admin_dashboard', icon: Shield, label: 'Org Admin' },
    { id: 'billing_admin', icon: ShieldCheck, label: 'Billing Admin' },
    { id: 'key_vault_panel', icon: Lock, label: 'Key Vault' },
    { id: 'org_analytics_panel', icon: TrendingUp, label: 'Org Analytics' },
    { id: 'voice_chat', icon: Headphones, label: 'Voice Chat' },
    { id: 'ambient_mode', icon: Clock, label: 'Ambient Mode' },
    { id: 'api_memory_consent', icon: Shield, label: 'Memory Consent' },
    { id: 'platform_ops', icon: ShieldCheck, label: 'Platform Ops' },
    { id: 'vertical_picker', icon: LayoutGrid, label: 'Vertical Picker' },
    { id: 'founder_dashboard', icon: Target, label: 'Founder Dashboard' },
    { id: 'research_dashboard', icon: Library, label: 'Research Dashboard' },
    { id: 'career_dashboard', icon: TrendingUp, label: 'Career Dashboard' },
    { id: 'health_dashboard', icon: Heart, label: 'Health Dashboard' },
    { id: 'locale_picker', icon: Settings, label: 'Language & Region' },
    { id: 'offline_queue', icon: Clock, label: 'Offline Queue' },
    { id: 'protocol_compiler', icon: Clipboard, label: 'Protocol Compiler' },
  ];

  const bottomNavItems = [
    { id: 'starred', icon: Star, label: 'Starred' },
    { id: 'archived', icon: Archive, label: 'Archived' },
    ...(canAccessAdmin ? [{ id: 'admin', icon: Shield, label: 'Admin Dashboard' }] : []),
    { id: 'settings', icon: Settings, label: 'Settings', action: onOpenSettings },
    { id: 'profile', icon: User, label: 'Profile', action: onProfileClick }, 
  ];

  return (
    <div className="w-[64px] h-full flex flex-col items-center py-4 bg-[#202c33] border-r border-[#313d45] select-none z-30">
      {/* Top Nav */}
      <div className="flex flex-col gap-2 w-full items-center">
        {topNavItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <div key={item.id} className="relative group w-full flex justify-center">
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] bg-[#00a884] rounded-r-md" />
              )}
              <button
                onClick={() => onViewChange(item.id)}
                className={`p-3 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? 'bg-[#2a3942] text-[#00a884]' 
                    : 'text-[#8696a0] hover:bg-[#2a3942]/50 hover:text-[#e9edef]'
                }`}
                title={item.label}
              >
                <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 mb-2 h-px w-8 bg-[#313d45]" />

      <div className="flex flex-col gap-2 w-full items-center">
        {featureNavItems.map((item) => {
          const isActive = activeFeatureView === item.id;
          return (
            <div key={item.id} className="relative group w-full flex justify-center">
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] bg-[#00a884] rounded-r-md" />
              )}
              <button
                onClick={() => onOpenFeatureView?.(item.id)}
                className={`p-2.5 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-[#2a3942] text-[#00a884]'
                    : 'text-[#8696a0] hover:bg-[#2a3942]/50 hover:text-[#e9edef]'
                }`}
                title={item.label}
              >
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Bottom Nav */}
      <div className="flex flex-col gap-3 w-full items-center mb-2">
        {bottomNavItems.map((item) => (
          <button
            key={item.id}
            onClick={item.action ? item.action : () => onViewChange(item.id)}
            className={`p-2.5 rounded-full transition-all duration-200 ${
                currentView === item.id 
                ? 'bg-[#2a3942] text-[#00a884]' 
                : 'text-[#8696a0] hover:bg-[#2a3942]/50 hover:text-[#e9edef]'
            }`}
            title={item.label}
          >
            <item.icon size={20} />
          </button>
        ))}
      </div>
    </div>
  );
};

export default IconSidebar;
