/** @type {import('next').NextConfig} */
const backendApiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || process.env.BACKEND_API_URL || 'http://127.0.0.1:8001';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendApiUrl}/api/:path*`,
      },
      {
        source: '/health/:path*',
        destination: `${backendApiUrl}/health/:path*`,
      },
      {
        source: '/public/:path*',
        destination: `${backendApiUrl}/public/:path*`,
      },
      {
        source: '/openapi.json',
        destination: `${backendApiUrl}/openapi.json`,
      },
      {
        source: '/docs',
        destination: `${backendApiUrl}/docs`,
      },
      {
        source: '/redoc',
        destination: `${backendApiUrl}/redoc`,
      },
    ];
  },
};

export default nextConfig;
