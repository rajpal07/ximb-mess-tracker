import { NextResponse } from "next/server";
import { createAdminClient, getUserFromRequest } from "@/app/utils/supabaseAdmin";
import { syncGmailForUser, type GmailTokenRow } from "@/app/utils/gmailSync";

export const maxDuration = 60;

/** Sync the signed-in user's Gmail invoices. Auth: Supabase JWT bearer. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("gmail_tokens")
    .select("user_id, refresh_token, last_synced_at, backfill_done")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ status: "not_connected" });
  }

  try {
    const url = new URL(req.url);
    const fullResync = url.searchParams.get("full") === "1";
    const outcome = await syncGmailForUser(admin, row as GmailTokenRow, fullResync);
    return NextResponse.json(outcome);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("gmail sync error:", detail);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
