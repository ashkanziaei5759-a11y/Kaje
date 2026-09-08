/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Decimal instances must not be serialised across the server/client
    // boundary; we always convert to strings first.
    serverActions: { bodySizeLimit: '4mb' },
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};
export default nextConfig;
