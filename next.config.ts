import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // מתעלם משגיאות ESLint בזמן build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // מתעלם משגיאות TypeScript בזמן build
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    // טיפול ב-tesseract.js ו-canvas
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        'tesseract.js',
        'tesseract.js-core',
        'canvas',
      ];
    }
    return config;
  },
};

export default nextConfig;