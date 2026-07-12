import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /** Monorepo pnpm : la racine de tracing doit remonter jusqu'au repo, sinon
   *  le build standalone ne voit pas packages/* (nécessaire pour Docker). */
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
};

export default nextConfig;
