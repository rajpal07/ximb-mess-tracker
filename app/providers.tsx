"use client";

import { HeroUIProvider } from "@heroui/react";
import PosthogProvider from "./posthog-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <HeroUIProvider>
      <PosthogProvider />
      {children}
    </HeroUIProvider>
  );
}
