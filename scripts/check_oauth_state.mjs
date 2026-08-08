// Self-check for the add-another-Gmail OAuth state signing.
// Run: node --experimental-strip-types scripts/check_oauth_state.mjs
import assert from "node:assert/strict";

process.env.GMAIL_TOKEN_KEY = "a".repeat(64);
const { signState, verifyState } = await import("../app/utils/crypto.ts");

const uid = "11111111-2222-3333-4444-555555555555";
const state = signState(uid);

assert.equal(verifyState(state), uid, "round trip must return the user id");

// Tampered payload (attacker swaps in their own user id) must be rejected.
const [body, sig] = state.split(".");
const forgedBody = Buffer.from(JSON.stringify({ u: "evil", e: Date.now() + 60000 })).toString(
  "base64url",
);
assert.equal(verifyState(`${forgedBody}.${sig}`), null, "forged body must fail");
assert.equal(verifyState(`${body}.${"x".repeat(sig.length)}`), null, "bad signature must fail");
assert.equal(verifyState("garbage"), null, "malformed state must fail");

// Expired state must be rejected even though the signature is valid.
const expiredBody = Buffer.from(JSON.stringify({ u: uid, e: Date.now() - 1 })).toString("base64url");
const { createHmac } = await import("node:crypto");
const expiredSig = createHmac("sha256", Buffer.from(process.env.GMAIL_TOKEN_KEY, "hex"))
  .update(expiredBody)
  .digest("base64url");
assert.equal(verifyState(`${expiredBody}.${expiredSig}`), null, "expired state must fail");

console.log("oauth state checks passed");
