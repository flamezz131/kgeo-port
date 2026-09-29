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
  experimental: {
    serverActions: {
      // 10 MiB evidence plus bounded multipart overhead.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
