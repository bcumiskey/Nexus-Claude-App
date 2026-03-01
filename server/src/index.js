import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import healthRouter from './routes/health.js';
import chatRouter from './routes/chat.js';
import enhanceRouter from './routes/enhance.js';
import projectRouter from './routes/project.js';
import usageRouter from './routes/usage.js';
import { getPool } from './db.js';

const app = express();
const PORT = process.env.PORT || 3100;

// ── Middleware ──
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }));
app.use(express.json({ limit: '10mb' }));

// ── Routes ──
app.use('/api/health', healthRouter);
app.use('/api/chat', chatRouter);
app.use('/api/enhance', enhanceRouter);
app.use('/api/project', projectRouter);
app.use('/api/usage', usageRouter);

// ── Error handler ──
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Start ──
async function start() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║       NEXUS — Starting Up...         ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // Pre-connect to SQL Server
  try {
    await getPool();
  } catch (err) {
    console.error('✗ SQL Server connection failed:', err.message);
    console.error('  Check your .env SQL_* settings');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`✓ Nexus API listening on port ${PORT}`);
    console.log(`  Health:   http://localhost:${PORT}/api/health`);
    console.log(`  Chat:     http://localhost:${PORT}/api/chat`);
    console.log(`  Enhance:  http://localhost:${PORT}/api/enhance`);
    console.log(`  Projects: http://localhost:${PORT}/api/project`);
    console.log(`  Usage:    http://localhost:${PORT}/api/usage`);
    console.log('');
  });
}

start();
