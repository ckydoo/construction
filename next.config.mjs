/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['**'],
  serverExternalPackages: ['@prisma/client','pdf-lib'],
};
export default nextConfig;
