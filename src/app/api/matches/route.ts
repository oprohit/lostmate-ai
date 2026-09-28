import { desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { matches, reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const all = user.role === "staff" || user.role === "admin";
  let rows = await db.select().from(matches).orderBy(desc(matches.confidence), desc(matches.createdAt)).limit(all ? 150 : 50);
  if (!all) {
    const mine = await db.select({ id: reports.id }).from(reports).where(eq(reports.reporterId, user.id));
    const ids = mine.map((report) => report.id);
    rows = ids.length ? await db.select().from(matches).where(or(inArray(matches.lostReportId, ids), inArray(matches.foundReportId, ids))).orderBy(desc(matches.confidence), desc(matches.createdAt)).limit(50) : [];
  }
  const reportIds = [...new Set(rows.flatMap((match) => [match.lostReportId, match.foundReportId]))];
  const related = reportIds.length ? await db.select().from(reports).where(inArray(reports.id, reportIds)) : [];
  const reportMap = new Map(related.map((report) => [report.id, report]));
  return Response.json({ matches: rows.map((match) => ({ ...match, lostReport: reportMap.get(match.lostReportId), foundReport: reportMap.get(match.foundReportId) })) });
}
