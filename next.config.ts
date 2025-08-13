import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh4.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh5.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh6.googleusercontent.com' },
      // Allow Vercel Blob subdomains for public storage (avatars, rank icons)
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
    ],
  },
  webpack: (config) => {
    // Mark sharp as external to avoid bundling optional native binary
    const externals = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean);
    externals.push({ sharp: 'commonjs sharp' });
    // @ts-ignore - type mismatch acceptable
    config.externals = externals;
    return config;
  },
};

export default nextConfig;
