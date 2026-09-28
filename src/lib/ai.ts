export type ReportType = "lost" | "found";
export type Intent = "GREETING" | "CASUAL_CHAT" | "LOST_REPORT" | "FOUND_REPORT" | "SEARCH" | "MATCH_QUERY" | "OTHER";

export type Extraction = {
  itemType: string;
  category: string;
  brand: string;
  color: string;
  description: string;
  location: string;
  occurredAt: string;
  distinguishingFeatures: string;
};

export type ExtractionResult = Extraction & { provider: "gemini" | "fallback"; confidence: number };

const EMPTY_EXTRACTION: Extraction = {
  itemType: "",
  category: "",
  brand: "",
  color: "",
  description: "",
  location: "",
  occurredAt: "",
  distinguishingFeatures: "",
};

const itemPatterns: Array<[RegExp, string, string]> = [
  [/airpods?(?:\s+(?:pro|max)\s*\d*)?/i, "AirPods", "Electronics"],
  [/(?:iphone|ipad|macbook|android phone|phone|smartphone)/i, "iPhone", "Electronics"],
  [/(?:laptop|tablet)/i, "Laptop", "Electronics"],
  [/(?:wallet|purse)/i, "Wallet", "Personal items"],
  [/(?:backpack|bag|tote)/i, "Backpack", "Bags"],
  [/(?:keys?|keyring)/i, "Keys", "Personal items"],
  [/(?:student id|id card|badge|license)/i, "ID card", "Documents"],
  [/(?:water bottle|bottle|thermos)/i, "Water bottle", "Drinkware"],
  [/(?:jacket|hoodie|coat)/i, "Jacket", "Clothing"],
  [/(?:umbrella)/i, "Umbrella", "Personal items"],
  [/(?:watch|smartwatch)/i, "Watch", "Accessories"],
  [/(?:headphones|earbuds)/i, "Headphones", "Electronics"],
];

const colorPattern = /\b(black|white|silver|gray|grey|blue|navy|red|green|yellow|pink|purple|brown|beige|orange)\b/i;
const brandPattern = /\b(apple|samsung|google|sony|nike|adidas|coach|north face|michael kors|anker|jbl)\b/i;
const locationPattern = /\b(?:near|at|by|outside|inside|in front of|behind|around)\s+(?:the\s+)?([a-z0-9][a-z0-9 &'\/-]{2,60})/i;

function clean(value: unknown, maxLength = 280) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function itemMatch(message: string) {
  return itemPatterns.find(([pattern]) => pattern.test(message));
}

export function classifyIntent(message: string): Intent {
  const text = message.trim().toLowerCase();
  if (!text) return "OTHER";
  if (/^(hi|hello|hey|yo|good morning|good afternoon|good evening|thanks|thank you)\b/.test(text) && text.length < 80) return "GREETING";
  if (/(?:possible matches|match(es)?|anything found|search (?:for|my)|look for)/i.test(text)) return "MATCH_QUERY";
  if (/(?:where are|show|browse|list|find)\s+(?:the\s+)?(?:lost|found)\s+(?:items?|reports?)/i.test(text)) return "SEARCH";
  const item = itemMatch(text);
  const found = /\b(found|picked up|turned in|came across|discovered)\b/i.test(text);
  const lost = /\b(lost|missing|misplaced|can't find|cannot find|left behind|disappeared)\b/i.test(text);
  if (found && item) return "FOUND_REPORT";
  if (lost && item) return "LOST_REPORT";
  if (/\b(lost|missing|found)\b/i.test(text)) return "CASUAL_CHAT";
  return "CASUAL_CHAT";
}

function fallbackExtraction(message: string, type: ReportType): ExtractionResult {
  const matched = itemMatch(message);
  const color = message.match(colorPattern)?.[1] ?? "";
  const brand = message.match(brandPattern)?.[1] ?? "";
  const locationMatch = message.match(locationPattern);
  const location = locationMatch?.[1]?.replace(/[.,!?]+$/, "").trim() ?? "";
  const itemType = matched?.[1] ?? "";
  const category = matched?.[2] ?? "";
  const distinguishingFeatures = [color, brand].filter(Boolean).join(" ");
  const occurredAt = /\b(?:today|yesterday|this morning|this afternoon|this evening|last night)(?:\s+(?:around|at)\s+\d{1,2}(?::\d{2})?\s?(?:am|pm))?|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i.exec(message)?.[0] ?? "";
  const description = clean(message);
  return {
    ...EMPTY_EXTRACTION,
    itemType: itemType || (type === "found" ? "Found item" : ""),
    category,
    brand,
    color,
    description,
    location,
    occurredAt,
    distinguishingFeatures,
    provider: "fallback",
    confidence: itemType && location ? 0.72 : 0.42,
  };
}

function parseLooseJson(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sanitizeExtraction(value: Record<string, unknown>, original: string, type: ReportType): Extraction {
  const fallback = fallbackExtraction(original, type);
  const itemType = clean(value.item_type ?? value.itemType) || fallback.itemType;
  const category = clean(value.category) || fallback.category;
  const location = clean(value.location) || fallback.location;
  return {
    itemType,
    category,
    brand: clean(value.brand) || fallback.brand,
    color: clean(value.color) || fallback.color,
    description: clean(value.description, 500) || fallback.description,
    location,
    occurredAt: clean(value.date_time ?? value.occurred_at ?? value.occurredAt) || fallback.occurredAt,
    distinguishingFeatures: clean(value.distinguishing_features ?? value.distinguishingFeatures) || fallback.distinguishingFeatures,
  };
}

async function geminiExtraction(message: string, type: ReportType) {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
  const prompt = `You are LostMate AI, extracting a ${type} item report. Return JSON only with these string fields: item_type, category, brand, color, description, location, date_time, distinguishing_features. Never invent missing details; use empty strings. The location can be a campus landmark. User message: ${message}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? parseLooseJson(text) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractReport(message: string, type: ReportType): Promise<ExtractionResult> {
  const fallback = fallbackExtraction(message, type);
  const gemini = await geminiExtraction(message, type);
  if (!gemini) return fallback;
  const sanitized = sanitizeExtraction(gemini, message, type);
  return { ...sanitized, provider: "gemini", confidence: 0.9 };
}

export function missingFields(extraction: Extraction) {
  return ([
    ["itemType", "what item is it"],
    ["category", "the item category"],
    ["location", "where it was lost or found"],
    ["occurredAt", "approximately when it happened"],
  ] as const)
    .filter(([key]) => !extraction[key])
    .map(([, label]) => label);
}

export function assistantReply(intent: Intent, extraction?: ExtractionResult, missing?: string[]) {
  if (intent === "GREETING") return "Hi, I’m here to help reunite items with their owners. Tell me what you lost or found, and where.";
  if (intent === "CASUAL_CHAT" || intent === "OTHER") return "I can help with a lost or found item. Try “I lost my black wallet near the library” or “I found an iPhone by the cafeteria.”";
  if (intent === "SEARCH" || intent === "MATCH_QUERY") return "I can search your active reports once you’re signed in. You can also describe the item you’re looking for here.";
  if (missing?.length) return `I can help with that. What is ${missing.slice(0, 2).join(" and ")}?`;
  if (extraction) return `I found the key details for a ${extraction.itemType}${extraction.location ? ` near ${extraction.location}` : ""}. Review the summary below, then confirm when it looks right.`;
  return "Tell me a little more about the item so I can prepare the report.";
}
