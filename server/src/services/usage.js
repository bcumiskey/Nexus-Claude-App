import { query } from '../db.js';

/**
 * Log a usage event to nexus.usage_log
 */
export async function logUsage({
  context,       // 'api', 'claude_ai', 'claude_code', 'batch', 'enhancement'
  modelId,
  projectId = null,
  chatId = null,
  tokensIn = null,
  tokensOut = null,
  costUsd = null,
  durationMs = null,
  messageCount = 1,
  userId = null,
}) {
  await query(
    `INSERT INTO nexus.usage_log
       (context, model_id, project_id, chat_id, tokens_in, tokens_out, cost_usd, duration_ms, message_count, user_id)
     VALUES
       (@context, @modelId, @projectId, @chatId, @tokensIn, @tokensOut, @costUsd, @durationMs, @messageCount, @userId)`,
    { context, modelId, projectId, chatId, tokensIn, tokensOut, costUsd, durationMs, messageCount, userId }
  );

  // Upsert daily aggregate
  await query(
    `MERGE nexus.usage_daily AS target
     USING (SELECT @usageDate AS usage_date, @context AS context, @modelId AS model_id, @projectId AS project_id) AS source
     ON target.usage_date = source.usage_date
        AND target.context = source.context
        AND target.model_id = source.model_id
        AND (target.project_id = source.project_id OR (target.project_id IS NULL AND source.project_id IS NULL))
     WHEN MATCHED THEN UPDATE SET
       tokens_in = target.tokens_in + @tokensIn,
       tokens_out = target.tokens_out + @tokensOut,
       total_cost_usd = target.total_cost_usd + @costUsd,
       request_count = target.request_count + 1,
       message_count = target.message_count + @messageCount
     WHEN NOT MATCHED THEN INSERT
       (usage_date, context, model_id, project_id, tokens_in, tokens_out, total_cost_usd, request_count, message_count)
     VALUES
       (@usageDate, @context, @modelId, @projectId, ISNULL(@tokensIn,0), ISNULL(@tokensOut,0), ISNULL(@costUsd,0), 1, @messageCount);`,
    {
      usageDate: new Date().toISOString().slice(0, 10),
      context,
      modelId,
      projectId,
      tokensIn: tokensIn || 0,
      tokensOut: tokensOut || 0,
      costUsd: costUsd || 0,
      messageCount,
    }
  );
}

/**
 * Get budget status for all active budgets
 */
export async function getBudgetStatus() {
  const budgets = await query(
    `SELECT id, context, budget_type, limit_value, warn_pct, critical_pct, is_active
     FROM nexus.budgets WHERE is_active = 1`
  );

  const results = [];
  for (const b of budgets.recordset) {
    let consumed = 0;

    if (b.budget_type === 'monthly_usd') {
      const monthStart = new Date().toISOString().slice(0, 7) + '-01';
      const contextFilter = b.context === 'all' ? '' : 'AND context = @ctx';
      const r = await query(
        `SELECT ISNULL(SUM(total_cost_usd), 0) AS total
         FROM nexus.usage_daily
         WHERE usage_date >= @monthStart ${contextFilter}`,
        { monthStart, ctx: b.context }
      );
      consumed = r.recordset[0].total;
    } else if (b.budget_type === '5hr_messages') {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      const r = await query(
        `SELECT ISNULL(SUM(message_count), 0) AS total
         FROM nexus.usage_log
         WHERE context = 'claude_ai' AND created_at >= @since`,
        { since: fiveHoursAgo }
      );
      consumed = r.recordset[0].total;
    } else if (b.budget_type === 'daily_messages') {
      const today = new Date().toISOString().slice(0, 10);
      const r = await query(
        `SELECT ISNULL(SUM(message_count), 0) AS total
         FROM nexus.usage_daily
         WHERE context = 'claude_ai' AND usage_date = @today`,
        { today }
      );
      consumed = r.recordset[0].total;
    }

    const pct = b.limit_value > 0 ? Math.round((consumed / b.limit_value) * 100) : 0;
    let status = 'ok';
    if (pct >= b.critical_pct) status = 'critical';
    else if (pct >= b.warn_pct) status = 'warning';

    results.push({
      id: b.id,
      context: b.context,
      budgetType: b.budget_type,
      limit: b.limit_value,
      consumed: Math.round(consumed * 100) / 100,
      pct,
      status,
      warnPct: b.warn_pct,
      criticalPct: b.critical_pct,
    });
  }

  return results;
}

/**
 * Get usage summary with filters
 */
export async function getUsageSummary({ startDate, endDate, context, modelId, projectId } = {}) {
  let where = 'WHERE 1=1';
  const params = {};
  if (startDate) { where += ' AND usage_date >= @startDate'; params.startDate = startDate; }
  if (endDate) { where += ' AND usage_date <= @endDate'; params.endDate = endDate; }
  if (context) { where += ' AND context = @context'; params.context = context; }
  if (modelId) { where += ' AND model_id = @modelId'; params.modelId = modelId; }
  if (projectId) { where += ' AND project_id = @projectId'; params.projectId = projectId; }

  const r = await query(
    `SELECT usage_date, context, model_id, project_id,
            tokens_in, tokens_out, total_cost_usd, request_count, message_count
     FROM nexus.usage_daily ${where}
     ORDER BY usage_date DESC`,
    params
  );
  return r.recordset;
}
