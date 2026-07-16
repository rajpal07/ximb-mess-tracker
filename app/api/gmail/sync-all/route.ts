import { NextResponse } from "next/server";
import { createAdminClient } from "@/app/utils/supabaseAdmin";
import { syncGmailForUser, type GmailTokenRow } from "@/app/utils/gmailSync";

export const maxDuration = 60;

/**
 * Background sync for every connected user. Hit by Vercel Cron (which sends
 * `Authorization: Bearer $CRON_SECRET` automatically when the env var is set).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("gmail_tokens")
    .select("user_id, refresh_token, last_synced_at, backfill_done");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let inserted = 0;
  let errors = 0;
  for (const row of rows ?? []) {
    try {
      const outcome = await syncGmailForUser(admin, row as GmailTokenRow);
      inserted += outcome.inserted.length;
      errors += outcome.errors.length;
    } catch (e) {
      errors++;
      console.error(`gmail sync-all failed for ${row.user_id}:`, e);
    }
  }

  return NextResponse.json({ users: rows?.length ?? 0, inserted, errors });
}
