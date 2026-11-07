import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Keys live in the repo-root .env (gitignored). Load it so `pnpm --filter @resist/backend dev` sees them.
loadEnvConfig(resolve(process.cwd(), '../..'));

const config: NextConfig = {
  transpilePackages: ['@resist/engine'],
};

export default config;
