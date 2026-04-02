import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Avoid workspace-root mis-detection when multiple lockfiles exist.
    root: __dirname,
  },
};

export default nextConfig;
