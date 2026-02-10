import type {NextConfig} from 'next';
import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';

// Load root .env
loadEnv();
// Local dev only: load functions/.env.local (production uses platform env vars)
const functionsEnv = path.join(process.cwd(), 'functions/.env.local');
if (fs.existsSync(functionsEnv)) {
  loadEnv({ path: functionsEnv, override: true });
}

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
