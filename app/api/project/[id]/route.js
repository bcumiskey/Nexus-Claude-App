import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const projects = await query("SELECT * FROM projects WHERE id = $1", [id]);
    if (projects.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const context = await query(
      `SELECT * FROM project_context
       WHERE project_id = $1 ORDER BY version DESC LIMIT 1`,
      [id]
    );

    const chats = await query(
      "SELECT id, title, model_id, created_at FROM chats WHERE project_id = $1 ORDER BY updated_at DESC",
      [id]
    );

    return NextResponse.json({
      ...projects[0],
      context: context[0] || null,
      chats,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of ["name", "goal", "status"]) {
      if (body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(body[key]);
      }
    }

    if (fields.length === 0 && !body.context) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    if (fields.length > 0) {
      fields.push("updated_at = NOW()");
      values.push(id);
      const rows = await query(
        `UPDATE projects SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );
      if (rows.length === 0) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
    }

    // Update context if provided
    if (body.context) {
      const latest = await query(
        "SELECT version FROM project_context WHERE project_id = $1 ORDER BY version DESC LIMIT 1",
        [id]
      );
      const nextVersion = latest.length > 0 ? latest[0].version + 1 : 1;
      await query(
        `INSERT INTO project_context (project_id, context_json, version)
         VALUES ($1, $2, $3)`,
        [id, JSON.stringify(body.context), nextVersion]
      );
    }

    // Return updated project
    const updated = await query("SELECT * FROM projects WHERE id = $1", [id]);
    return NextResponse.json(updated[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const rows = await query("DELETE FROM projects WHERE id = $1 RETURNING id", [id]);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, id: rows[0].id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
