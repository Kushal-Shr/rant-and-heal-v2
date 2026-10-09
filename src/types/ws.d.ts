declare module "ws" {
  interface WebSocketOptions {
    headers?: Record<string, string>;
  }

  export default class WebSocket {
    static readonly OPEN: number;
    readonly readyState: number;
    constructor(url: string, options?: WebSocketOptions);
    once(event: "open", listener: () => void): this;
    once(event: "error", listener: (error: Error) => void): this;
    on(event: "message", listener: (data: { toString(): string }) => void): this;
    on(event: "close", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    off(event: "open", listener: () => void): this;
    off(event: "error", listener: (error: Error) => void): this;
    send(data: string): void;
    close(): void;
  }
}
