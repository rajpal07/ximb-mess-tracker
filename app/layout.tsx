import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Manrope,
  Space_Grotesk,
  Bricolage_Grotesque,
  Instrument_Serif,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "./providers";
import PostHogPageView from "./PostHogPageView";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "XIMB Mess Tracker",
  description: "Track and calculate daily mess spends, upload invoices, and sync calculations.",
  openGraph: {
    title: "XIMB Mess Tracker",
    description: "Track and calculate daily mess spends, upload invoices, and sync calculations.",
    siteName: "XIMB Mess Tracker",
  },
  twitter: {
    card: "summary_large_image",
    title: "XIMB Mess Tracker",
    description: "Track and calculate daily mess spends, upload invoices, and sync calculations.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} ${spaceGrotesk.variable} ${bricolageGrotesque.variable} ${instrumentSerif.variable} min-h-screen text-foreground bg-background font-sans antialiased`}
      >
        <Providers>
          <PostHogPageView />
          {children}
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
