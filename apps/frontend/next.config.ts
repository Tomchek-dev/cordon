import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["pop-os.local", "pop-os", "192.168.1.85", "localhost"],
  output: "standalone",
  // Monorepo: trace file dependencies from the repo root, not just this workspace.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
