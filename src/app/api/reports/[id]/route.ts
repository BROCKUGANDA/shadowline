import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

/** DELETE /api/reports/[id] — remove a saved scouting report. */
export const DELETE = withApi<{ params: Promise<{ id: string }> }>(
  { route: "reports", bucket: "write" },
  async (_request, context) => {
    const { id } = await context.params;
    const existing = await db.scoutingReport.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: `report ${id} not found` },
        { status: 404 }
      );
    }
    await db.scoutingReport.delete({ where: { id } });
    return NextResponse.json({ deleted: id });
  }
);
