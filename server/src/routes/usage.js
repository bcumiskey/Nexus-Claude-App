import { Router } from 'express';
import { query } from '../db.js';
import { getBudgetStatus, getUsageSummary, logUsage } from '../services/usage.js';

const router = Router();

// ── Settings ──
router.get('/settings', async (req, res) => {
  const r = await query('SELECT [key], value, updated_at FROM nexus.settings');
  const settings = {};
  for (const row of r.recordset) settings[row.key] = row.value;
  res.json(settings);
});

router.patch('/settings/:key', async (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value is required' });
  await query(
    `MERGE nexus.settings AS t
     USING (SELECT @key AS [key]) AS s ON t.[key] = s.[key]
     WHEN MATCHED THEN UPDATE SET value = @value, updated_at = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT ([key], value) VALUES (@key, @value);`,
    { key: req.params.key, value: String(value) }
  );
  res.json({ key: req.params.key, value });
});

// ── Budget ──
router.get('/budget', async (req, res) => {
  const budgets = await getBudgetStatus();
  res.json(budgets);
});

router.patch('/budget/:id', async (req, res) => {
  const { limitValue, warnPct, criticalPct, isActive } = req.body;
  const sets = [];
  const params = { id: parseInt(req.params.id) };

  if (limitValue !== undefined) { sets.push('limit_value = @limitValue'); params.limitValue = limitValue; }
  if (warnPct !== undefined) { sets.push('warn_pct = @warnPct'); params.warnPct = warnPct; }
  if (criticalPct !== undefined) { sets.push('critical_pct = @criticalPct'); params.criticalPct = criticalPct; }
  if (isActive !== undefined) { sets.push('is_active = @isActive'); params.isActive = isActive; }
  sets.push('updated_at = SYSUTCDATETIME()');

  await query(`UPDATE nexus.budgets SET ${sets.join(', ')} WHERE id = @id`, params);
  res.json({ updated: true });
});

// ── Usage summary ──
router.get('/summary', async (req, res) => {
  const { startDate, endDate, context, modelId, projectId } = req.query;
  const data = await getUsageSummary({ startDate, endDate, context, modelId, projectId });
  res.json(data);
});

// ── Usage breakdown (for dashboard charts) ──
router.get('/breakdown', async (req, res) => {
  const { period = 'month' } = req.query;
  let dateFilter;
  if (period === 'week') dateFilter = "usage_date >= DATEADD(day, -7, CAST(GETUTCDATE() AS DATE))";
  else if (period === 'day') dateFilter = "usage_date = CAST(GETUTCDATE() AS DATE)";
  else dateFilter = "usage_date >= DATEADD(month, -1, CAST(GETUTCDATE() AS DATE))";

  const byContext = await query(
    `SELECT context, SUM(total_cost_usd) AS cost, SUM(request_count) AS requests,
            SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out
     FROM nexus.usage_daily WHERE ${dateFilter}
     GROUP BY context`
  );

  const byModel = await query(
    `SELECT model_id, SUM(total_cost_usd) AS cost, SUM(request_count) AS requests
     FROM nexus.usage_daily WHERE ${dateFilter}
     GROUP BY model_id`
  );

  const byDay = await query(
    `SELECT usage_date, SUM(total_cost_usd) AS cost, SUM(request_count) AS requests
     FROM nexus.usage_daily WHERE ${dateFilter}
     GROUP BY usage_date ORDER BY usage_date`
  );

  res.json({
    period,
    byContext: byContext.recordset,
    byModel: byModel.recordset,
    byDay: byDay.recordset,
  });
});

// ── Log external usage (claude.ai manual entry) ──
router.post('/log-external', async (req, res) => {
  const { context = 'claude_ai', modelId = 'claude-sonnet-4-5-20250929', messageCount = 1, projectId = null } = req.body;
  await logUsage({ context, modelId, projectId, messageCount });
  res.json({ logged: true, context, messageCount });
});

export default router;
