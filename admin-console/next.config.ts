import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    // Increase body size limit for API routes
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
