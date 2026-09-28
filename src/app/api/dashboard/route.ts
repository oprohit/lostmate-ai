import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { claims, matches, reports, staffActions } from "@/db/schema";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function countWhere(table: typeof reports | typeof matches | typeof claims, condition?: ReturnType<typeof eq>) {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(table).where(condition);
  return Number(row?.count ?? 0);
}

export async function GET() {
  try {
    await requireStaff();
    const [lost, found, possibleMatches, claimed, activity] = await Promise.all([
      countWhere(reports, eq(reports.type, "lost")),
      countWhere(reports, eq(reports.type, "found")),
      countWhere(matches, eq(matches.status, "suggested")),
      countWhere(claims, eq(claims.status, "completed")),
      db.select().from(staffActions).orderBy(desc(staffActions.createdAt)).limit(10),
    ]);
    return Response.json({ stats: { lost, found, possibleMatches, claimed }, activity });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("dashboard failed", error);
    return Response.json({ error: "We couldn’t load the staff dashboard." }, { status: 500 });
  }
}
