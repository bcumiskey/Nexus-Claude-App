import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getDefaultModel } from "@/lib/models";

export async function GET() {
  try {
    const chats = await query(`
      SELECT c.*, COUNT(m.id)::int AS message_count
      FROM chats c
      LEFT JOIN messages m ON m.chat_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `);
    return NextResponse.json(chats);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const title = body.title || "New Chat";
    const modelId = body.modelId || (await getDefaultModel());
    const projectId = body.projectId || null;

    const rows = await query(
      `INSERT INTO chats (title, model_id, project_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [title, modelId, projectId]
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
