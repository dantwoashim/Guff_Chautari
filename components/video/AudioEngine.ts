
export const downsampleTo16k = (buffer: Float32Array, sampleRate: number): Int16Array => {
  if (sampleRate === 16000) {
      const output = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
          const s = Math.max(-1, Math.min(1, buffer[i]));
          output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return output;
  }
  
  const ratio = sampleRate / 16000;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Int16Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
      const index = i * ratio;
      const indexFloor = Math.floor(index);
      const indexCeil = Math.min(buffer.length - 1, Math.ceil(index));
      const interpolation = index - indexFloor;
      
      const valFloor = buffer[indexFloor];
      const valCeil = buffer[indexCeil];
      const val = valFloor + (valCeil - valFloor) * interpolation;
      
      const s = Math.max(-1, Math.min(1, val));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return result;
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export class AudioEngine {
  inputCtx: AudioContext | null = null;
  outputCtx: AudioContext | null = null;
  processor: ScriptProcessorNode | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  gainNode: GainNode | null = null;
  pcmAccumulator: Int16Array[] = [];
  accumulatorLength = 0;
  nextStartTime = 0;
  scheduledSources: AudioBufferSourceNode[] = [];

  initInput(stream: MediaStream, onAudioData: (base64: string) => void) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.inputCtx = new AudioContextClass();
    
    this.source = this.inputCtx.createMediaStreamSource(stream);
    this.gainNode = this.inputCtx.createGain();
    this.gainNode.gain.value = 3.0; // Boost volume
    
    // 4096 buffer size provides good balance between latency and processing overhead
    this.processor = this.inputCtx.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Simple VAD
      let rms = 0;
      for (let i = 0; i < inputData.length; i++) rms += inputData[i] * inputData[i];
      rms = Math.sqrt(rms / inputData.length);
      
      if (rms > 0.001) {
        const resampled = downsampleTo16k(inputData, this.inputCtx!.sampleRate);
        this.pcmAccumulator.push(resampled);
        this.accumulatorLength += resampled.length;

        // Buffer ~100ms of audio (1600 samples at 16kHz) before sending
        if (this.accumulatorLength >= 1600) {
          const merged = new Int16Array(this.accumulatorLength);
          let offset = 0;
          for (const chunk of this.pcmAccumulator) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          const base64 = arrayBufferToBase64(merged.buffer);
          onAudioData(base64);
          
          this.pcmAccumulator = [];
          this.accumulatorLength = 0;
        }
      }
    };

    this.source.connect(this.gainNode);
    this.gainNode.connect(this.processor);
    this.processor.connect(this.inputCtx.destination);
  }

  initOutput() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.outputCtx = new AudioContextClass({ sampleRate: 24000 });
  }

  async playAudio(base64Data: string, onStart?: () => void, onEnd?: () => void) {
    if (!this.outputCtx) return;
    if (this.outputCtx.state === 'suspended') await this.outputCtx.resume();

    try {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for(let i=0; i<int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const buffer = this.outputCtx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      const source = this.outputCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.outputCtx.destination);
      
      const now = this.outputCtx.currentTime;
      // Schedule slightly in future to prevent gaps, handling jitter
      const startTime = Math.max(this.nextStartTime, now + 0.05);
      
      source.start(startTime);
      this.nextStartTime = startTime + buffer.duration;
      
      this.scheduledSources.push(source);
      
      if (onStart) onStart(); // Actually this fires immediately, strict scheduling callbacks are harder with Web Audio
      
      source.onended = () => {
        this.scheduledSources = this.scheduledSources.filter(s => s !== source);
        if (onEnd) onEnd();
      };
    } catch (e) {
      console.error("Audio playback error:", e);
    }
  }

  stopAll() {
    this.scheduledSources.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    this.scheduledSources = [];
    this.nextStartTime = 0;
  }

  cleanup() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
    }
    if (this.gainNode) this.gainNode.disconnect();
    if (this.source) this.source.disconnect();
    
    if (this.inputCtx && this.inputCtx.state !== 'closed') this.inputCtx.close();
    if (this.outputCtx && this.outputCtx.state !== 'closed') this.outputCtx.close();
    
    this.pcmAccumulator = [];
    this.accumulatorLength = 0;
    this.stopAll();
  }
}
