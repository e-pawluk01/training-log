import { emailOf, isPerson, supabase } from "@/lib/person";

// Who + password → a Supabase session. The email is looked up here so it
// never has to ship in the page.
export async function POST(req: Request) {
  const { who, password } = await req.json().catch(() => ({}));
  const email = isPerson(who) ? emailOf(who) : undefined;
  if (!email || typeof password !== "string" || !password) return Response.json({ error: "Invalid login credentials" }, { status: 401 });
  const { data, error } = await supabase().auth.signInWithPassword({ email, password });
  if (error || !data.session) return Response.json({ error: error?.message || "Invalid login credentials" }, { status: 401 });
  const { access_token, refresh_token } = data.session;
  return Response.json({ access_token, refresh_token });
}
