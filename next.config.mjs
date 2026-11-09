/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['**'],
  serverExternalPackages: ['pdf-lib'],
};
export default nextConfig;
