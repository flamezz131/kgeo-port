import type { NextConfig } from "next";

// This project sits inside a tree that contains several sibling copies of the
// app and a parent package.json with no lockfile. Pin the workspace/tracing
// root to THIS directory so Turbopack's dev file-watcher and the build tracer
// never walk up into those sibling copies (and the 1.7 GB backup archive next
// to them). import.meta.dirname is available on Node >= 20.11 (this repo runs 22).
const projectRoot = import.meta.dirname;

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  // The Parent Report PDF reads its logo from disk at request time, so the
  // file must be traced into the counselor and director server bundles.
  outputFileTracingIncludes: {
    "/counselor/**": ["./src/logo/image.png"],
    "/director/**": ["./src/logo/image.png"],
  },
  // Serve <Image> sources straight from /public. In Vercel services mode the
  // /_next/image optimizer endpoint is not provisioned and returns 404.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Only this site may frame its pages (clickjacking protection).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // 10 MiB evidence plus bounded multipart overhead.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
