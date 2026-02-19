export interface AshimWidgetConfig {
  target: string | HTMLElement;
  personaId: string;
  byokProvider: 'gemini';
  apiBaseUrl?: string;
  title?: string;
  placeholder?: string;
}

export const defaultWidgetConfig = (config: AshimWidgetConfig): Required<AshimWidgetConfig> => ({
  ...config,
  apiBaseUrl: config.apiBaseUrl ?? 'https://api.ashim.local',
  title: config.title ?? 'Ashim Assistant',
  placeholder: config.placeholder ?? 'Ask anything...',
});
