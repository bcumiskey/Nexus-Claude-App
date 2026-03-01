import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { callModel } from "@/lib/anthropic";
import { getEnhancementModel, calcCost, getPricing } from "@/lib/models";

const TASK_PATTERNS = {
  architecture: /architect|design|structure|pattern|system|scalab|microserv/i,
  debugging: /debug|fix|error|bug|issue|broken|crash|fail|exception|stack trace/i,
  codeGen: /write|create|build|implement|generate|function|class|component|module/i,
  config: /config|setup|install|deploy|environment|docker|ci\/cd|pipeline/i,
  sql: /sql|query|database|table|join|index|migration|schema/i,
  analysis: /analyze|review|explain|understand|how does|what does|why does/i,
  creative: /brainstorm|idea|suggest|recommend|approach|strategy|plan/i,
  dataWork: /data|csv|json|parse|transform|convert|format|extract/i,
  simple: /list|count|sum|sort|filter|hello|hi|test|ping/i,
};

function analyzePrompt(text) {
  const wordCount = text.split(/\s+/).length;
  const hasCode = /```|function |class |const |let |var |import |def |return /.test(text);
  const questionCount = (text.match(/\?/g) || []).length;

  let matchedType = "general";
  for (const [type, pattern] of Object.entries(TASK_PATTERNS)) {
    if (pattern.test(text)) {
      matchedType = type;
      break;
    }
  }

  const weights = {
    architecture: 4, debugging: 3, codeGen: 3, config: 2,
    sql: 2, analysis: 2, creative: 2, dataWork: 2, simple: 1, general: 2,
  };

  let complexity = weights[matchedType] || 2;
  if (wordCount > 200) complexity = Math.min(5, complexity + 1);
  if (hasCode) complexity = Math.min(5, complexity + 1);
  if (questionCount > 3) complexity = Math.min(5, complexity + 1);
  if (wordCount < 20 && !hasCode) complexity = Math.max(1, complexity - 1);

  const recommendedModel =
    complexity >= 4 ? "claude-opus-4-6" :
    complexity >= 2 ? "claude-sonnet-4-6" :
    "claude-haiku-4-5-20251001";

  const estimatedTokensIn = Math.max(100, wordCount * 2);
  const estimatedTokensOut =
    matchedType === "codeGen" ? 2000 :
    matchedType === "analysis" ? 1500 :
    matchedType === "simple" ? 200 : 1000;

  const pricing = getPricing(recommendedModel);
  const estimatedCost =
    (estimatedTokensIn / 1_000_000) * pricing.input +
    (estimatedTokensOut / 1_000_000) * pricing.output;

  return {
    taskType: matchedType,
    complexity,
    recommendedModel,
    estimatedTokensIn,
    estimatedTokensOut,
    estimatedCost,
    confidence: complexity >= 3 ? "high" : "medium",
  };
}

const ENHANCEMENT_SYSTEM = `You are a prompt enhancement specialist. Improve the user's prompt to get better results from Claude.
Focus on:
- Adding specificity and clarity
- Including format instructions where helpful
- Adding relevant constraints
- Keeping the enhanced version concise but complete

Return ONLY the enhanced prompt text, nothing else.`;

export async function POST(request) {
  try {
    const { prompt, projectId } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const analysis = analyzePrompt(prompt);
    const enhModel = await getEnhancementModel();

    let projectContext = null;
    if (projectId) {
      const ctx = await query(
        `SELECT pc.context_json, p.name, p.goal
         FROM project_context pc
         JOIN projects p ON p.id = pc.project_id
         WHERE pc.project_id = $1
         ORDER BY pc.version DESC LIMIT 1`,
        [projectId]
      );
      if (ctx.length > 0) {
        projectContext = { name: ctx[0].name, goal: ctx[0].goal, context: ctx[0].context_json };
      }
    }

    let enhancedPrompt = prompt;
    let enhancementMeta = null;

    try {
      const messages = [{ role: "user", content: prompt }];
      let system = ENHANCEMENT_SYSTEM;
      if (projectContext) {
        system += `\n\nProject context — "${projectContext.name}": ${projectContext.goal || ""}\n${JSON.stringify(projectContext.context, null, 2)}`;
      }

      const result = await callModel({ model: enhModel, system, messages });
      enhancedPrompt = result.text;
      enhancementMeta = {
        model: result.model,
        tokens: result.usage,
        cost: result.cost,
        durationMs: result.durationMs,
      };
    } catch (err) {
      console.error("Enhancement failed, returning original:", err.message);
    }

    return NextResponse.json({
      original: prompt,
      enhanced: enhancedPrompt,
      analysis,
      enhancement: enhancementMeta,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
