"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

let hasInitialized = false;

export default function PosthogProvider() {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

    if (!apiKey || hasInitialized) return;

    posthog.init(apiKey, {
      api_host: apiHost,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
    });

    hasInitialized = true;
  }, []);

  return null;
}
