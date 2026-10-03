import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 保留内部请求原始origin，避免回环IP被规范化为localhost后误判为外部重写。
  skipProxyUrlNormalize: true,
  experimental: { serverActions: { bodySizeLimit: "22mb" }, cpus: 1, webpackMemoryOptimizations: true },
};

export default nextConfig;
