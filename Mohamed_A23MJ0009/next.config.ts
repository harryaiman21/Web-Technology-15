import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: ["10.20.80.7"],
  serverExternalPackages: [
    "pdf-parse",
    "@napi-rs/canvas",
    "tesseract.js",
    "tesseract.js-core",
  ],
};

export default nextConfig;
