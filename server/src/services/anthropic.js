import Anthropic from '@anthropic-ai/sdk';

let client = null;

// Per-token pricing (USD) — update as Anthropic changes pricing
const PRICING = {
  'claude-opus-4-6':            { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
  'claude-sonnet-4-5-20250929': { input:  3.00 / 1_000_000, output: 15.00 / 1_000_000 },
  'claude-haiku-4-5-20251001':  { input:  0.80 / 1_000_000, output:  4.00 / 1_000_000 },
};

export function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log('✓ Anthropic client initialized');
  }
  return client;
}

export function calcCost(model, tokensIn, tokensOut) {
  const p = PRICING[model] || PRICING['claude-sonnet-4-5-20250929'];
  return (tokensIn * p.input) + (tokensOut * p.output);
}

/**
 * Stream a chat completion via SSE.
 * @param {object} opts
 * @param {string} opts.model - Model ID
 * @param {Array} opts.messages - Conversation messages [{role, content}]
 * @param {string} [opts.system] - System prompt
 * @param {number} [opts.maxTokens] - Max output tokens
 * @param {number} [opts.temperature] - Temperature
 * @param {import('express').Response} opts.res - Express response for SSE
 * @returns {Promise<{inputTokens, outputTokens, fullText, stopReason}>}
 */
export async function streamChat({ model, messages, system, maxTokens = 4096, temperature = 1, res }) {
  const c = getClient();
  const startMs = Date.now();

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const params = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
    stream: true,
  };
  if (system) params.system = system;

  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = null;

  try {
    const stream = c.messages.stream(params);

    stream.on('text', (text) => {
      fullText += text;
      res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
    });

    const finalMessage = await stream.finalMessage();

    inputTokens = finalMessage.usage?.input_tokens || 0;
    outputTokens = finalMessage.usage?.output_tokens || 0;
    stopReason = finalMessage.stop_reason;

    const durationMs = Date.now() - startMs;
    const cost = calcCost(model, inputTokens, outputTokens);

    // Send final metadata
    res.write(`data: ${JSON.stringify({
      type: 'done',
      usage: { inputTokens, outputTokens },
      cost,
      durationMs,
      stopReason,
      model,
    })}\n\n`);

    res.end();

    return { inputTokens, outputTokens, fullText, stopReason, durationMs, cost };
  } catch (err) {
    // Send error via SSE
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message, status: err.status })}\n\n`);
    res.end();
    throw err;
  }
}

/**
 * Non-streaming call (for enhancement, title generation, etc.)
 */
export async function callModel({ model, messages, system, maxTokens = 1024, temperature = 1 }) {
  const c = getClient();
  const startMs = Date.now();

  const params = { model, max_tokens: maxTokens, temperature, messages };
  if (system) params.system = system;

  const resp = await c.messages.create(params);
  const durationMs = Date.now() - startMs;
  const text = resp.content.map(b => b.type === 'text' ? b.text : '').join('');
  const inputTokens = resp.usage?.input_tokens || 0;
  const outputTokens = resp.usage?.output_tokens || 0;
  const cost = calcCost(model, inputTokens, outputTokens);

  return { text, inputTokens, outputTokens, durationMs, cost, model };
}

/**
 * Health check — verify API key works
 */
export async function apiHealthCheck() {
  try {
    const c = getClient();
    const resp = await c.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Reply with just the word "ok"' }],
    });
    return { connected: true, model: resp.model };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}
