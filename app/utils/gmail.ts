// Gmail REST helpers (server only). Plain fetch — no googleapis dependency.

export const INVOICE_SENDERS = ["noreply@wepsol.com"];

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function gmailQuery(afterEpochSec?: number): string {
  const base = `from:(${INVOICE_SENDERS.join(" OR ")}) has:attachment filename:pdf`;
  return afterEpochSec ? `${base} after:${afterEpochSec}` : base;
}

/** Thrown when Google rejects the refresh token (user revoked access). */
export class GmailAuthError extends Error {}

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

async function accessTokenFor(refreshToken: string): Promise<string> {
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    if (body.error === "invalid_grant") {
      throw new GmailAuthError("Gmail access revoked — reconnect required");
    }
    throw new Error(`token refresh failed: ${body.error ?? res.status}`);
  }
  tokenCache.set(refreshToken, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });
  return body.access_token;
}

async function gmailGet(accessToken: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new GmailAuthError(`gmail api ${res.status}`);
  }
  if (!res.ok) throw new Error(`gmail api ${res.status} on ${path}`);
  return res.json();
}

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { attachmentId?: string };
  parts?: GmailPart[];
};

function flattenParts(payload: GmailPart | undefined): GmailPart[] {
  if (!payload) return [];
  const acc: GmailPart[] = [payload];
  for (const p of payload.parts ?? []) acc.push(...flattenParts(p));
  return acc;
}

/** Attachment filter per product rule: PDFs whose filename starts with "invoice". */
function isInvoicePdf(part: GmailPart): boolean {
  const name = (part.filename ?? "").toLowerCase();
  return name.startsWith("invoice") && name.endsWith(".pdf") && !!part.body?.attachmentId;
}

export interface FetchedInvoice {
  gmailMsgId: string;
  attachmentIndex: number;
  filename: string;
  pdf: Uint8Array;
}

function base64UrlToBytes(data: string): Uint8Array {
  return new Uint8Array(Buffer.from(data, "base64url"));
}

/**
 * List messages from the invoice senders and download `invoice*.pdf`
 * attachments. `afterEpochSec` narrows to messages newer than the last sync.
 */
export async function fetchInvoicePdfs(
  refreshToken: string,
  afterEpochSec?: number,
): Promise<FetchedInvoice[]> {
  const accessToken = await accessTokenFor(refreshToken);
  const q = encodeURIComponent(gmailQuery(afterEpochSec));

  const messageIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = (await gmailGet(
      accessToken,
      `messages?q=${q}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`,
    )) as { messages?: { id: string }[]; nextPageToken?: string };
    for (const m of page.messages ?? []) messageIds.push(m.id);
    pageToken = page.nextPageToken;
  } while (pageToken);

  const out: FetchedInvoice[] = [];

  // ponytail: chunked fan-out keeps us under Gmail's per-user rate quota
  const CHUNK = 10;
  for (let i = 0; i < messageIds.length; i += CHUNK) {
    const chunk = messageIds.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map(async (id) => {
        const msg = (await gmailGet(accessToken, `messages/${id}`)) as { payload?: GmailPart };
        const invoices: FetchedInvoice[] = [];
        const parts = flattenParts(msg.payload).filter(isInvoicePdf);
        for (let a = 0; a < parts.length; a++) {
          const part = parts[a];
          const att = (await gmailGet(
            accessToken,
            `messages/${id}/attachments/${part.body!.attachmentId}`,
          )) as { data?: string };
          if (!att.data) continue;
          invoices.push({
            gmailMsgId: id,
            attachmentIndex: a,
            filename: part.filename || `${id}.pdf`,
            pdf: base64UrlToBytes(att.data),
          });
        }
        return invoices;
      }),
    );
    for (const r of results) out.push(...r);
  }

  return out;
}
