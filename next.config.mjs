/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Decimal instances must not be serialised across the server/client
    // boundary; we always convert to strings first.
    serverActions: { bodySizeLimit: '4mb' },
  },
  // The demo build ships its whole database as a file and runs PostgreSQL in
  // WebAssembly, neither of which Next's module tracing can discover on its own.
  outputFileTracingIncludes: {
    '/**/*': ['./prisma/demo-db.tar.gz', './node_modules/@electric-sql/pglite/dist/**'],
  },
  serverExternalPackages: ['@electric-sql/pglite'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};
export default nextConfig;
