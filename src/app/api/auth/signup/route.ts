import { createUser, isUniqueViolation, isValidEmail, normalizeEmail, passwordIsStrong, setSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; name?: unknown; password?: unknown };
    const email = normalizeEmail(body.email);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!isValidEmail(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    if (name.length < 2) return Response.json({ error: "Tell us your name." }, { status: 400 });
    if (!passwordIsStrong(password)) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    const user = await createUser({ email, name, password });
    await setSession(user.id);
    return Response.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, avatarColor: user.avatarColor } }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "An account with this email already exists." }, { status: 409 });
    console.error("signup failed", error);
    return Response.json({ error: "We couldn’t create your account right now." }, { status: 500 });
  }
}
