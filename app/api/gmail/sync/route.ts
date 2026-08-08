import { NextResponse } from "next/server";
import { createAdminClient, getUserFromRequest } from "@/app/utils/supabaseAdmin";
import {
  syncGmailForUser,
  TOKEN_COLUMNS,
  type GmailTokenRow,
  type PurchaseRow,
} from "@/app/utils/gmailSync";

export const maxDuration = 60;

/** Sync every Gmail account the signed-in user connected. Auth: Supabase JWT bearer. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("gmail_tokens")
    .select(TOKEN_COLUMNS)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ status: "not_connected", accounts: [] });
  }

  const fullResync = new URL(req.url).searchParams.get("full") === "1";

  let scanned = 0;
  const inserted: PurchaseRow[] = [];
  const errors: string[] = [];
  const accounts: { email: string; connected: boolean }[] = [];

  // One mailbox failing must not sink the others.
  for (const row of rows as GmailTokenRow[]) {
    try {
      const outcome = await syncGmailForUser(admin, row, fullResync);
      scanned += outcome.scanned;
      inserted.push(...outcome.inserted);
      errors.push(...outcome.errors.map((m) => `${row.email}: ${m}`));
      accounts.push({ email: row.email, connected: outcome.status === "ok" });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`gmail sync error for ${row.email}:`, detail);
      errors.push(`${row.email}: ${detail}`);
      accounts.push({ email: row.email, connected: true });
    }
  }

  return NextResponse.json({ status: "ok", scanned, inserted, errors, accounts });
}
