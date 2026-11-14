import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import type { ScoutingReport } from "@prisma/client";
import { withApi } from "@/lib/with-api";

export const dynamic = "force-dynamic";

const ReportInput = z.object({
  title: z.string().trim().min(1, "title is required").max(140),
  playerNflId: z.string().trim().max(32).nullable().default(null),
  sections: z.record(z.string().max(40), z.boolean()),
  templateVersion: z.string().trim().max(20).default("1.0"),
});

type ReportRow = Pick<
  ScoutingReport,
  "id" | "title" | "playerNflId" | "sections" | "templateVersion" | "createdAt"
>;

/** GET /api/reports — list saved scouting reports (newest first). */
export const GET = withApi({ route: "reports" }, async () => {
  const reports: ReportRow[] = await db.scoutingReport.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      playerNflId: true,
      sections: true,
      templateVersion: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ reports });
});

/** POST /api/reports — save a user-authored scouting report. */
export const POST = withApi({ route: "reports", bucket: "write" }, async (request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = ReportInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid report payload", detail: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const { title, playerNflId, sections, templateVersion } = parsed.data;
  const created: ReportRow = await db.scoutingReport.create({
    data: {
      title,
      playerNflId: playerNflId && playerNflId.length > 0 ? playerNflId : null,
      sections,
      templateVersion,
    },
    select: {
      id: true,
      title: true,
      playerNflId: true,
      sections: true,
      templateVersion: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ report: created }, { status: 201 });
});
