import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const chats = await query("SELECT * FROM chats WHERE id = $1", [id]);
    if (chats.length === 0) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const messages = await query(
      "SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at",
      [id]
    );
    return NextResponse.json({ ...chats[0], messages });
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

    if (body.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(body.title);
    }
    if (body.model_id !== undefined) {
      fields.push(`model_id = $${idx++}`);
      values.push(body.model_id);
    }
    if (body.project_id !== undefined) {
      fields.push(`project_id = $${idx++}`);
      values.push(body.project_id);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const rows = await query(
      `UPDATE chats SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const rows = await query("DELETE FROM chats WHERE id = $1 RETURNING id", [id]);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, id: rows[0].id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
