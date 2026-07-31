import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Vinext evaluates multipart App Router requests through the server-action
    // body guard before route handlers. Keep this just above the portrait
    // route's explicit 8 MB file limit so valid source photos reach the route.
    serverActions: {
      bodySizeLimit: "9mb",
    },
  },
};

export default nextConfig;
