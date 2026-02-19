import React from 'react';
import type { AshimWidgetConfig } from './config';

interface WidgetProps {
  config: AshimWidgetConfig;
}

export const Widget: React.FC<WidgetProps> = ({ config }) => {
  return (
    <div
      style={{
        border: '1px solid #d0d7de',
        borderRadius: 12,
        padding: 12,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system',
        background: '#ffffff',
        color: '#111827',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{config.title ?? 'Ashim Assistant'}</div>
      <div style={{ fontSize: 12, color: '#475467', marginBottom: 8 }}>
        Persona: {config.personaId} • Provider: {config.byokProvider}
      </div>
      <input
        type="text"
        placeholder={config.placeholder ?? 'Ask anything...'}
        style={{
          width: '100%',
          padding: '8px 10px',
          border: '1px solid #d0d7de',
          borderRadius: 8,
          fontSize: 14,
        }}
      />
    </div>
  );
};

export default Widget;
