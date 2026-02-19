import { defaultWidgetConfig, type AshimWidgetConfig } from './config';

const resolveTarget = (target: string | HTMLElement): HTMLElement => {
  if (typeof target === 'string') {
    const element = document.querySelector<HTMLElement>(target);
    if (!element) {
      throw new Error(`Widget target "${target}" not found.`);
    }
    return element;
  }
  return target;
};

export const mountAshimWidget = (config: AshimWidgetConfig): HTMLIFrameElement => {
  const normalized = defaultWidgetConfig(config);
  const container = resolveTarget(normalized.target);

  const iframe = document.createElement('iframe');
  iframe.title = 'Ashim Widget';
  iframe.sandbox.add('allow-scripts');
  iframe.style.width = '100%';
  iframe.style.minHeight = '480px';
  iframe.style.border = '0';
  iframe.srcdoc = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system; background: #f8fafc; color: #0f172a; }
    .shell { border: 1px solid #d0d7de; border-radius: 12px; margin: 12px; background: #ffffff; padding: 12px; }
    .meta { font-size: 12px; color: #475467; margin-bottom: 8px; }
    input { width: 100%; padding: 8px 10px; border: 1px solid #d0d7de; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="shell">
    <div><strong>${normalized.title}</strong></div>
    <div class="meta">Persona: ${normalized.personaId} • Provider: ${normalized.byokProvider}</div>
    <input placeholder="${normalized.placeholder}" />
  </div>
</body>
</html>`;

  container.innerHTML = '';
  container.appendChild(iframe);
  return iframe;
};

declare global {
  interface Window {
    AshimWidget?: {
      mount: (config: AshimWidgetConfig) => HTMLIFrameElement;
    };
  }
}

if (typeof window !== 'undefined') {
  window.AshimWidget = {
    mount: mountAshimWidget,
  };
}
