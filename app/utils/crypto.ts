import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

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
