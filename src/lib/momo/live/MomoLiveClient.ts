import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
  type Session,
} from "@google/genai";

interface MomoLiveClientOptions {
  token: string;
  model: string;
  onReady: () => void;
  onAudio: (base64Audio: string) => void;
  onTurnComplete: () => void;
  onError: (error: unknown) => void;
  onClose: (event: CloseEvent) => void;
}

export class MomoLiveClient {
  private options: MomoLiveClientOptions;
  private session: Session | null = null;

  constructor(options: MomoLiveClientOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    const ai = new GoogleGenAI({
      apiKey: this.options.token,
      httpOptions: { apiVersion: "v1alpha" },
    });

    this.session = await ai.live.connect({
      model: this.options.model,
      config: {
        responseModalities: [Modality.AUDIO],
      },
      callbacks: {
        onmessage: (message) => this.handleMessage(message),
        onerror: this.options.onError,
        onclose: this.options.onClose,
      },
    });
  }

  sendAudio(base64Audio: string): void {
    this.session?.sendRealtimeInput({
      audio: {
        mimeType: "audio/pcm;rate=16000",
        data: base64Audio,
      },
    });
  }

  close(): void {
    this.session?.close();
    this.session = null;
  }

  private handleMessage(message: LiveServerMessage): void {
    if (message.setupComplete) {
      this.options.onReady();
      return;
    }

    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.options.onAudio(part.inlineData.data);
        }
      }
    }

    if (message.serverContent?.turnComplete) {
      this.options.onTurnComplete();
    }

    if (message.goAway) {
      console.warn("Gemini Live session ending:", message.goAway);
    }
  }
}
