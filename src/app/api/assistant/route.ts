import { assistantReply, classifyIntent, extractReport, missingFields, type ReportType } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: unknown; type?: unknown; context?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const context = typeof body.context === "string" ? body.context.trim() : "";
    if (!message) return Response.json({ error: "Tell me what happened first." }, { status: 400 });
    const combinedMessage = context ? `${context}. Additional detail: ${message}` : message;
    const intent = classifyIntent(combinedMessage);
    const type: ReportType = body.type === "found" || intent === "FOUND_REPORT" ? "found" : "lost";
    const shouldExtract = intent === "LOST_REPORT" || intent === "FOUND_REPORT" || Boolean(context);
    const extraction = shouldExtract ? await extractReport(combinedMessage, type) : undefined;
    const missing = extraction ? missingFields(extraction) : [];
    const user = await getCurrentUser();
    return Response.json({
      intent,
      extraction,
      missing,
      requiresConfirmation: shouldExtract && missing.length === 0,
      authenticated: Boolean(user),
      reply: assistantReply(intent, extraction, missing),
    });
  } catch (error) {
    console.error("assistant failed", error);
    return Response.json({ error: "AI is temporarily unavailable. You can still use the manual report form." }, { status: 503 });
  }
}
