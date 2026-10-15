/** Toggle an existing sender track without renegotiating or stopping the call. */
export function setCallMediaEnabled(stream: MediaStream | null, kind: "audio" | "video", enabled: boolean) {
  const tracks = kind === "audio" ? stream?.getAudioTracks() : stream?.getVideoTracks();
  tracks?.forEach((track) => { track.enabled = enabled; });
}
