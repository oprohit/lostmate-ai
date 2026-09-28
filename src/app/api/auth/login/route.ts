import { getUserByEmail, ensureDemoUser, isValidEmail, normalizeEmail, setSession, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!isValidEmail(email) || !password) return Response.json({ error: "Enter your email and password." }, { status: 400 });

    let user = await getUserByEmail(email);
    if (!user && email === "staff@lostmate.demo" && password === "demo-staff-2026") user = await ensureDemoUser(email, password, "staff");
    if (!user && email === "demo@lostmate.demo" && password === "demo-user-2026") user = await ensureDemoUser(email, password, "user");
    if (!user || !(await verifyPassword(password, user.passwordHash))) return Response.json({ error: "That email and password combination wasn’t found." }, { status: 401 });
    await setSession(user.id);
    return Response.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, avatarColor: user.avatarColor } });
  } catch (error) {
    console.error("login failed", error);
    return Response.json({ error: "We couldn’t sign you in right now." }, { status: 500 });
  }
}
