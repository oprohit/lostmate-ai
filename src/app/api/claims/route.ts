import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { claims, profiles, reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const rows = await db
    .select({ claim: claims, claimantName: profiles.name, claimantEmail: profiles.email, itemType: reports.itemType, reportType: reports.type, reportLocation: reports.location })
    .from(claims)
    .innerJoin(profiles, eq(claims.claimantId, profiles.id))
    .innerJoin(reports, eq(claims.reportId, reports.id))
    .where(user.role === "staff" || user.role === "admin" ? undefined : eq(claims.claimantId, user.id))
    .orderBy(desc(claims.createdAt))
    .limit(100);
  return Response.json({ claims: rows.map(({ claim, ...rest }) => ({ ...claim, ...rest })) });
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Sign in to submit a claim." }, { status: 401 });
    const body = (await request.json()) as { reportId?: unknown; matchId?: unknown; notes?: unknown };
    const reportId = typeof body.reportId === "string" ? body.reportId : "";
    if (!reportId) return Response.json({ error: "Choose an item to claim." }, { status: 400 });
    const [claim] = await db.insert(claims).values({ reportId, matchId: typeof body.matchId === "string" ? body.matchId : null, claimantId: user.id, notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : null }).returning();
    return Response.json({ claim }, { status: 201 });
  } catch (error) {
    console.error("claim create failed", error);
    return Response.json({ error: "We couldn’t submit that claim." }, { status: 500 });
  }
}
