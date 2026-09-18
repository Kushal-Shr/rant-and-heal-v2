import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Resend is used only by Node.js route handlers.
  serverExternalPackages: ["resend"],
};

export default nextConfig;
