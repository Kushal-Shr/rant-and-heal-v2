import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Resend is used only by Node.js route handlers.
  serverExternalPackages: ["resend"],
  // This value is non-sensitive and lets the client hide trial-disabled voice UI.
  // ENABLE_MOMO_VOICE remains the single operator-facing configuration name.
  env: {
    NEXT_PUBLIC_MOMO_VOICE_ENABLED: process.env.ENABLE_MOMO_VOICE === "true" ? "true" : "false",
  },
};

export default nextConfig;
