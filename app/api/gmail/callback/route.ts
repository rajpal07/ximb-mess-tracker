import { NextResponse } from "next/server";
import { createAdminClient } from "@/app/utils/supabaseAdmin";
import { encrypt, verifyState } from "@/app/utils/crypto";
import { callbackUrl } from "@/app/utils/gmail";

/** Email claim out of Google's id_token. Signed by Google and delivered over
 *  TLS straight from the token endpoint, so the payload is read as-is. */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

function back(req: Request, status: string) {
  return NextResponse.redirect(`${new URL(req.url).origin}/?gmail=${status}`);
}

/** Google redirects here after the user approves an extra Gmail account. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code || !state) return back(req, "cancelled");

  const userId = verifyState(state);
  if (!userId) return back(req, "expired");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl(req),
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.refresh_token) {
    console.error("gmail connect failed:", body.error ?? res.status);
    return back(req, "failed");
  }

  const email = emailFromIdToken(body.id_token);
  if (!email) return back(req, "failed");

  const { error } = await createAdminClient().from("gmail_tokens").upsert({
    user_id: userId,
    email,
    refresh_token: encrypt(body.refresh_token),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("gmail connect upsert failed:", error.message);
    return back(req, "failed");
  }

  return back(req, "added");
}
