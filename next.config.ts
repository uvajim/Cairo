import path from "path";
import type { NextConfig } from "next";

// process.cwd() is always the project directory when `next dev` is run from
// /cairo. __dirname can be unreliable in compiled Next.js config files.
const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.parqet.com" },
    ],
  },
  turbopack: {
    root: projectRoot,
    resolveAlias: {
      // The parent /workshop/package.json causes Turbopack's CSS resolver to
      // start module resolution from the wrong root and miss cairo/node_modules.
      // Pinning an absolute path bypasses the walk-up entirely.
      tailwindcss: path.resolve(projectRoot, "node_modules/tailwindcss"),
    },
  },
};

export default nextConfig;
