/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  distDir: 'out',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig 