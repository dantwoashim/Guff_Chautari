
// Re-export all necessary icons including new ones for the context menu
export {
  Send,
  X,
  Square,
  Sun,
  Moon,
  PanelLeft,
  Plus,
  Sparkles,
  Compass,
  Loader2,
  GitBranch,
  Paperclip,
  Maximize,
  Minimize,
  Search,
  LayoutGrid,
  MoreHorizontal,
  Archive,
  Trash2,
  Settings,
  PanelLeftClose,
  Mic,
  MicOff,
  Layers,
  Eye,
  Brain,
  Dna,
  FlaskConical,
  Volume2,
  VolumeX, // Added
  Image,
  Upload,
  Library,
  Cloud,
  Laptop,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Video,
  Save,
  Globe,
  FileText,
  Download,
  Zap,
  Clock,
  Activity,
  Briefcase,
  Target,
  ShieldAlert,
  History,
  Sliders,
  AlertTriangle,
  Film,
  Play,
  FileAudio,
  Heart,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  User,
  Users,
  Split,
  Copy,
  RotateCcw,
  Edit3,
  Lock,
  Info,
  Lightbulb,
  Smile,
  ZoomIn,
  ZoomOut,
  Filter,
  Trash,
  Calendar,
  Network,
  Link,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Reply,
  Forward,
  Pin,
  PinOff, // Added
  Star,
  CornerUpLeft,
  Flag,
  XCircle,
  Hash,
  Tag,
  Bookmark,
  Share2,
  Phone,
  PhoneOff,
  Camera,
  CameraOff,
  // New additions
  GitMerge,
  ArrowLeftRight,
  Code,
  Headphones,
  Shield,
  CheckCircle2,
  Circle,
  CircleDashed,
  ShieldCheck,
  Palette,
  WifiOff,
  Wand2,
  Cpu,
  Thermometer,
  LogOut,
  VideoOff,
  Mail,
  MailOpen,
  Database,
  ToggleLeft,
  ToggleRight,
  Edit,
  CheckCircle,
  Clipboard,
  Command
} from 'lucide-react';

import React from 'react';
import { Sparkles as SparklesIcon, Loader2 as Loader2Icon } from 'lucide-react';

export const SparklesAnimated: React.FC<{
  size?: number;
  className?: string;
  animate?: boolean;
}> = ({ size = 24, className = '', animate = true }) => (
  <div className={`relative ${animate ? 'animate-pulse' : ''}`}>
    <SparklesIcon size={size} className={className} />
    {animate && (
      <div className="absolute inset-0 animate-ping opacity-30">
        <SparklesIcon size={size} className={className} />
      </div>
    )}
  </div>
);

export const LoaderGlow: React.FC<{
  size?: number;
  className?: string;
  glowColor?: string;
}> = ({ size = 24, className = '', glowColor = 'violet' }) => (
  <div className="relative">
    <Loader2Icon
      size={size}
      className={`animate-spin ${className}`}
    />
    <div
      className={`absolute inset-0 blur-md opacity-50 animate-spin`}
      style={{
        filter: `drop-shadow(0 0 8px var(--liquid-${glowColor}, #8B5CF6))`
      }}
    >
      <Loader2Icon size={size} className={className} />
    </div>
  </div>
);

export const PulsingDot: React.FC<{
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ color = 'emerald', size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3'
  };

  return (
    <span className="relative flex">
      <span className={`
        animate-ping absolute inline-flex h-full w-full rounded-full opacity-75
        bg-${color}-400
      `} />
      <span className={`
        relative inline-flex rounded-full
        ${sizeClasses[size]}
        bg-${color}-500
      `} />
    </span>
  );
};
