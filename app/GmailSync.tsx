"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { supabase } from "@/app/utils/supabaseClient";
import type { User } from "@supabase/supabase-js";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const POLL_MS = 60_000;

export type SyncedPurchase = {
  id: string;
  date: string;
  item: string;
  sourceFile: string;
  total: number;
};

type SyncStatus = "checking" | "connected" | "not_connected" | "syncing" | "error";

type SyncResponse = {
  status?: "ok" | "not_connected";
  scanned?: number;
  inserted?: {
    id: string;
    date: string;
    item: string;
    source_file: string;
    total: number;
  }[];
  errors?: string[];
  error?: string;
};

function notify(items: SyncedPurchase[]) {
  if (items.length === 0) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const first = items[0];
  const body =
    items.length === 1
      ? `${first.item} · ₹${first.total}`
      : `${items.length} new items from mess invoices`;
  new Notification("New mess invoice logged", { body });
}

export default function GmailSync({
  user,
  onNewPurchases,
}: {
  user: User;
  onNewPurchases: (records: SyncedPurchase[]) => void;
}) {
  const [status, setStatus] = useState<SyncStatus>("checking");
  const [detail, setDetail] = useState("checking gmail connection…");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setStatus((s) => (s === "checking" ? s : "syncing"));
    try {
      const { data } = await supabase.auth.getSession();
      const jwt = data.session?.access_token;
      if (!jwt) return;

      const res = await fetch("/api/gmail/sync", {
        method: "POST",
        headers: { authorization: `Bearer ${jwt}` },
      });
      const body = (await res.json()) as SyncResponse;

      if (body.status === "not_connected") {
        setStatus("not_connected");
        setDetail("gmail not connected");
        return;
      }
      if (!res.ok || body.status !== "ok") {
        setStatus("error");
        setDetail(body.error ?? "sync failed");
        return;
      }

      const records: SyncedPurchase[] = (body.inserted ?? []).map((r) => ({
        id: r.id,
        date: r.date,
        item: r.item,
        sourceFile: r.source_file,
        total: Number(r.total),
      }));
      if (records.length > 0) {
        onNewPurchases(records);
        notify(records);
      }

      setStatus("connected");
      const errNote = body.errors?.length ? ` · ${body.errors.length} skipped` : "";
      setDetail(
        records.length > 0
          ? `+${records.length} new · synced ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}${errNote}`
          : `up to date · ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}${errNote}`,
      );
    } catch {
      setStatus("error");
      setDetail("sync failed — will retry");
    } finally {
      syncingRef.current = false;
    }
  }, [onNewPurchases]);

  // Capture the Google refresh token Supabase returns right after OAuth.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.provider_refresh_token) {
        setPendingToken(session.provider_refresh_token);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!pendingToken) return;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const jwt = data.session?.access_token;
        if (!jwt) return;
        await fetch("/api/gmail/store-token", {
          method: "POST",
          headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: pendingToken }),
        });
        setPendingToken(null);
        sync();
      } catch {
        // next poll retries
      }
    })();
  }, [pendingToken, sync]);

  // Initial sync + poll while the page is open.
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    sync();
    const timer = setInterval(sync, POLL_MS);
    return () => clearInterval(timer);
  }, [sync]);

  // Realtime: background cron / other devices insert → live notification here.
  useEffect(() => {
    const channel = supabase
      .channel("purchases-inserts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "purchases", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            date: string;
            item: string;
            source_file: string;
            total: number;
          };
          const record: SyncedPurchase = {
            id: row.id,
            date: row.date,
            item: row.item,
            sourceFile: row.source_file,
            total: Number(row.total),
          };
          onNewPurchases([record]);
          if (row.source_file?.toLowerCase().startsWith("invoice")) {
            notify([record]);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id, onNewPurchases]);

  async function connectGmail() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        scopes: GMAIL_SCOPE,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  }

  const dotColor =
    status === "connected" || status === "syncing"
      ? "bg-[#4c8a3f]"
      : status === "not_connected" || status === "error"
        ? "bg-[#c94f36]"
        : "bg-[#b9ae90]";

  return (
    <div className="ledger-card mb-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} aria-hidden="true"></span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5c6a54]">
            gmail auto-sync
          </p>
          <p className="truncate text-xs text-[#8a987e]">{detail}</p>
        </div>
      </div>

      {status === "not_connected" ? (
        <Button
          size="sm"
          radius="full"
          className="bg-[#16321e] px-4 font-semibold text-white shadow-none hover:bg-[#2a4a2e]"
          onPress={connectGmail}
        >
          connect gmail
        </Button>
      ) : (
        <Button
          size="sm"
          radius="full"
          variant="flat"
          isLoading={status === "syncing" || status === "checking"}
          className="border border-[#d9d1bc] bg-[#fdfbf5] px-4 text-[#5c6a54]"
          onPress={sync}
        >
          sync now
        </Button>
      )}
    </div>
  );
}
