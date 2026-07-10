"use client";

import { useEffect } from "react";
import { Button } from "@heroui/react";
import { attemptChunkReload, isChunkLoadError } from "@/app/utils/chunkError";

export default function Error({
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

  // While the reload is in flight, avoid flashing the error UI.
  if (isChunkLoadError(error)) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-foreground-500 max-w-md">
        An unexpected error occurred. You can try again, and if it keeps
        happening, reloading the page usually helps.
      </p>
      <div className="flex gap-3">
        <Button color="primary" onPress={() => reset()}>
          Try again
        </Button>
        <Button
          variant="bordered"
          onPress={() => window.location.reload()}
        >
          Reload page
        </Button>
      </div>
    </div>
  );
}
