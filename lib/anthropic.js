import Anthropic from "@anthropic-ai/sdk";
import { calcCost, getEnhancementModel } from "./models";

// Last-resort fallback
const FALLBACK_MODEL = "claude-sonnet-4-6";

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

/**
 * Stream a chat completion, returning a ReadableStream of SSE events.
 */
export function streamChat({ model, system, messages, maxTokens = 16384, thinking = false, fast = false }) {
  const client = getClient();
  const modelId = model || FALLBACK_MODEL;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let fullText = "";

      try {
        const params = {
          model: modelId,
          max_tokens: maxTokens,
          messages,
        };
        if (system) params.system = system;
        if (thinking) {
          params.thinking = { type: "enabled", budget_tokens: 10000 };
        }

        const response = client.messages.stream(params);

        response.on("text", (text) => {
          fullText += text;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "text", text })}\n\n`)
          );
        });

        // Forward thinking events as distinct SSE types
        response.on("event", (event) => {
          if (event.type === "content_block_start" && event.content_block?.type === "thinking") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "thinking_start" })}\n\n`)
            );
          }
          if (event.type === "content_block_delta" && event.delta?.type === "thinking_delta") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "thinking", text: event.delta.thinking })}\n\n`)
            );
          }
        });

        const finalMessage = await response.finalMessage();
        const usage = finalMessage.usage;
        const cost = calcCost(modelId, usage.input_tokens, usage.output_tokens);

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              model: modelId,
              usage: {
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
              },
              cost,
              durationMs: Date.now() - startTime,
              fullText,
            })}\n\n`
          )
        );
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return stream;
}

/**
 * Non-streaming completion for enhancements, auto-titling, etc.
 */
export async function callModel({ model, system, messages, maxTokens = 1024 }) {
  const client = getClient();
  const modelId = model || (await getEnhancementModel());
  const startTime = Date.now();

  const params = {
    model: modelId,
    max_tokens: maxTokens,
    messages,
  };
  if (system) params.system = system;

  const response = await client.messages.create(params);
  const text = response.content[0]?.text || "";
  const usage = response.usage;
  const cost = calcCost(modelId, usage.input_tokens, usage.output_tokens);

  return {
    text,
    model: modelId,
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    },
    cost,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Health check — ping the API with a minimal request.
 */
export async function apiHealthCheck() {
  try {
    const client = getClient();
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: "ping" }],
    });
    return { connected: true };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}
