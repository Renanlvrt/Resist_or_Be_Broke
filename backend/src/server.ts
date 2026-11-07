import './env.js';
import express from 'express';
import cors from 'cors';
import voice from './routes/voice.js';
import recap from './routes/recap.js';
import search from './routes/search.js';
import interview from './routes/interview.js';

const app = express();
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || /^chrome-extension:\/\//.test(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)),
}));
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/voice', voice);
app.use('/api/voice', recap);
app.use('/api/search', search);
app.use('/api/interview', interview);

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`KeepHard backend on :${port}`));
