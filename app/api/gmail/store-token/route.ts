import { NextResponse } from "next/server";
import { createAdminClient, getUserFromRequest } from "@/app/utils/supabaseAdmin";
import { encrypt } from "@/app/utils/crypto";

/**
 * Persist the Google refresh token Supabase hands back right after OAuth.
 * Body: { refresh_token: string }. Auth: Supabase JWT bearer.
 */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const refreshToken = body?.refresh_token;
  if (typeof refreshToken !== "string" || refreshToken.length < 10) {
    return NextResponse.json({ error: "missing refresh_token" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("gmail_tokens").upsert({
    user_id: user.id,
    refresh_token: encrypt(refreshToken),
    email: user.email ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
