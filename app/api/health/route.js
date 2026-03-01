import { NextResponse } from "next/server";
import { healthCheck as dbHealth } from "@/lib/db";
import { apiHealthCheck } from "@/lib/anthropic";

export async function GET() {
  const [db, api] = await Promise.all([dbHealth(), apiHealthCheck()]);
  const ok = db.connected && api.connected && db.active_models > 0;

  return NextResponse.json(
    {
      status: ok ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: db,
        anthropicApi: api,
      },
      active_models: db.active_models || 0,
    },
    { status: ok ? 200 : 503 }
  );
}
