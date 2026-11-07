// STUB (owner: third teammate - replace freely)
import { Router } from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../env.js';

const router = Router();
router.post('/', (_req, res) => {
  res.json(JSON.parse(readFileSync(path.join(ROOT, 'packages/shared/demo-search-cached.json'), 'utf8')));
});
export default router;
