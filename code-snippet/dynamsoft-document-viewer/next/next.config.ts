import type { NextConfig } from "next";
const CopyPlugin = require("copy-webpack-plugin");
const path = require("node:path");

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.plugins.push(
      new CopyPlugin({
        patterns: [
          {
            from: path.resolve(
              __dirname,
              "node_modules/dynamsoft-document-viewer/dist",
            ),
            to: path.resolve(__dirname, "public/dynamsoft-document-viewer"),
            info: () => ({ minimized: true }),
            force: true,
          },
        ],
      }),
    );

    return config;
  },
};

export default nextConfig;
