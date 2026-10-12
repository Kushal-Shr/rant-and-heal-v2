import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit the minimal self-contained server used by the production container.
  output: "standalone",
  // Resend is used only by Node.js route handlers.
  serverExternalPackages: ["resend", "ws"],
  // This value is non-sensitive and lets the client hide trial-disabled voice UI.
  // ENABLE_MOMO_VOICE remains the single operator-facing configuration name.
  env: {
    NEXT_PUBLIC_MOMO_VOICE_ENABLED: process.env.ENABLE_MOMO_VOICE === "true" ? "true" : "false",
  },
};

export default nextConfig;
