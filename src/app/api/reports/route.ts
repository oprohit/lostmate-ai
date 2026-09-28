import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { profiles, reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createMatchesForReport } from "@/lib/matching";

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim().toLowerCase();
  const now = new Date();
  const relativeDay = raw.includes("yesterday") ? -1 : 0;
  const timeMatch = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (raw.includes("today") || raw.includes("yesterday") || timeMatch) {
    now.setDate(now.getDate() + relativeDay);
    if (timeMatch) {
      let hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2] ?? 0);
      if (timeMatch[3] === "pm" && hour < 12) hour += 12;
      if (timeMatch[3] === "am" && hour === 12) hour = 0;
      now.setHours(hour, minute, 0, 0);
    }
    return now;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const query = text(url.searchParams.get("q"), 80);
  const filters = [];
  if (type === "lost" || type === "found") filters.push(eq(reports.type, type));
  if (query) filters.push(ilike(reports.itemType, `%${query}%`));
  if (user.role !== "staff" && user.role !== "admin") filters.push(eq(reports.reporterId, user.id));
  const rows = await db
    .select({ report: reports, reporterName: profiles.name, reporterEmail: profiles.email })
    .from(reports)
    .innerJoin(profiles, eq(reports.reporterId, profiles.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(user.role === "staff" || user.role === "admin" ? 250 : 50);
  return Response.json({ reports: rows.map(({ report, reporterName, reporterEmail }) => ({ ...report, reporterName, reporterEmail })) });
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Sign in before submitting a report." }, { status: 401 });
    const body = (await request.json()) as Record<string, unknown>;
    if (body.confirmed !== true) return Response.json({ error: "Please confirm the report details before submitting." }, { status: 400 });
    const type = body.type === "found" ? "found" : body.type === "lost" ? "lost" : null;
    if (!type) return Response.json({ error: "Choose whether this item was lost or found." }, { status: 400 });
    const itemType = text(body.itemType, 100);
    const category = text(body.category, 80);
    const description = text(body.description, 600);
    const location = text(body.location, 160);
    if (!itemType || !category || !description || !location) return Response.json({ error: "Item, category, description, and location are required." }, { status: 400 });
    const [report] = await db
      .insert(reports)
      .values({
        reporterId: user.id,
        type,
        itemType,
        category,
        brand: text(body.brand, 80) || null,
        color: text(body.color, 50) || null,
        description,
        distinguishingFeatures: text(body.distinguishingFeatures, 240) || null,
        location,
        occurredAt: parseDate(body.occurredAt),
        holdingLocation: type === "found" ? text(body.holdingLocation, 160) || null : null,
        imageUrl: text(body.imageUrl, 1000) || null,
        sourceText: text(body.sourceText, 800) || null,
        aiExtracted: body.aiExtracted === true,
        aiMetadata: body.aiMetadata && typeof body.aiMetadata === "object" ? body.aiMetadata : null,
      })
      .returning();
    const generatedMatches = await createMatchesForReport(report);
    return Response.json({ report, matches: generatedMatches.map(({ candidate, score }) => ({ candidate, ...score })) }, { status: 201 });
  } catch (error) {
    console.error("report create failed", error);
    return Response.json({ error: "We couldn’t save that report. Please try again." }, { status: 500 });
  }
}
