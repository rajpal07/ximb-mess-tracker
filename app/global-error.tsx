"use client";

import { useEffect } from "react";
import { attemptChunkReload, isChunkLoadError } from "@/app/utils/chunkError";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A stale-deploy chunk failure recovers on its own with a single reload
    // to pick up the new chunk manifest.
    if (isChunkLoadError(error) && attemptChunkReload()) {
      return;
    }
  }, [error]);

  // global-error replaces the root layout, so it must render its own
  // <html>/<body>. It cannot rely on the app's providers or styles.
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        {isChunkLoadError(error) ? (
          <p>Loading the latest version&hellip;</p>
        ) : (
          <>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
              Something went wrong
            </h1>
            <p style={{ maxWidth: "28rem", color: "#666" }}>
              An unexpected error occurred. You can try again, and if it keeps
              happening, reloading the page usually helps.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => reset()}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #ccc",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                Reload page
              </button>
            </div>
          </>
        )}
      </body>
    </html>
  );
}
