
import React from 'react';
import { Cpu, Zap, Activity, Thermometer, Brain, Image } from '../Icons';
import { ChatConfig } from '../../types';

interface AdvancedSettingsProps {
  config: ChatConfig;
  setConfig: (config: ChatConfig) => void;
}

const MODELS = [
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', desc: 'High reasoning, complex tasks' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', desc: 'Fast, efficient, low latency' },
];

const IMAGE_MODELS = [
  { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', desc: 'Standard generation (Fast)' },
  { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image', desc: 'High Quality (Slower)' },
  { id: 'imagen-4.0-generate-001', name: 'Imagen 4', desc: 'Photorealistic (Highest Quality)' }
];

const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({ config, setConfig }) => {
  
  // Helper to determine text description for Temperature
  const getTempLabel = (val: number) => {
    if (val <= 0.3) return 'Precise & Analytical';
    if (val <= 0.7) return 'Balanced';
    if (val <= 1.2) return 'Creative & Expressive';
    return 'Chaotic & Random';
  };

  // Helper for Thinking Budget
  const getThinkingLabel = (val: number) => {
    if (val < 10) return 'Disabled/Minimal';
    if (val < 100) return 'Minimal Reasoning';
    if (val <= 1000) return 'Light Reasoning';
    if (val <= 4000) return 'Deep Thought';
    return 'Maximum Contemplation';
  };

  const handleBudgetChange = (value: string) => {
      const num = parseInt(value);
      if (!isNaN(num) && num >= 0) {
          setConfig({ ...config, thinkingBudget: num });
      }
  };

  return (
    <div className="space-y-8 animate-slide-up pb-10">
      
      {/* 1. Model Selection */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Cpu size={16} className="text-accent" />
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">
            Neural Core
          </h3>
        </div>

        <div className="grid gap-2">
          {MODELS.map((model) => {
            const selected = config.model === model.id;
            return (
              <button
                key={model.id}
                onClick={() => setConfig({ ...config, model: model.id })}
                className={`
                  px-5 py-3 rounded-2xl text-left border transition-all duration-300
                  ${selected 
                    ? 'bg-surface/75 border-accent/35 shadow-lg shadow-accent/5' 
                    : 'bg-surface/40 border-stroke/60 hover:bg-surface/60'}
                `}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-[13px] font-semibold ${selected ? 'text-ink' : 'text-ink/80'}`}>
                    {model.name}
                  </span>
                  {selected && <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_currentColor]" />}
                </div>
                <p className="text-[11px] text-muted mt-0.5">{model.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Image Generation Model Selection */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2 mb-2">
          <Image size={16} className="text-purple-400" />
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">
            Visual Cortex (Image Gen)
          </h3>
        </div>

        <div className="grid gap-2">
          {IMAGE_MODELS.map((model) => {
            const selected = (config.imageModel || 'gemini-2.5-flash-image') === model.id;
            return (
              <button
                key={model.id}
                onClick={() => setConfig({ ...config, imageModel: model.id })}
                className={`
                  px-5 py-3 rounded-2xl text-left border transition-all duration-300
                  ${selected 
                    ? 'bg-surface/75 border-purple-400/35 shadow-lg shadow-purple-500/5' 
                    : 'bg-surface/40 border-stroke/60 hover:bg-surface/60'}
                `}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-[13px] font-semibold ${selected ? 'text-ink' : 'text-ink/80'}`}>
                    {model.name}
                  </span>
                  {selected && <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_currentColor]" />}
                </div>
                <p className="text-[11px] text-muted mt-0.5">{model.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Cognitive Parameters Section */}
      <div className="space-y-6 pt-2">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={16} className="text-accent2" />
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">
            Cognitive Parameters
          </h3>
        </div>

        {/* Thinking Budget Control */}
        <div className="bg-surface/40 rounded-3xl p-5 border border-stroke/60">
          <div className="flex items-start justify-between mb-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Zap size={14} className={config.thinkingBudget && config.thinkingBudget >= 10 ? "text-amber-400" : "text-muted"} />
                <span className="text-[13px] font-semibold text-ink">Thinking Budget</span>
              </div>
              <span className="text-[11px] text-muted">{getThinkingLabel(config.thinkingBudget || 0)}</span>
            </div>
            {/* Direct Input for Tokens */}
            <div className="flex items-center gap-1 bg-surface/60 border border-stroke/50 rounded-lg px-2 shadow-inner">
              <input 
                type="number"
                min="10"
                max="32768"
                step="1"
                value={config.thinkingBudget !== undefined ? config.thinkingBudget : 10}
                onChange={(e) => handleBudgetChange(e.target.value)}
                className="w-20 py-1 bg-transparent text-[13px] font-mono font-bold text-ink text-right focus:outline-none"
              />
              <span className="text-[10px] text-muted font-mono pr-1 select-none">tks</span>
            </div>
          </div>
          
          <input 
            type="range" 
            min="10" 
            max="16000" 
            step="10"
            value={config.thinkingBudget !== undefined ? config.thinkingBudget : 10}
            onChange={(e) => setConfig({ ...config, thinkingBudget: parseInt(e.target.value) })}
            className="w-full accent-accent h-1.5 bg-stroke/50 rounded-lg appearance-none cursor-pointer"
          />
          
          <div className="flex justify-between mt-3 text-[10px] text-muted font-medium uppercase tracking-wider">
            <span>Low (10)</span>
            <span>Deep (16k)</span>
          </div>
        </div>

        {/* Temperature Slider */}
        <div className="bg-surface/40 rounded-3xl p-5 border border-stroke/60">
          <div className="flex items-start justify-between mb-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Thermometer size={14} className={config.temperature && config.temperature > 1 ? "text-red-400" : "text-blue-400"} />
                <span className="text-[13px] font-semibold text-ink">Creativity (Temp)</span>
              </div>
              <span className="text-[11px] text-muted">{getTempLabel(config.temperature || 0.7)}</span>
            </div>
            <div className="px-3 py-1 rounded-lg bg-surface/60 border border-stroke/50 text-[12px] font-mono font-bold text-ink">
              {config.temperature?.toFixed(1) || 0.7}
            </div>
          </div>
          
          <input 
            type="range" 
            min="0" 
            max="2" 
            step="0.1"
            value={config.temperature !== undefined ? config.temperature : 0.7}
            onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
            className="w-full accent-accent2 h-1.5 bg-stroke/50 rounded-lg appearance-none cursor-pointer"
          />
          
          <div className="flex justify-between mt-3 text-[10px] text-muted font-medium uppercase tracking-wider">
            <span>Precise</span>
            <span>Balanced</span>
            <span>Random</span>
          </div>
        </div>
      </div>

      {/* Debug Info */}
      <div className="pt-6 border-t border-stroke/70 opacity-60">
        <div className="flex items-center gap-2 mb-2">
          <Activity size={16} className="text-muted" />
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted">
            System State
          </h3>
        </div>
        <div className="text-[11px] font-mono text-muted space-y-1 bg-surface/30 p-3 rounded-xl border border-stroke/50">
          <p>Active Model: {config.model}</p>
          <p>Image Model: {config.imageModel || 'Default'}</p>
          <p>Persona ID: {config.livingPersona ? config.livingPersona.id.slice(0,8) : 'N/A'}</p>
          <p>Budget: {config.thinkingBudget} | Temp: {config.temperature}</p>
        </div>
      </div>
    </div>
  );
};

export default AdvancedSettings;
