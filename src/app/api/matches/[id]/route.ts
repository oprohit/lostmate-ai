import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches, staffActions } from "@/db/schema";
import { requireStaff } from "@/lib/auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const staff = await requireStaff();
    const { id } = await context.params;
    const body = (await request.json()) as { status?: unknown; note?: unknown };
    const status = body.status === "accepted" || body.status === "rejected" ? body.status : null;
    if (!status) return Response.json({ error: "Choose accepted or rejected." }, { status: 400 });
    const [match] = await db.update(matches).set({ status, reviewedAt: new Date(), reviewedBy: staff.id }).where(eq(matches.id, id)).returning();
    if (!match) return Response.json({ error: "Match not found." }, { status: 404 });
    await db.insert(staffActions).values({ staffId: staff.id, matchId: match.id, reportId: match.lostReportId, action: "reviewed_match", note: typeof body.note === "string" ? body.note.trim().slice(0, 400) : null, metadata: { status } });
    return Response.json({ match });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("match review failed", error);
    return Response.json({ error: "We couldn’t update that match." }, { status: 500 });
  }
}
