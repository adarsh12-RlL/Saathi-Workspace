import path from "node:path";
import type { NextConfig } from "next";
import { privatePageHeaders,communityPageHeaders } from "../privacy-policy.mjs";

const nextConfig: NextConfig = {
  headers() { return [...privatePageHeaders(),...communityPageHeaders()]; },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // The cloud controller is a deliberately shared, framework-neutral module
    // in the parent workspace. Keep the root narrow to this workspace only.
    root: path.join(__dirname, ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
