/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Configure experimental features
  experimental: {
    appDocumentPreloading: true,
  },
  // Add security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' cdnjs.cloudflare.com",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' cdnjs.cloudflare.com",
              "worker-src 'self' blob: cdnjs.cloudflare.com",
              "font-src 'self' data:",
              "img-src 'self' data: blob:"
            ].join('; ')
          }
        ]
      }
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Handle node: protocol imports
      config.module.rules.push({
        test: /node:.*/,
        loader: 'null-loader',
      });

      // Ignore OpenTelemetry modules
      config.resolve.alias = {
        ...config.resolve.alias,
        '@opentelemetry/api': false,
        '@opentelemetry/core': false,
        '@opentelemetry/exporter-jaeger': false,
        '@opentelemetry/resources': false,
        '@opentelemetry/semantic-conventions': false,
        '@opentelemetry/sdk-trace-base': false,
        '@opentelemetry/sdk-trace-node': false,
      };

      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        dns: false,
        child_process: false,
        async_hooks: false,
        http2: false,
        stream: false,
        zlib: false,
        util: false,
        buffer: false,
        url: false,
        path: false,
        crypto: false,
        async: false,
      };
    }

    return config;
  },
}

module.exports = nextConfig 
