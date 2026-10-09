import {
  isRecoverableLiveModerationStop,
  LIVE_MODERATION_NOTICE,
  type LiveErrorDetails,
} from "./errors";

interface MomoLiveClientOptions {
  idToken: string;
  conversationId: string;
  onReady: () => void;
  onTranscriptDelta?: (sender: "USER" | "MOMO", delta: string) => void;
  onListening?: () => void;
  onSpeaking?: () => void;
  onInterrupted?: () => void;
  onModeration?: (message: string) => void;
  onError: (error: unknown) => void;
  onClose: (clean: boolean) => void;
}

interface LiveSessionResponse {
  liveConnection?: { id?: string };
  transport?: { type?: string; sdp?: string };
  model?: string;
  error?: string;
}

interface LiveServerEvent {
  type?: string;
  delta?: string;
  error?: LiveErrorDetails;
}

export class MomoLiveClient {
  private peer: RTCPeerConnection | null = null;
  private events: RTCDataChannel | null = null;
  private microphone: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private closeTimer: number | null = null;
  private readonly listenerAbort = new AbortController();
  private ready = false;
  private finalized = false;
  private closing = false;

  constructor(private readonly options: MomoLiveClientOptions) {}

  async connect(): Promise<void> {
    const peer = new RTCPeerConnection();
    this.peer = peer;
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("aria-hidden", "true");
    this.audio = audio;

    peer.addEventListener("track", (event) => {
      if (event.track.kind !== "audio") return;
      this.remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      audio.srcObject = this.remoteStream;
      void audio.play().catch(() => undefined);
    }, { signal: this.listenerAbort.signal });
    peer.addEventListener("connectionstatechange", () => {
      if (["failed", "disconnected"].includes(peer.connectionState) && !this.closing) {
        this.options.onError(new Error("The GPT-Live WebRTC connection was lost."));
      }
    }, { signal: this.listenerAbort.signal });

    this.microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of this.microphone.getAudioTracks()) {
      peer.addTrack(track, this.microphone);
    }

    const events = peer.createDataChannel("oai-events");
    this.events = events;
    events.addEventListener("message", ({ data }) => this.handleEvent(String(data)), {
      signal: this.listenerAbort.signal,
    });
    events.addEventListener("close", () => {
      if (!this.finalized && !this.closing) this.options.onClose(false);
    }, { signal: this.listenerAbort.signal });

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGathering(peer);
    const sdp = peer.localDescription?.sdp;
    if (!sdp) throw new Error("The browser did not create a WebRTC offer.");

    const response = await fetch("/api/momo/live-session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversationId: this.options.conversationId, sdp }),
    });
    const payload = (await response.json().catch(() => null)) as LiveSessionResponse | null;
    if (!response.ok || payload?.model !== "gpt-live-1" || !payload.liveConnection?.id || !payload.transport?.sdp) {
      throw new Error(payload?.error ?? "Could not create a monitored GPT-Live session.");
    }
    await peer.setRemoteDescription({ type: "answer", sdp: payload.transport.sdp });
  }

  setMuted(muted: boolean): void {
    for (const track of this.microphone?.getAudioTracks() ?? []) track.enabled = !muted;
    this.send({
      type: muted ? "session.input_audio.mute" : "session.input_audio.unmute",
      event_id: `momo_mute_${crypto.randomUUID()}`,
    });
  }

  interruptPlayback(): void {
    if (!this.audio || !this.remoteStream) return;
    const audio = this.audio;
    const stream = this.remoteStream;
    audio.pause();
    audio.srcObject = null;
    window.setTimeout(() => {
      if (this.audio !== audio || this.closing) return;
      audio.srcObject = stream;
      void audio.play().catch(() => undefined);
    }, 120);
    this.options.onInterrupted?.();
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    if (this.ready && this.events?.readyState === "open") {
      this.send({ type: "session.close", event_id: `momo_close_${crypto.randomUUID()}` });
      await new Promise<void>((resolve) => {
        this.closeTimer = window.setTimeout(resolve, 3_000);
        const finish = () => resolve();
        this.events?.addEventListener("close", finish, { once: true });
      });
    }
    this.cleanup();
  }

  forceClose(): void {
    this.closing = true;
    if (this.ready && this.events?.readyState === "open") {
      this.send({ type: "session.close", event_id: `momo_close_${crypto.randomUUID()}` });
    }
    this.cleanup();
  }

  private handleEvent(raw: string): void {
    let event: LiveServerEvent;
    try {
      event = JSON.parse(raw) as LiveServerEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case "session.started":
        this.ready = true;
        this.options.onReady();
        break;
      case "session.input_transcript.delta":
        if (event.delta) this.options.onTranscriptDelta?.("USER", event.delta);
        this.options.onListening?.();
        break;
      case "session.output_transcript.delta":
        if (event.delta) this.options.onTranscriptDelta?.("MOMO", event.delta);
        this.options.onSpeaking?.();
        break;
      case "session.closed":
        this.finalized = true;
        this.options.onClose(true);
        this.cleanup();
        break;
      case "error":
        if (isRecoverableLiveModerationStop(event.error)) {
          this.options.onModeration?.(LIVE_MODERATION_NOTICE);
          break;
        }
        this.options.onError(new Error(event.error?.message ?? "GPT-Live reported an error."));
        break;
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (this.events?.readyState === "open") this.events.send(JSON.stringify(payload));
  }

  private cleanup(): void {
    this.listenerAbort.abort();
    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.microphone = null;
    this.events?.close();
    this.events = null;
    this.peer?.close();
    this.peer = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
    }
    this.audio = null;
    this.remoteStream = null;
    this.ready = false;
  }
}

async function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", onState);
      reject(new Error("Timed out while preparing the WebRTC connection."));
    }, 10_000);
    function onState() {
      if (peer.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onState);
      resolve();
    }
    peer.addEventListener("icegatheringstatechange", onState);
    onState();
  });
}
