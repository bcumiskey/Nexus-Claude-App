import { Router } from 'express';
import { query } from '../db.js';
import { callModel, calcCost } from '../services/anthropic.js';
import { logUsage } from '../services/usage.js';

const router = Router();

// Task patterns for routing analysis
const TASK_PATTERNS = [
  { id: 'architecture', pattern: /architect|design|system|infrastructure|middleware|integrat/i, weight: 5 },
  { id: 'debugging',    pattern: /debug|error|fix|broken|issue|traceback|exception|stack\s?trace/i, weight: 4 },
  { id: 'codeGen',      pattern: /write|create|implement|build|code|function|class|component|script/i, weight: 3 },
  { id: 'config',       pattern: /config|setup|install|deploy|bgp|firewall|vpn|tunnel|network/i, weight: 3 },
  { id: 'sql',          pattern: /sql|query|database|table|schema|stored\s?proc|join|index/i, weight: 3 },
  { id: 'analysis',     pattern: /analy[sz]|compare|evaluate|assess|review|audit|investigate/i, weight: 4 },
  { id: 'creative',     pattern: /write|draft|email|document|proposal|report|memo|article/i, weight: 2 },
  { id: 'dataWork',     pattern: /csv|json|xml|parse|transform|etl|import|export|data/i, weight: 2 },
  { id: 'simple',       pattern: /what is|how do|explain|define|list|summarize|convert/i, weight: 1 },
];

const MODELS = [
  { id: 'claude-opus-4-6',            name: 'Opus',   tier: 'architect', tokPerSec: 40 },
  { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet', tier: 'engineer',  tokPerSec: 80 },
  { id: 'claude-haiku-4-5-20251001',  name: 'Haiku',  tier: 'rapid',     tokPerSec: 150 },
];

function analyzePrompt(text) {
  const tasks = [];
  let totalWeight = 0;
  for (const tp of TASK_PATTERNS) {
    if (tp.pattern.test(text)) {
      tasks.push(tp.id);
      totalWeight += tp.weight;
    }
  }

  // Complexity scoring
  const wordCount = text.split(/\s+/).length;
  const hasCode = /```|function |class |const |import |SELECT /i.test(text);
  const questionCount = (text.match(/\?/g) || []).length;

  let complexity = 1;
  if (wordCount > 50) complexity++;
  if (wordCount > 150) complexity++;
  if (hasCode) complexity++;
  if (questionCount > 2) complexity++;
  if (totalWeight >= 8) complexity++;
  complexity = Math.min(complexity, 5);

  // Model recommendation
  let recommended;
  if (complexity <= 2 && !tasks.includes('architecture') && !tasks.includes('debugging')) {
    recommended = MODELS[2]; // Haiku
  } else if (complexity >= 4 || tasks.includes('architecture')) {
    recommended = MODELS[0]; // Opus
  } else {
    recommended = MODELS[1]; // Sonnet
  }

  // Estimates
  const estInputTokens = Math.round(wordCount * 1.3);
  const estOutputTokens = Math.round(estInputTokens * (complexity <= 2 ? 1.5 : complexity <= 3 ? 3 : 5));
  const estCost = calcCost(recommended.id, estInputTokens, estOutputTokens);
  const estTimeSec = Math.round(estOutputTokens / recommended.tokPerSec);

  return {
    tasks,
    complexity,
    recommended: { id: recommended.id, name: recommended.name, tier: recommended.tier },
    estimates: {
      inputTokens: estInputTokens,
      outputTokens: estOutputTokens,
      cost: Math.round(estCost * 10000) / 10000,
      timeSec: estTimeSec,
    },
    confidence: Math.min(95, 60 + (tasks.length * 8) + (wordCount > 30 ? 10 : 0)),
  };
}

const ENHANCEMENT_SYSTEM = `You are a prompt optimization engine. Your job is to rewrite the user's request to be maximally effective for a Claude model. Rules:
- Preserve the original intent exactly
- Add specificity where the original is vague
- Add output format instructions if none exist
- Add relevant constraints or edge case reminders
- If the request involves code, specify language, style, and documentation expectations
- If the request involves analysis, specify what dimensions to evaluate
- Do NOT add fluff or pleasantries
- Return ONLY the enhanced prompt, no explanation or preamble`;

// ── Enhance prompt ──
router.post('/', async (req, res) => {
  const { prompt, projectId = null } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  // Get project context if available
  let projectContext = '';
  if (projectId) {
    const ctxResult = await query(
      `SELECT TOP 1 compressed_text FROM nexus.project_context
       WHERE project_id = @pid ORDER BY version DESC`,
      { pid: projectId }
    );
    if (ctxResult.recordset.length && ctxResult.recordset[0].compressed_text) {
      projectContext = `\n\nACTIVE PROJECT CONTEXT:\n${ctxResult.recordset[0].compressed_text}`;
    }
  }

  const system = ENHANCEMENT_SYSTEM + projectContext;

  try {
    const result = await callModel({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: prompt }],
      system,
      maxTokens: 1024,
      temperature: 0.3,
    });

    // Analyze the enhanced version for routing
    const analysis = analyzePrompt(result.text);

    // Log enhancement usage
    await logUsage({
      context: 'enhancement',
      modelId: 'claude-haiku-4-5-20251001',
      projectId,
      tokensIn: result.inputTokens,
      tokensOut: result.outputTokens,
      costUsd: result.cost,
      durationMs: result.durationMs,
    });

    res.json({
      original: prompt,
      enhanced: result.text,
      routing: analysis,
      enhancement: {
        model: result.model,
        tokensIn: result.inputTokens,
        tokensOut: result.outputTokens,
        cost: result.cost,
        durationMs: result.durationMs,
      },
    });
  } catch (err) {
    console.error('Enhancement error:', err.message);
    // Fallback: return original with routing analysis only
    const analysis = analyzePrompt(prompt);
    res.json({
      original: prompt,
      enhanced: prompt,
      routing: analysis,
      enhancement: { model: null, error: err.message },
      fallback: true,
    });
  }
});

// ── Log enhancement outcome ──
router.post('/log', async (req, res) => {
  const { messageId = null, original, enhanced, projectId = null, userAction, enhancementTokens = null, enhancementCost = null, enhancementMs = null } = req.body;
  await query(
    `INSERT INTO nexus.enhancements
       (message_id, original_text, enhanced_text, project_id, enhancement_tokens, enhancement_cost, enhancement_ms, user_action)
     VALUES
       (@messageId, @original, @enhanced, @projectId, @tokens, @cost, @ms, @action)`,
    { messageId, original, enhanced, projectId, tokens: enhancementTokens, cost: enhancementCost, ms: enhancementMs, action: userAction }
  );
  res.json({ logged: true });
});

// ── Analyze only (no enhancement, just routing) ──
router.post('/analyze', (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  res.json(analyzePrompt(prompt));
});

export default router;
