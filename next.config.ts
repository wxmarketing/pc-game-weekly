import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Avoid workspace-root mis-detection when multiple lockfiles exist.
    root: __dirname,
  },
  // 用局域网 IP / 自定义本机域名访问 dev 时，避免 _next 静态资源被跨站策略拦成 403（控制台可能连带报 "Host" 相关）
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // ── 内存优化：排除非代码目录的文件监听 ──
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.next/**",
          "**/data_sources/**",
          "**/data/**",
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
