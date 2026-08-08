import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/app/utils/supabaseAdmin";
import { signState } from "@/app/utils/crypto";
import { GMAIL_SCOPE, callbackUrl } from "@/app/utils/gmail";

/**
 * Start the "add another Gmail account" consent flow. The primary account still
 * comes from the Supabase Google login; this flow is separate so connecting a
 * second mailbox does not change who is signed in.
 *
 * Auth: Supabase JWT bearer. Returns { url } for the client to navigate to.
 */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID not configured" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(req),
    response_type: "code",
    scope: `${GMAIL_SCOPE} email`,
    access_type: "offline",
    // Force the account chooser + a fresh refresh token for the extra mailbox.
    prompt: "consent select_account",
    state: signState(user.id),
  });

  return NextResponse.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  });
}
