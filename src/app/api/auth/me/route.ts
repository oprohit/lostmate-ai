import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return Response.json({ user });
  } catch (error) {
    console.error("session lookup failed", error);
    return Response.json({ user: null }, { status: 500 });
  }
}
