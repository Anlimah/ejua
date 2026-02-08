/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-a0a8767766c84b1d804f6206f3d1d5d3.r2.dev',
      },
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
    ],
  },
  // Enable standalone output for Docker/Railway deployment
  output: 'standalone',
};

module.exports = nextConfig;
