import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['tesseract.js', 'tesseract.js-core'],
  },
  api: { bodyParser: { sizeLimit: '10mb' } },
  eslint: { ignoreDuringBuilds: true }, // לא לחסום build בגלל ESLint
};

export default nextConfig;
