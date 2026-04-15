import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // xlsx (SheetJS) is client-side only — don't bundle it server-side
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...externals, "xlsx"];
    }
    return config;
  },

  // Silence the "multiple lockfiles" warning (root has server.js package.json)
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
