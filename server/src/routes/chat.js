import { Router } from 'express';
import { query, sql } from '../db.js';
import { streamChat, callModel } from '../services/anthropic.js';
import { logUsage } from '../services/usage.js';

const router = Router();

// ── List chats ──
router.get('/', async (req, res) => {
  const r = await query(
    `SELECT c.id, c.title, c.model_id, c.connection_type, c.project_id, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM nexus.messages WHERE chat_id = c.id) AS message_count
     FROM nexus.chats c
     ORDER BY c.updated_at DESC`
  );
  res.json(r.recordset);
});

// ── Create chat ──
router.post('/new', async (req, res) => {
  const { title = 'New Chat', modelId, projectId = null } = req.body;
  const model = modelId || 'claude-sonnet-4-5-20250929';
  const r = await query(
    `INSERT INTO nexus.chats (title, model_id, project_id)
     OUTPUT INSERTED.*
     VALUES (@title, @model, @projectId)`,
    { title, model, projectId }
  );
  res.status(201).json(r.recordset[0]);
});

// ── Get chat with messages ──
router.get('/:id', async (req, res) => {
  const chat = await query(
    'SELECT * FROM nexus.chats WHERE id = @id',
    { id: parseInt(req.params.id) }
  );
  if (!chat.recordset.length) return res.status(404).json({ error: 'Chat not found' });

  const msgs = await query(
    'SELECT * FROM nexus.messages WHERE chat_id = @id ORDER BY created_at ASC',
    { id: parseInt(req.params.id) }
  );
  res.json({ ...chat.recordset[0], messages: msgs.recordset });
});

// ── Get messages for a chat ──
router.get('/:id/messages', async (req, res) => {
  const msgs = await query(
    'SELECT * FROM nexus.messages WHERE chat_id = @id ORDER BY created_at ASC',
    { id: parseInt(req.params.id) }
  );
  res.json(msgs.recordset);
});

// ── Update chat ──
router.patch('/:id', async (req, res) => {
  const { title, modelId, projectId } = req.body;
  const sets = [];
  const params = { id: parseInt(req.params.id) };

  if (title !== undefined) { sets.push('title = @title'); params.title = title; }
  if (modelId !== undefined) { sets.push('model_id = @modelId'); params.modelId = modelId; }
  if (projectId !== undefined) { sets.push('project_id = @projectId'); params.projectId = projectId; }
  sets.push('updated_at = SYSUTCDATETIME()');

  if (sets.length <= 1) return res.status(400).json({ error: 'No fields to update' });

  await query(`UPDATE nexus.chats SET ${sets.join(', ')} WHERE id = @id`, params);
  const r = await query('SELECT * FROM nexus.chats WHERE id = @id', { id: params.id });
  res.json(r.recordset[0]);
});

// ── Delete chat ──
router.delete('/:id', async (req, res) => {
  await query('DELETE FROM nexus.chats WHERE id = @id', { id: parseInt(req.params.id) });
  res.json({ deleted: true });
});

// ── Send message (SSE streaming) ──
router.post('/:id/send', async (req, res) => {
  const chatId = parseInt(req.params.id);
  const { content, model: overrideModel, enhanced = false } = req.body;

  if (!content) return res.status(400).json({ error: 'content is required' });

  // Get chat
  const chatResult = await query('SELECT * FROM nexus.chats WHERE id = @id', { id: chatId });
  if (!chatResult.recordset.length) return res.status(404).json({ error: 'Chat not found' });
  const chat = chatResult.recordset[0];

  const model = overrideModel || chat.model_id;

  // Save user message
  await query(
    `INSERT INTO nexus.messages (chat_id, role, content, enhanced)
     VALUES (@chatId, 'user', @content, @enhanced)`,
    { chatId, content, enhanced }
  );

  // Load conversation history for context
  const historyResult = await query(
    `SELECT role, content FROM nexus.messages
     WHERE chat_id = @chatId ORDER BY created_at ASC`,
    { chatId }
  );
  const messages = historyResult.recordset.map(m => ({ role: m.role, content: m.content }));

  // Build system prompt (project context injection happens here)
  let system = null;
  if (chat.project_id) {
    const ctxResult = await query(
      `SELECT TOP 1 compressed_text, context_json FROM nexus.project_context
       WHERE project_id = @pid ORDER BY version DESC`,
      { pid: chat.project_id }
    );
    if (ctxResult.recordset.length) {
      system = `You are working within a project context. Here is the current project state:\n\n${ctxResult.recordset[0].compressed_text || ctxResult.recordset[0].context_json}`;
    }
  }

  // Stream response
  try {
    const result = await streamChat({ model, messages, system, res });

    // Save assistant message
    const insertResult = await query(
      `INSERT INTO nexus.messages (chat_id, role, content, model_used, tokens_in, tokens_out, cost_usd, duration_ms)
       OUTPUT INSERTED.id
       VALUES (@chatId, 'assistant', @content, @model, @tokensIn, @tokensOut, @cost, @duration)`,
      {
        chatId,
        content: result.fullText,
        model,
        tokensIn: result.inputTokens,
        tokensOut: result.outputTokens,
        cost: result.cost,
        duration: result.durationMs,
      }
    );

    // Log usage
    await logUsage({
      context: 'api',
      modelId: model,
      projectId: chat.project_id,
      chatId,
      tokensIn: result.inputTokens,
      tokensOut: result.outputTokens,
      costUsd: result.cost,
      durationMs: result.durationMs,
    });

    // Update chat timestamp
    await query('UPDATE nexus.chats SET updated_at = SYSUTCDATETIME() WHERE id = @id', { id: chatId });

    // Auto-generate title on first message
    const msgCount = await query(
      'SELECT COUNT(*) AS cnt FROM nexus.messages WHERE chat_id = @id',
      { id: chatId }
    );
    if (msgCount.recordset[0].cnt <= 2 && chat.title === 'New Chat') {
      generateTitle(chatId, content).catch(err => console.error('Title gen error:', err));
    }
  } catch (err) {
    console.error('Chat send error:', err.message);
    // SSE error already sent by streamChat
  }
});

// ── Auto-generate title via Haiku ──
async function generateTitle(chatId, firstMessage) {
  try {
    const result = await callModel({
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 30,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Generate a short, descriptive title (max 6 words) for a conversation that starts with this message. Return ONLY the title, no quotes, no explanation.\n\nMessage: ${firstMessage.slice(0, 200)}`,
      }],
    });

    const title = result.text.trim().replace(/^["']|["']$/g, '');
    await query('UPDATE nexus.chats SET title = @title WHERE id = @id', { id: chatId, title });

    // Log the Haiku call as enhancement usage
    await logUsage({
      context: 'enhancement',
      modelId: 'claude-haiku-4-5-20251001',
      chatId,
      tokensIn: result.inputTokens,
      tokensOut: result.outputTokens,
      costUsd: result.cost,
      durationMs: result.durationMs,
    });
  } catch (err) {
    console.error('Title generation failed:', err.message);
  }
}

export default router;
