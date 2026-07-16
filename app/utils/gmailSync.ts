import { fetchInvoicePdfs, GmailAuthError } from "./gmail";
import { parseInvoicePdf } from "./invoiceParser";
import { decrypt } from "./crypto";
import type { createAdminClient } from "./supabaseAdmin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type GmailTokenRow = {
  user_id: string;
  refresh_token: string;
  last_synced_at: string | null;
  backfill_done: boolean;
};

export type PurchaseRow = {
  id: string;
  user_id: string;
  date: string;
  item: string;
  source_file: string;
  total: number;
};

export type SyncOutcome = {
  status: "ok" | "not_connected";
  scanned: number;
  inserted: PurchaseRow[];
  errors: string[];
};

// Re-scan a 1h overlap window so a message landing mid-sync is never missed;
// deterministic ids make the re-processing idempotent.
const OVERLAP_SEC = 3600;

/**
 * Core sync for one user: Gmail → invoice*.pdf attachments → parse → upsert
 * purchases. First run backfills the entire history; later runs are
 * incremental from the last-sync watermark.
 */
export async function syncGmailForUser(
  admin: AdminClient,
  row: GmailTokenRow,
  fullResync = false,
): Promise<SyncOutcome> {
  // fullResync ignores the watermark so deleted purchases are re-inserted.
  const afterEpochSec =
    !fullResync && row.backfill_done && row.last_synced_at
      ? Math.floor(new Date(row.last_synced_at).getTime() / 1000) - OVERLAP_SEC
      : undefined;

  let invoices;
  try {
    invoices = await fetchInvoicePdfs(decrypt(row.refresh_token), afterEpochSec);
  } catch (e) {
    if (e instanceof GmailAuthError) {
      // Token revoked — drop it so the UI shows "connect" again.
      await admin.from("gmail_tokens").delete().eq("user_id", row.user_id);
      return { status: "not_connected", scanned: 0, inserted: [], errors: [e.message] };
    }
    throw e;
  }

  const rows: PurchaseRow[] = [];
  const errors: string[] = [];

  for (const inv of invoices) {
    try {
      const items = await parseInvoicePdf(inv.pdf, inv.filename);
      items.forEach((item, i) => {
        rows.push({
          id: `gm-${row.user_id}-${inv.gmailMsgId}-${inv.attachmentIndex}-${i}`,
          user_id: row.user_id,
          date: item.date,
          item: item.item,
          source_file: inv.filename,
          total: item.total,
        });
      });
    } catch (e) {
      errors.push(`${inv.filename}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let inserted: PurchaseRow[] = [];
  if (rows.length > 0) {
    // Figure out which ids are actually new so the client can notify.
    // Chunked: .in() encodes ids in the URL, and a full backfill has hundreds.
    const existingIds = new Set<string>();
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data: existing } = await admin
        .from("purchases")
        .select("id")
        .in("id", ids.slice(i, i + 100));
      for (const r of existing ?? []) existingIds.add(r.id);
    }
    inserted = rows.filter((r) => !existingIds.has(r.id));

    const { error } = await admin.from("purchases").upsert(rows);
    if (error) {
      errors.push(error.message);
      inserted = [];
    }
  }

  await admin
    .from("gmail_tokens")
    .update({ last_synced_at: new Date().toISOString(), backfill_done: true })
    .eq("user_id", row.user_id);

  return { status: "ok", scanned: invoices.length, inserted, errors };
}
