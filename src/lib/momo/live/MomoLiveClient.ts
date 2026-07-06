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
  onTranscript?: (sender: "USER" | "MOMO", text: string) => void;
  onTurnComplete: () => void;
  onError: (error: unknown) => void;
  onClose: (event: CloseEvent) => void;
}

export class MomoLiveClient {
  private options: MomoLiveClientOptions;
  private session: Session | null = null;
  private inputTranscriptBuffer = "";
  private outputTranscriptBuffer = "";

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
        inputAudioTranscription: {},
        outputAudioTranscription: {},
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
    this.flushTranscript("USER");
    this.flushTranscript("MOMO");
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

    this.handleTranscript("USER", message.serverContent?.inputTranscription);
    this.handleTranscript("MOMO", message.serverContent?.outputTranscription);

    if (message.serverContent?.turnComplete) {
      this.flushTranscript("USER");
      this.flushTranscript("MOMO");
      this.options.onTurnComplete();
    }

    if (message.goAway) {
      console.warn("Gemini Live session ending:", message.goAway);
    }
  }

  private handleTranscript(
    sender: "USER" | "MOMO",
    transcription?: { text?: string; finished?: boolean }
  ): void {
    if (!transcription?.text && !transcription?.finished) {
      return;
    }

    const nextText = transcription.text?.trim() ?? "";

    if (sender === "USER") {
      this.flushTranscript("MOMO");
      this.inputTranscriptBuffer = mergeTranscriptText(this.inputTranscriptBuffer, nextText);
      if (transcription.finished) {
        this.flushTranscript("USER");
      }
      return;
    }

    this.flushTranscript("USER");
    this.outputTranscriptBuffer = mergeTranscriptText(this.outputTranscriptBuffer, nextText);
    if (transcription.finished) {
      this.flushTranscript("MOMO");
    }
  }

  private flushTranscript(sender: "USER" | "MOMO"): void {
    const text =
      sender === "USER"
        ? this.inputTranscriptBuffer.trim()
        : this.outputTranscriptBuffer.trim();

    if (!text) {
      return;
    }

    this.options.onTranscript?.(sender, text);

    if (sender === "USER") {
      this.inputTranscriptBuffer = "";
    } else {
      this.outputTranscriptBuffer = "";
    }
  }
}

function mergeTranscriptText(currentText: string, nextText: string): string {
  if (!nextText) {
    return currentText;
  }

  if (!currentText) {
    return nextText;
  }

  if (nextText.startsWith(currentText)) {
    return nextText;
  }

  return `${currentText} ${nextText}`;
}
