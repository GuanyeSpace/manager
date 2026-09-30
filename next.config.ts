import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "22mb" }, cpus: 1, webpackMemoryOptimizations: true },
};

export default nextConfig;
