import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

// AES-256-GCM for Gmail refresh tokens at rest.
// GMAIL_TOKEN_KEY = 64 hex chars (32 bytes). Generate: `openssl rand -hex 32`
// or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

function key(): Buffer {
  const hex = process.env.GMAIL_TOKEN_KEY ?? "";
  if (hex.length !== 64) {
    throw new Error("GMAIL_TOKEN_KEY must be 64 hex chars (openssl rand -hex 32)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, ct] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// OAuth `state` for the extra-Gmail-account flow: the user id has to survive a
// round trip through Google, so it is HMAC-signed and short-lived.
const STATE_TTL_MS = 10 * 60_000;

function mac(body: string): string {
  return createHmac("sha256", key()).update(body).digest("base64url");
}

export function signState(userId: string): string {
  const body = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + STATE_TTL_MS })).toString(
    "base64url",
  );
  return `${body}.${mac(body)}`;
}

/** Returns the user id, or null if the state is forged, malformed, or expired. */
export function verifyState(state: string): string | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof u === "string" && typeof e === "number" && e > Date.now() ? u : null;
  } catch {
    return null;
  }
}
