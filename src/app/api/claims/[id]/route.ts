import { eq } from "drizzle-orm";
import { db } from "@/db";
import { claims, reports, staffActions } from "@/db/schema";
import { requireStaff } from "@/lib/auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const staff = await requireStaff();
    const { id } = await context.params;
    const body = (await request.json()) as { status?: unknown; handoverLocation?: unknown; notes?: unknown };
    const status = ["pending", "approved", "completed", "rejected"].includes(String(body.status)) ? (body.status as "pending" | "approved" | "completed" | "rejected") : null;
    if (!status) return Response.json({ error: "Choose a valid claim status." }, { status: 400 });
    const [claim] = await db.update(claims).set({ status, handoverLocation: typeof body.handoverLocation === "string" ? body.handoverLocation.trim().slice(0, 160) : undefined, notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : undefined, updatedAt: new Date() }).where(eq(claims.id, id)).returning();
    if (!claim) return Response.json({ error: "Claim not found." }, { status: 404 });
    if (status === "completed") await db.update(reports).set({ status: "claimed", updatedAt: new Date() }).where(eq(reports.id, claim.reportId));
    const action = status === "completed" ? "completed_claim" : status === "rejected" ? "rejected_claim" : "created_claim";
    await db.insert(staffActions).values({ staffId: staff.id, claimId: claim.id, reportId: claim.reportId, action, note: typeof body.notes === "string" ? body.notes.trim().slice(0, 400) : null, metadata: { status, handoverLocation: claim.handoverLocation } });
    return Response.json({ claim });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("claim update failed", error);
    return Response.json({ error: "We couldn’t update that claim." }, { status: 500 });
  }
}
