import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Hide the floating Next.js dev badge (demo footage is recorded from `npm run dev`).
  devIndicators: false,
  turbopack: {
    // Pin the workspace root: a stray lockfile in a parent directory would otherwise be picked up.
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
