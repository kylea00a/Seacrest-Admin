import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      const nodeBuiltins = ["fs", "path", "crypto"];
      const existing = config.externals;
      if (Array.isArray(existing)) {
        config.externals = [...existing, ...nodeBuiltins];
      } else {
        config.externals = nodeBuiltins;
      }
    }
    return config;
  },
};

export default nextConfig;
