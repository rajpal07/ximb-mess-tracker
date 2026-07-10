"use client";

import { HeroUIProvider } from "@heroui/react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

if (typeof window !== "undefined") {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false, // Capture manually in App Router
    capture_pageleave: true, // explicitly enable pageleave
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider client={posthog}>
      <HeroUIProvider>{children}</HeroUIProvider>
    </PostHogProvider>
  );
}
