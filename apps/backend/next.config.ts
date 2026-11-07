import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Keys live in the repo-root .env (gitignored). Load it so `pnpm --filter @resist/backend dev` sees them.
loadEnvConfig(resolve(process.cwd(), '../..'));

const config: NextConfig = {
  transpilePackages: ['@resist/engine'],
  // The Firecrawl SDK feature-detects zod v4 at runtime; let Node load it instead of webpack bundling it.
  serverExternalPackages: ['@mendable/firecrawl-js'],
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
};

export default config;
