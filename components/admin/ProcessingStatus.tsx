/**
 * @file components/admin/ProcessingStatus.tsx
 * @description Shows real-time progress of persona AI analysis with detailed indicators
 */
import React from 'react';
import { ProcessingProgress } from '../../services/personaPreprocessor';
import { CheckCircle, XCircle, Loader2, Zap, Brain, Cpu, Activity, Clock, Users, MessageSquare, Volume2, Database } from '../Icons';

interface ProcessingStatusProps {
    isOpen: boolean;
    onClose: () => void;
    personaName: string;
    personaId?: string;
    progress: ProcessingProgress | null;
    isComplete: boolean;
    error: string | null;
}

const STEPS = [
    { name: 'Living Persona Analysis', icon: Brain, description: 'Extracting personality traits, emotions, and behavior patterns' },
    { name: 'AGI Consciousness', icon: Cpu, description: 'Initializing consciousness state and awareness levels' },
    { name: 'Quantum Emotions', icon: Activity, description: 'Creating emotional superposition and fragments' },
    { name: 'Meta-Sentience', icon: Brain, description: 'Building self-awareness and reflection capabilities' },
    { name: 'Temporal Existence', icon: Clock, description: 'Processing past selves, wounds, and future memories' },
    { name: 'Life Engine', icon: Activity, description: 'Generating daily life events and activities' },
    { name: 'Social Circle', icon: Users, description: 'Creating friends, family, and relationship dynamics' },
    { name: 'Gossip Seeds', icon: MessageSquare, description: 'Preparing shareable stories and drama content' },
    { name: 'Voice DNA', icon: Volume2, description: 'Analyzing speech patterns and voice characteristics' },
    { name: 'Saving to Database', icon: Database, description: 'Persisting all computed states to Supabase' }
];

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
    isOpen,
    onClose,
    personaName,
    personaId,
    progress,
    isComplete,
    error
}) => {
    if (!isOpen) return null;

    const currentStep = progress?.current || 0;
    const currentStepInfo: (typeof STEPS)[0] | null = currentStep > 0 && currentStep <= STEPS.length ? STEPS[currentStep - 1] : null;

    return (
        <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-[#111b21] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-[#2a3942]">
                {/* Header */}
                <div className="p-6 border-b border-[#2a3942]">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-[#f59e0b]/20 flex items-center justify-center">
                            {isComplete ? (
                                error ? (
                                    <XCircle size={28} className="text-red-400" />
                                ) : (
                                    <CheckCircle size={28} className="text-[#00a884]" />
                                )
                            ) : (
                                <Zap size={28} className="text-[#f59e0b] animate-pulse" />
                            )}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-lg font-bold text-[#e9edef]">
                                {isComplete
                                    ? (error ? 'Processing Failed' : 'Processing Complete!')
                                    : `Processing: ${personaName}`}
                            </h2>
                            {personaId && (
                                <p className="text-xs text-[#8696a0] font-mono mt-1">
                                    ID: {personaId}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Current Step Banner */}
                    {!isComplete && currentStepInfo && (
                        <div className="mt-4 p-3 bg-[#f59e0b]/10 rounded-lg border border-[#f59e0b]/30">
                            <div className="flex items-center gap-2 text-[#f59e0b]">
                                <Loader2 size={16} className="animate-spin" />
                                <span className="text-sm font-medium">{currentStepInfo.name}</span>
                            </div>
                            <p className="text-xs text-[#8696a0] mt-1">{currentStepInfo.description}</p>
                        </div>
                    )}

                    {isComplete && !error && (
                        <div className="mt-4 p-3 bg-[#00a884]/10 rounded-lg border border-[#00a884]/30">
                            <p className="text-sm text-[#00a884]">
                                ✓ All AI features have been analyzed and saved successfully.
                            </p>
                        </div>
                    )}

                    {isComplete && error && (
                        <div className="mt-4 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}
                </div>

                {/* Progress Steps */}
                <div className="p-4 max-h-[350px] overflow-y-auto">
                    <div className="space-y-1">
                        {STEPS.map((step, index) => {
                            const stepNum = index + 1;
                            const StepIcon = step.icon;
                            let status: 'pending' | 'processing' | 'complete' | 'error' = 'pending';

                            if (stepNum < currentStep) status = 'complete';
                            else if (stepNum === currentStep) status = progress?.status || 'processing';

                            return (
                                <div
                                    key={step.name}
                                    className={`flex items-center gap-3 p-2.5 rounded-lg transition-all ${status === 'processing'
                                            ? 'bg-[#f59e0b]/10 border border-[#f59e0b]/30'
                                            : status === 'complete'
                                                ? 'opacity-60'
                                                : ''
                                        }`}
                                >
                                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2a3942]/50">
                                        {status === 'complete' && (
                                            <CheckCircle size={16} className="text-[#00a884]" />
                                        )}
                                        {status === 'processing' && (
                                            <Loader2 size={16} className="text-[#f59e0b] animate-spin" />
                                        )}
                                        {status === 'pending' && (
                                            <StepIcon size={14} className="text-[#8696a0]" />
                                        )}
                                        {status === 'error' && (
                                            <XCircle size={16} className="text-red-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className={`text-sm block ${status === 'complete' ? 'text-[#00a884]' :
                                                status === 'processing' ? 'text-[#f59e0b] font-medium' :
                                                    status === 'error' ? 'text-red-400' :
                                                        'text-[#8696a0]'
                                            }`}>
                                            {step.name}
                                        </span>
                                        {status === 'complete' && (
                                            <span className="text-[10px] text-[#8696a0]">✓ Saved</span>
                                        )}
                                    </div>
                                    <span className={`text-xs ${status === 'complete' ? 'text-[#00a884]' :
                                            status === 'processing' ? 'text-[#f59e0b]' :
                                                'text-[#8696a0]'
                                        }`}>
                                        {status === 'complete' ? '✓' : status === 'processing' ? '...' : stepNum}/{STEPS.length}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[#2a3942] bg-[#0b141a]">
                    {isComplete ? (
                        <button
                            onClick={onClose}
                            className="w-full py-2.5 bg-[#00a884] text-[#111b21] rounded-lg font-medium 
                                     hover:bg-[#00a884]/80 transition-colors"
                        >
                            Done
                        </button>
                    ) : (
                        <div className="flex items-center justify-between text-xs text-[#8696a0]">
                            <span>Step {currentStep} of {STEPS.length}</span>
                            <span className="flex items-center gap-1">
                                <Loader2 size={12} className="animate-spin" />
                                Processing...
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProcessingStatus;
