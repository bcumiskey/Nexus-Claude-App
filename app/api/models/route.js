import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const models = await query(
      "SELECT * FROM models WHERE is_active = true ORDER BY sort_order"
    );
    return NextResponse.json(models);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { id, label, tier, input_price, output_price, max_output, context_window,
      supports_thinking, supports_adaptive, supports_fast, supports_vision,
      supports_1m_ctx, is_default, is_enhancement, is_active, sort_order, notes } = body;

    if (!id || !label) {
      return NextResponse.json({ error: "id and label are required" }, { status: 400 });
    }

    await query(
      `INSERT INTO models (id, label, tier, input_price, output_price, max_output, context_window,
        supports_thinking, supports_adaptive, supports_fast, supports_vision, supports_1m_ctx,
        is_default, is_enhancement, is_active, sort_order, notes, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
       ON CONFLICT (id) DO UPDATE SET
        label=$2, tier=$3, input_price=$4, output_price=$5, max_output=$6, context_window=$7,
        supports_thinking=$8, supports_adaptive=$9, supports_fast=$10, supports_vision=$11,
        supports_1m_ctx=$12, is_default=$13, is_enhancement=$14, is_active=$15,
        sort_order=$16, notes=$17, updated_at=NOW()`,
      [id, label, tier || "standard", input_price || 3, output_price || 15,
        max_output || 64000, context_window || 200000,
        supports_thinking ?? false, supports_adaptive ?? false,
        supports_fast ?? false, supports_vision ?? true, supports_1m_ctx ?? false,
        is_default ?? false, is_enhancement ?? false, is_active ?? true,
        sort_order || 0, notes || null]
    );

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
