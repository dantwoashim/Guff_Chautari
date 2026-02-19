export class PluginSandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginSandboxError';
  }
}

const timerHost = {
  setTimeout:
    typeof globalThis !== 'undefined' && typeof globalThis.setTimeout === 'function'
      ? globalThis.setTimeout.bind(globalThis)
      : setTimeout,
  clearTimeout:
    typeof globalThis !== 'undefined' && typeof globalThis.clearTimeout === 'function'
      ? globalThis.clearTimeout.bind(globalThis)
      : clearTimeout,
};

export const runInSandbox = async <T>(payload: {
  operation: () => Promise<T> | T;
  timeoutMs?: number;
}): Promise<T> => {
  const timeoutMs = payload.timeoutMs ?? 2_000;

  return await new Promise<T>((resolve, reject) => {
    const timer = timerHost.setTimeout(() => {
      reject(new PluginSandboxError(`Plugin operation timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    Promise.resolve()
      .then(payload.operation)
      .then((result) => {
        timerHost.clearTimeout(timer);
        resolve(result);
      })
      .catch((error: unknown) => {
        timerHost.clearTimeout(timer);
        reject(
          error instanceof Error
            ? new PluginSandboxError(error.message)
            : new PluginSandboxError('Unknown plugin sandbox error')
        );
      });
  });
};

export const createSandboxedIframe = (container: HTMLElement): HTMLIFrameElement => {
  const iframe = document.createElement('iframe');
  iframe.sandbox.add('allow-scripts');
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.minHeight = '240px';
  iframe.referrerPolicy = 'no-referrer';
  container.appendChild(iframe);
  return iframe;
};

export interface SandboxBridge {
  post: (type: string, payload: Record<string, unknown>) => void;
  dispose: () => void;
}

export const createSandboxBridge = (
  iframe: HTMLIFrameElement,
  onMessage: (type: string, payload: Record<string, unknown>) => void
): SandboxBridge => {
  const listener = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data as { type?: unknown; payload?: unknown };
    if (typeof data?.type !== 'string') return;
    onMessage(
      data.type,
      typeof data.payload === 'object' && data.payload !== null
        ? (data.payload as Record<string, unknown>)
        : {}
    );
  };

  window.addEventListener('message', listener);

  return {
    post(type, payload) {
      iframe.contentWindow?.postMessage({ type, payload }, '*');
    },
    dispose() {
      window.removeEventListener('message', listener);
    },
  };
};
