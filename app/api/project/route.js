import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let sql = `
      SELECT p.*,
        (SELECT COUNT(*) FROM chats WHERE project_id = p.id)::int AS chat_count
      FROM projects p
    `;
    const params = [];

    if (status) {
      sql += " WHERE p.status = $1";
      params.push(status);
    }

    sql += " ORDER BY p.updated_at DESC";

    const projects = await query(sql, params);
    return NextResponse.json(projects);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { name, goal, context } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const rows = await query(
      "INSERT INTO projects (name, goal) VALUES ($1, $2) RETURNING *",
      [name, goal || null]
    );
    const project = rows[0];

    // Create initial context version
    if (context) {
      await query(
        `INSERT INTO project_context (project_id, context_json, version)
         VALUES ($1, $2, 1)`,
        [project.id, JSON.stringify(context)]
      );
    }

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
