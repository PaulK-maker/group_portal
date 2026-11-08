import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';

import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import memberRoutes from './routes/members.js';
import contributionRoutes from './routes/contributions.js';
import pendingRoutes from './routes/pending.js';
import boardRoutes from './routes/board.js';
import exportRoutes from './routes/export.js';
import inboundRoutes from './routes/inbound.js';

const app = express();
// Behind a host proxy (Render, Railway...) set TRUST_PROXY=1 so IP rate limits see the real client IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' })); // Mailgun posts form data

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Public / account-level
app.use('/api/auth', authRoutes);
app.use('/api/inbound', inboundRoutes);
app.use('/api/groups', groupRoutes);

// Everything below is scoped to one group (tenant)
app.use('/api/groups/:groupId/members', memberRoutes);
app.use('/api/groups/:groupId/contributions', contributionRoutes);
app.use('/api/groups/:groupId/pending', pendingRoutes);
app.use('/api/groups/:groupId/board', boardRoutes);
app.use('/api/groups/:groupId/export', exportRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.name === 'ValidationError' ? 400 : err.status || 500;
  res.status(status).json({ error: err.message || 'Server error' });
});

const port = process.env.PORT || 4000;
connectDB(process.env.MONGO_URI).then(() => {
  app.listen(port, () => console.log(`PayPortal API on :${port}`));
});
