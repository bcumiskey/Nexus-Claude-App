import { Router } from 'express';
import { healthCheck as dbHealth } from '../db.js';
import { apiHealthCheck } from '../services/anthropic.js';

const router = Router();

router.get('/', async (req, res) => {
  const [db, api] = await Promise.all([dbHealth(), apiHealthCheck()]);
  const ok = db.connected && db.nexusSchema && api.connected;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: { database: db, anthropicApi: api },
  });
});

export default router;
