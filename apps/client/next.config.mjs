/** @type {import('next').NextConfig} */
const backendApiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || process.env.BACKEND_API_URL;
if (!backendApiUrl) {
  throw new Error('NEXT_PUBLIC_BACKEND_API_URL or BACKEND_API_URL is required; frontend must not guess a backend endpoint.');
}

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
