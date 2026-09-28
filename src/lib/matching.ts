import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { matches, reports, type Report } from "@/db/schema";

const stopWords = new Set(["the", "and", "with", "near", "found", "lost", "item", "this", "that", "was", "from", "around", "my"]);

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function words(value: string | null | undefined) {
  return new Set(normalize(value).split(" ").filter((word) => word.length > 2 && !stopWords.has(word)));
}

function overlap(left: string | null | undefined, right: string | null | undefined) {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((word) => {
    if (b.has(word)) shared += 1;
  });
  return shared / Math.max(a.size, b.size);
}

function sameValue(left: string | null | undefined, right: string | null | undefined) {
  const a = normalize(left);
  const b = normalize(right);
  return a && b && (a === b || a.includes(b) || b.includes(a));
}

function itemFamily(value: string | null | undefined) {
  const normalized = normalize(value);
  if (/iphone|ipad|phone|laptop|tablet|airpods|headphone|earbud|watch/.test(normalized)) return "electronics";
  if (/wallet|key|id card|badge|license|purse/.test(normalized)) return "personal";
  if (/backpack|bag|tote/.test(normalized)) return "bag";
  if (/bottle|thermos/.test(normalized)) return "drinkware";
  if (/jacket|hoodie|coat/.test(normalized)) return "clothing";
  return normalized;
}

function proximity(left: Date | null, right: Date | null) {
  if (!left || !right) return 0.5;
  const hours = Math.abs(left.getTime() - right.getTime()) / 3_600_000;
  if (hours <= 6) return 1;
  if (hours <= 24) return 0.8;
  if (hours <= 72) return 0.55;
  return 0.2;
}

export type MatchScore = {
  confidence: number;
  explanation: string;
  signals: Record<string, number>;
};

export function scoreReports(lost: Report, found: Report): MatchScore {
  const lostFamily = itemFamily(lost.itemType);
  const foundFamily = itemFamily(found.itemType);
  const familyCompatible = lostFamily === foundFamily || lostFamily === normalize(lost.category) || foundFamily === normalize(found.category);
  const category = sameValue(lost.category, found.category) ? 1 : overlap(lost.category, found.category);
  const item = sameValue(lost.itemType, found.itemType) ? 1 : overlap(lost.itemType, found.itemType);
  const brand = lost.brand && found.brand ? (sameValue(lost.brand, found.brand) ? 1 : 0) : 0.45;
  const color = lost.color && found.color ? (sameValue(lost.color, found.color) ? 1 : 0) : 0.45;
  const location = sameValue(lost.location, found.location) ? 1 : overlap(lost.location, found.location);
  const time = proximity(lost.occurredAt, found.occurredAt ?? found.createdAt);
  const text = overlap(`${lost.description} ${lost.distinguishingFeatures}`, `${found.description} ${found.distinguishingFeatures}`);
  const signals = { item, category, brand, color, location, time, text };
  const weighted = item * 0.28 + category * 0.2 + brand * 0.12 + color * 0.1 + location * 0.14 + time * 0.08 + text * 0.08;
  const confidence = Math.round(Math.max(0.04, Math.min(familyCompatible ? 0.97 : 0.22, familyCompatible ? weighted : weighted * 0.22)) * 100);

  const reasons: string[] = [];
  if (item >= 0.8) reasons.push("same item type");
  if (category >= 0.8) reasons.push("same category");
  if (brand >= 0.8) reasons.push("matching brand");
  if (color >= 0.8) reasons.push("matching color");
  if (location >= 0.8) reasons.push("nearby location");
  if (time >= 0.8) reasons.push("compatible time window");
  if (!familyCompatible) reasons.push("item types look unrelated");
  const explanation = reasons.length
    ? `${reasons.slice(0, 4).join(", ")}${reasons.length > 4 ? ", and more" : ""}.`
    : "Some description details overlap, but staff verification is needed.";
  return { confidence, explanation, signals };
}

export async function createMatchesForReport(report: Report) {
  const opposite = report.type === "lost" ? "found" : "lost";
  const candidates = await db.select().from(reports).where(and(eq(reports.type, opposite), eq(reports.status, "open"))).limit(150);
  const scored = candidates
    .map((candidate) => ({ candidate, score: report.type === "lost" ? scoreReports(report, candidate) : scoreReports(candidate, report) }))
    .filter(({ score }) => score.confidence >= 18)
    .sort((a, b) => b.score.confidence - a.score.confidence)
    .slice(0, 6);

  for (const { candidate, score } of scored) {
    const lostReportId = report.type === "lost" ? report.id : candidate.id;
    const foundReportId = report.type === "found" ? report.id : candidate.id;
    await db
      .insert(matches)
      .values({
        lostReportId,
        foundReportId,
        confidence: score.confidence / 100,
        explanation: score.explanation,
        signals: score.signals,
      })
      .onConflictDoNothing();
  }
  return scored;
}

export async function getMatchesForUser(userId: string) {
  const userReports = await db.select({ id: reports.id }).from(reports).where(eq(reports.reporterId, userId));
  if (!userReports.length) return [];
  const ids = userReports.map((report) => report.id);
  const lost = await db.select({ id: reports.id }).from(reports).where(and(eq(reports.type, "lost"), inArray(reports.id, ids)));
  const found = await db.select({ id: reports.id }).from(reports).where(and(eq(reports.type, "found"), inArray(reports.id, ids)));
  const filters = [...lost, ...found].map((report) => report.id);
  if (!filters.length) return [];
  return db.select().from(matches).where(or(inArray(matches.lostReportId, filters), inArray(matches.foundReportId, filters)));
}
