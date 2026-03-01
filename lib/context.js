import { getSQL } from "./db.js";

/**
 * Get all active projects with latest context metadata.
 */
export async function listProjects() {
  const sql = getSQL();
  const projects = await sql`
    SELECT p.id, p.name, p.goal, p.status, p.created_at, p.updated_at,
      (SELECT COUNT(*) FROM chats WHERE project_id = p.id) as chat_count,
      pc.version as context_version,
      LENGTH(pc.compressed_text) as context_length
    FROM projects p
    LEFT JOIN LATERAL (
      SELECT version, compressed_text
      FROM project_context
      WHERE project_id = p.id
      ORDER BY version DESC
      LIMIT 1
    ) pc ON true
    WHERE p.status != 'archived'
    ORDER BY p.updated_at DESC
  `;
  return projects;
}

/**
 * Get full context for a project (latest version).
 */
export async function getProjectContext(projectId) {
  const sql = getSQL();
  const [project] = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) return null;

  const [ctx] = await sql`
    SELECT * FROM project_context
    WHERE project_id = ${projectId}
    ORDER BY version DESC
    LIMIT 1
  `;

  return {
    project,
    context: ctx
      ? {
          context_json: ctx.context_json,
          compressed_text: ctx.compressed_text,
          version: ctx.version,
          source: ctx.source,
          created_at: ctx.created_at,
        }
      : null,
  };
}

/**
 * Get context version history for a project.
 */
export async function getContextHistory(projectId) {
  const sql = getSQL();
  const versions = await sql`
    SELECT version, source, compressed_text, context_json, created_at
    FROM project_context
    WHERE project_id = ${projectId}
    ORDER BY version DESC
    LIMIT 20
  `;
  return versions;
}

/**
 * Regenerate compressed_text from context_json and project metadata.
 */
export function regenerateCompressedText(project, contextJson) {
  const lines = [];
  lines.push(`Project: ${project.name}`);
  if (project.goal) lines.push(`Goal: ${project.goal}`);
  lines.push(`Status: ${project.status}`);

  const decisions = contextJson.decisions || [];
  const discoveries = contextJson.discoveries || [];
  const constraints = contextJson.constraints || [];

  if (decisions.length > 0) {
    lines.push("");
    lines.push("## Decisions");
    for (const d of decisions) {
      const meta = [];
      if (d.source) meta.push(d.source);
      if (d.date) meta.push(d.date);
      const suffix = meta.length > 0 ? ` [${meta.join(", ")}]` : "";
      lines.push(`- ${d.text || d}${suffix}`);
    }
  }

  if (discoveries.length > 0) {
    lines.push("");
    lines.push("## Discoveries");
    for (const d of discoveries) {
      const meta = [];
      if (d.source) meta.push(d.source);
      if (d.date) meta.push(d.date);
      const suffix = meta.length > 0 ? ` [${meta.join(", ")}]` : "";
      lines.push(`- ${d.text || d}${suffix}`);
    }
  }

  if (constraints.length > 0) {
    lines.push("");
    lines.push("## Constraints");
    for (const c of constraints) {
      const meta = [];
      if (c.source) meta.push(c.source);
      if (c.date) meta.push(c.date);
      const suffix = meta.length > 0 ? ` [${meta.join(", ")}]` : "";
      lines.push(`- ${c.text || c}${suffix}`);
    }
  }

  return lines.join("\n");
}

/**
 * Append an item to a context_json array and create a new version.
 */
export async function appendContextItem(
  projectId,
  field,
  text,
  source = "nexus"
) {
  const sql = getSQL();

  const [project] = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) throw new Error(`Project ${projectId} not found`);

  const [current] = await sql`
    SELECT * FROM project_context
    WHERE project_id = ${projectId}
    ORDER BY version DESC
    LIMIT 1
  `;

  const contextJson = current?.context_json || {
    decisions: [],
    discoveries: [],
    constraints: [],
  };

  if (!Array.isArray(contextJson[field])) {
    contextJson[field] = [];
  }

  const date = new Date().toISOString().split("T")[0];
  contextJson[field].push({ text, source, date });

  const compressedText = regenerateCompressedText(project, contextJson);
  const nextVersion = (current?.version || 0) + 1;

  const [newCtx] = await sql`
    INSERT INTO project_context (project_id, context_json, compressed_text, version, source)
    VALUES (${projectId}, ${JSON.stringify(contextJson)}, ${compressedText}, ${nextVersion}, ${source})
    RETURNING *
  `;

  return newCtx;
}

/**
 * Replace the entire compressed_text (bulk update).
 */
export async function updateCompressedText(
  projectId,
  compressedText,
  source = "nexus"
) {
  const sql = getSQL();

  const [current] = await sql`
    SELECT * FROM project_context
    WHERE project_id = ${projectId}
    ORDER BY version DESC
    LIMIT 1
  `;

  const nextVersion = (current?.version || 0) + 1;
  const contextJson = current?.context_json || {
    decisions: [],
    discoveries: [],
    constraints: [],
  };

  const [newCtx] = await sql`
    INSERT INTO project_context (project_id, context_json, compressed_text, version, source)
    VALUES (${projectId}, ${JSON.stringify(contextJson)}, ${compressedText}, ${nextVersion}, ${source})
    RETURNING *
  `;

  return newCtx;
}
