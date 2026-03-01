import { query } from "@/lib/db";
import { streamChat, callModel } from "@/lib/anthropic";
import { getDefaultModel, getEnhancementModel } from "@/lib/models";

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const { content, model, enhanced, thinking, fast } = body;

  if (!content) {
    return new Response(JSON.stringify({ error: "content is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get chat
  const chats = await query("SELECT * FROM chats WHERE id = $1", [id]);
  if (chats.length === 0) {
    return new Response(JSON.stringify({ error: "Chat not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const chat = chats[0];
  const modelId = model || chat.model_id || (await getDefaultModel());

  // Save user message
  await query(
    `INSERT INTO messages (chat_id, role, content, enhanced)
     VALUES ($1, 'user', $2, $3)`,
    [id, content, enhanced || false]
  );

  // Load conversation history
  const history = await query(
    "SELECT role, content FROM messages WHERE chat_id = $1 ORDER BY created_at",
    [id]
  );

  // Build system prompt from project context if attached
  let system = null;
  if (chat.project_id) {
    const ctx = await query(
      `SELECT context_json FROM project_context
       WHERE project_id = $1 ORDER BY version DESC LIMIT 1`,
      [chat.project_id]
    );
    if (ctx.length > 0 && ctx[0].context_json) {
      const proj = await query("SELECT name, goal FROM projects WHERE id = $1", [chat.project_id]);
      const projectName = proj[0]?.name || "Project";
      const projectGoal = proj[0]?.goal || "";
      system = `You are working on project "${projectName}". ${projectGoal ? `Goal: ${projectGoal}. ` : ""}Context:\n${JSON.stringify(ctx[0].context_json, null, 2)}`;
    }
  }

  // Stream response
  const messages = history.map((m) => ({ role: m.role, content: m.content }));

  const stream = streamChat({ model: modelId, system, messages, thinking: !!thinking, fast: !!fast });

  // Fire-and-forget: save assistant message and auto-title after stream completes
  const [readable, monitor] = stream.tee();

  saveAfterStream(monitor, id, chat, modelId, content);

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function saveAfterStream(stream, chatId, chat, modelId, userContent) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let doneData = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "done") doneData = data;
        } catch {
          // skip parse errors
        }
      }
    }
  } catch {
    return;
  }

  if (!doneData) return;

  // Save assistant message
  try {
    await query(
      `INSERT INTO messages (chat_id, role, content, model_used, tokens_in, tokens_out, cost_usd, duration_ms)
       VALUES ($1, 'assistant', $2, $3, $4, $5, $6, $7)`,
      [
        chatId,
        doneData.fullText,
        doneData.model,
        doneData.usage.input_tokens,
        doneData.usage.output_tokens,
        doneData.cost,
        doneData.durationMs,
      ]
    );

    // Update chat timestamp
    await query("UPDATE chats SET updated_at = NOW() WHERE id = $1", [chatId]);

    // Auto-title on first message
    if (chat.title === "New Chat") {
      const enhModel = await getEnhancementModel();
      const titleResult = await callModel({
        model: enhModel,
        system: "Generate a concise chat title (max 6 words, no quotes) for this conversation based on the user's first message.",
        messages: [{ role: "user", content: userContent }],
        maxTokens: 30,
      });
      const title = titleResult.text.trim().replace(/^["']|["']$/g, "");
      if (title) {
        await query("UPDATE chats SET title = $1, updated_at = NOW() WHERE id = $2", [
          title,
          chatId,
        ]);
      }
    }
  } catch (err) {
    console.error("Error saving after stream:", err.message);
  }
}
