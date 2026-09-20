import { base64ToArrayBuffer } from "./base64";

interface AudioStreamerOptions {
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
}

export class AudioStreamer {
  private audioContext: AudioContext;
  private nextPlayTime = 0;
  private onPlaybackStart?: () => void;
  private onPlaybackEnd?: () => void;
  private sources = new Set<AudioBufferSourceNode>();

  constructor(audioContext: AudioContext, options: AudioStreamerOptions = {}) {
    this.audioContext = audioContext;
    this.onPlaybackStart = options.onPlaybackStart;
    this.onPlaybackEnd = options.onPlaybackEnd;
  }

  playBase64Pcm16(base64Audio: string, sampleRate = 24000): void {
    const audioData = base64ToArrayBuffer(base64Audio);
    const pcm16 = new Int16Array(audioData);
    const float32 = new Float32Array(pcm16.length);

    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
    }

    const buffer = this.audioContext.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);

    const source = this.audioContext.createBufferSource();
    this.sources.add(source);
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    if (this.nextPlayTime < this.audioContext.currentTime) {
      this.nextPlayTime = this.audioContext.currentTime;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
    this.onPlaybackStart?.();

    source.onended = () => {
      this.sources.delete(source);
      if (this.audioContext.currentTime >= this.nextPlayTime) {
        this.onPlaybackEnd?.();
      }
    };
  }

  reset(): void {
    for (const source of this.sources) {
      try { source.stop(); } catch { /* Source may already have ended. */ }
    }
    this.sources.clear();
    this.nextPlayTime = 0;
    this.onPlaybackEnd?.();
  }
}
