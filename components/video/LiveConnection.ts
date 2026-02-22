
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

export interface ConnectionCallbacks {
  onOpen: () => void;
  onMessage: (msg: LiveServerMessage) => void;
  onClose: (event: CloseEvent) => void;
  onError: (error: Event) => void;
}

export class GeminiLiveSession {
  private session: any = null;
  private reconnectAttempts = 0;
  private MAX_RECONNECTS = 5;
  private config: any;
  private callbacks: ConnectionCallbacks;

  constructor(config: any, callbacks: ConnectionCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  async connect() {
    const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : '';
    const ai = new GoogleGenAI({ apiKey: apiKey || '' });
    
    try {
      this.session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: this.config,
        callbacks: {
          onopen: () => {
            this.reconnectAttempts = 0;
            this.callbacks.onOpen();
          },
          onmessage: this.callbacks.onMessage,
          onclose: (e) => {
            this.callbacks.onClose(e);
            this.handleReconnect();
          },
          onerror: this.callbacks.onError
        }
      });
    } catch (e) {
      console.error("Connection failed:", e);
      this.handleReconnect();
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.MAX_RECONNECTS) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect(), delay);
    }
  }

  sendRealtimeInput(data: { mimeType: string; data: string }) {
    if (this.session) {
      this.session.sendRealtimeInput({ media: data });
    }
  }

  sendText(text: string) {
    if (this.session) {
      this.session.send({
        client_content: {
          turns: [{ role: 'user', parts: [{ text: text }] }],
          turn_complete: true
        }
      });
    }
  }

  disconnect() {
    if (this.session) {
      try { this.session.close(); } catch(e) {}
      this.session = null;
    }
  }
}
