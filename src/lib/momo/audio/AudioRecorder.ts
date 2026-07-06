import { arrayBufferToBase64 } from "./base64";

const AUDIO_WORKLET_CODE = `
  class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.bufferSize = 2048;
      this.buffer = new Int16Array(this.bufferSize);
      this.bufferIndex = 0;
    }

    process(inputs) {
      const input = inputs[0];
      if (input.length > 0) {
        const channelData = input[0];
        for (let i = 0; i < channelData.length; i++) {
          const sample = Math.max(-1, Math.min(1, channelData[i]));
          this.buffer[this.bufferIndex++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

          if (this.bufferIndex >= this.bufferSize) {
            const outputBuffer = new Int16Array(this.buffer);
            this.port.postMessage(outputBuffer.buffer);
            this.bufferIndex = 0;
          }
        }
      }

      return true;
    }
  }

  registerProcessor("momo-pcm-processor", PCMProcessor);
`;

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;

  async start(onChunk: (base64Audio: string) => void): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaStream = stream;

    const AudioContextConstructor =
      window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error("This browser does not support Web Audio.");
    }

    const audioContext = new AudioContextConstructor({ sampleRate: 16000 });
    this.audioContext = audioContext;

    const workletUrl = URL.createObjectURL(new Blob([AUDIO_WORKLET_CODE], { type: "application/javascript" }));
    await audioContext.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    const source = audioContext.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioContext, "momo-pcm-processor");
    this.workletNode = workletNode;

    source.connect(workletNode);
    workletNode.connect(audioContext.destination);
    workletNode.port.onmessage = (event) => {
      onChunk(arrayBufferToBase64(event.data as ArrayBuffer));
    };
  }

  close(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }
}
