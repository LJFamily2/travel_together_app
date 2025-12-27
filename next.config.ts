import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "";
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://static.cloudflareinsights.com https://*.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ws: wss: ${socketUrl} https://static.cloudflareinsights.com https://*.cloudflareinsights.com;`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
