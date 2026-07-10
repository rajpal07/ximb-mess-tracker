// Helpers for recovering from stale-deploy chunk failures.
//
// When a new build ships, Next.js/turbopack rotates the hashed chunk
// filenames. A client still holding cached HTML that points at the old
// chunk fails to fetch it, surfacing as a `ChunkLoadError` (or a failed
// dynamic import). A single reload picks up the new chunk manifest and
// recovers, so we detect these errors in the error boundaries and reload
// once rather than letting the exception bubble up uncaught.

// Guards against a reload loop if the error is *not* actually caused by a
// stale deploy (e.g. the chunk is genuinely broken). We only auto-reload
// once within this window; after that we fall back to the error UI.
const RELOAD_WINDOW_MS = 10_000;
const RELOAD_FLAG_KEY = "chunk-error-reloaded-at";

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  const err = error as { name?: string; message?: string };
  const name = err.name ?? "";
  const message = err.message ?? "";

  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to load chunk/i.test(message) ||
    // Native ESM dynamic-import failures (thrown by the browser).
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message)
  );
}

// Attempts a one-time reload to recover from a stale chunk manifest.
// Returns true if a reload was triggered, false if we already reloaded
// recently (so the caller should show the fallback UI instead of looping).
export function attemptChunkReload(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_FLAG_KEY));
    if (last && Date.now() - last < RELOAD_WINDOW_MS) {
      return false;
    }
    window.sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  } catch {
    // sessionStorage can throw (private mode / disabled). Fall back to a
    // best-effort single reload guarded by an in-memory flag.
    if (reloadedThisSession) return false;
    reloadedThisSession = true;
  }

  window.location.reload();
  return true;
}

let reloadedThisSession = false;
