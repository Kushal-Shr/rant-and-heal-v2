import type { RTCIceServer } from "@/src/types/therapy";

const DEFAULT_STUN_SERVER: RTCIceServer = {
  urls: "stun:stun.l.google.com:19302",
};

export function getTherapyIceServers(): RTCIceServer[] {
  const turnUrls = process.env.TURN_URLS
    ?.split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;

  if (!turnUrls?.length || !turnUsername || !turnCredential) {
    return [DEFAULT_STUN_SERVER];
  }

  return [
    DEFAULT_STUN_SERVER,
    {
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    },
  ];
}
