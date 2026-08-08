import { NextResponse } from "next/server";
import { createAdminClient, getUserFromRequest } from "@/app/utils/supabaseAdmin";

/** Remove one connected mailbox. Body: { email }. Auth: Supabase JWT bearer.
 *  Already-synced purchases are left alone. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : null;
  if (!email) {
    return NextResponse.json({ error: "missing email" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("gmail_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("email", email);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
