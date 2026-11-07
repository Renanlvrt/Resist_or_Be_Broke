import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ENV_PATH = path.join(ROOT, '.env');
dotenv.config({ path: ENV_PATH });
