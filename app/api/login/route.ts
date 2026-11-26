import { isPerson, passwordOk, signInCookie, signOutCookie } from "@/lib/person";

// Who + password → a signed cookie.
export async function POST(req: Request) {
  const { who, password } = await req.json().catch(() => ({}));
  if (!isPerson(who) || typeof password !== "string" || !passwordOk(who, password)) {
    await new Promise((r) => setTimeout(r, 600));   // slow down guessing
    return Response.json({ error: "Invalid login credentials" }, { status: 401 });
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": signInCookie(who) } });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": signOutCookie() } });
}
