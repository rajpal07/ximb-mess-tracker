"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input } from "@heroui/react";
import { supabase } from "@/app/utils/supabaseClient";
import type { User } from "@supabase/supabase-js";
import GmailSync, { type SyncedPurchase } from "@/app/GmailSync";

const DAILY_FIXED_COST = 222;
const DEFAULT_MESS_START_DATE = "2026-06-15";

type PurchaseRecord = {
  id: string;
  date: string;
  item: string;
  sourceFile: string;
  total: number;
};

type ParsedInvoice = Omit<PurchaseRecord, "id">;

type DailyRow = {
  date: string;
  fixedCost: number;
  variableCost: number;
  purchases: PurchaseRecord[];
  total: number;
};

type TrackerSettings = {
  messStartDate: string;
  advanceByMonth: Record<string, number>;
  customTotalByMonth: Record<string, number>;
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return currency.format(value);
}

function toLocalDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTodayMonthKey() {
  return toLocalDateKey(new Date()).slice(0, 7);
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function getVisibleDates(monthKey: string, messStartDate: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const [startYear, startMonth, startDay] = messStartDate.split("-").map(Number);
  const endOfMonth = new Date(year, month, 0);
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month - 1;
  const isStartMonth = startYear === year && startMonth === month;
  const firstDay = isStartMonth ? startDay : 1;
  const end = isCurrentMonth
    ? new Date(year, month - 1, today.getDate())
    : endOfMonth;

  const dates: string[] = [];
  for (let day = firstDay; day <= end.getDate(); day += 1) {
    dates.push(toLocalDateKey(new Date(year, month - 1, day)));
  }

  return dates;
}

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    weekday: "short",
  });
}

function monthMatches(date: string, monthKey: string) {
  return date.startsWith(monthKey);
}

function looksLikeFallbackItem(item: string, sourceFile: string) {
  const normalizedItem = item.trim().toLowerCase();
  const normalizedFile = sourceFile.replace(/\.pdf$/i, "").trim().toLowerCase();

  return normalizedItem === normalizedFile || normalizedItem.startsWith("invoice");
}

export default function HomePage() {
  const [selectedMonth, setSelectedMonth] = useState(getTodayMonthKey);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [settings, setSettings] = useState<TrackerSettings>({
    messStartDate: DEFAULT_MESS_START_DATE,
    advanceByMonth: {},
    customTotalByMonth: {},
  });

  const [purchaseRecords, setPurchaseRecords] = useState<PurchaseRecord[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("Drop your invoice PDFs");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [manualEntry, setManualEntry] = useState({
    date: `${selectedMonth}-01`,
    item: "",
    total: "",
  });

  // Check auth state
  useEffect(() => {
    // If we're landing on an OAuth callback, a session is about to be
    // established (PKCE `?code=…`, or a legacy `#access_token=…` hash). Keep
    // the stable loading state until it resolves instead of flashing the login
    // screen while supabase-js exchanges the code.
    const isOAuthCallback =
      typeof window !== "undefined" &&
      (new URLSearchParams(window.location.search).has("code") ||
        /[#&](access_token|error)=/.test(window.location.hash));

    // Once the callback resolves, strip the OAuth params from the URL so raw
    // tokens / codes don't linger in the address bar or browser history.
    const cleanOAuthParamsFromUrl = () => {
      if (!isOAuthCallback || typeof window === "undefined") return;
      window.history.replaceState({}, "", window.location.pathname);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      // While a callback is in flight, defer to onAuthStateChange so we don't
      // briefly render the login screen before the session lands.
      if (!isOAuthCallback) setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      cleanOAuthParamsFromUrl();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Fetch settings & purchases when user logs in
  useEffect(() => {
    if (!user) {
      setPurchaseRecords([]);
      setSettings({
        messStartDate: DEFAULT_MESS_START_DATE,
        advanceByMonth: {},
        customTotalByMonth: {},
      });
      setHasLoaded(false);
      return;
    }

    const loadData = async () => {
      setAuthLoading(true);
      try {
        // Fetch purchases
        const { data: purchasesData, error: purchasesError } = await supabase
          .from("purchases")
          .select("*")
          .eq("user_id", user.id);

        if (purchasesError) throw purchasesError;

        // Fetch settings
        const { data: settingsData, error: settingsError } = await supabase
          .from("settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (settingsError) throw settingsError;

        if (purchasesData) {
          const records: PurchaseRecord[] = purchasesData.map((row) => ({
            id: row.id,
            date: row.date,
            item: row.item,
            sourceFile: row.source_file,
            total: Number(row.total),
          }));
          setPurchaseRecords(records.sort((a, b) => a.date.localeCompare(b.date)));
        }

        if (settingsData) {
          setSettings({
            messStartDate: settingsData.mess_start_date,
            advanceByMonth: settingsData.advance_by_month || {},
            customTotalByMonth: settingsData.custom_total_by_month || {},
          });
        } else {
          // Create default settings row in Supabase
          const defaultSettings = {
            user_id: user.id,
            mess_start_date: DEFAULT_MESS_START_DATE,
            advance_by_month: {},
            custom_total_by_month: {},
          };
          await supabase.from("settings").insert(defaultSettings);
        }

        setHasLoaded(true);
      } catch (err) {
        console.error("Error loading data from Supabase:", err);
      } finally {
        setAuthLoading(false);
      }
    };

    loadData();
  }, [user]);

  // Sync settings when they change locally (only after initial load has finished)
  useEffect(() => {
    if (!user || !hasLoaded) return;

    const saveSettings = async () => {
      try {
        await supabase.from("settings").upsert({
          user_id: user.id,
          mess_start_date: settings.messStartDate,
          advance_by_month: settings.advanceByMonth,
          custom_total_by_month: settings.customTotalByMonth,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Error saving settings:", err);
      }
    };

    saveSettings();
  }, [settings, user, hasLoaded]);

  useEffect(() => {
    setManualEntry((current) => ({
      ...current,
      date: current.date.startsWith(selectedMonth) ? current.date : `${selectedMonth}-01`,
    }));
  }, [selectedMonth]);

  const filteredPurchases = useMemo(
    () => purchaseRecords.filter((purchase) => monthMatches(purchase.date, selectedMonth)),
    [purchaseRecords, selectedMonth],
  );

  const dailyRows = useMemo<DailyRow[]>(() => {
    const purchaseMap = new Map<string, PurchaseRecord[]>();

    for (const purchase of filteredPurchases) {
      const existing = purchaseMap.get(purchase.date) ?? [];
      existing.push(purchase);
      purchaseMap.set(purchase.date, existing);
    }

    return getVisibleDates(selectedMonth, settings.messStartDate).map((date) => {
      const purchases = purchaseMap.get(date) ?? [];
      const variableCost = purchases.reduce((sum, purchase) => sum + purchase.total, 0);

      return {
        date,
        fixedCost: DAILY_FIXED_COST,
        variableCost,
        purchases,
        total: DAILY_FIXED_COST + variableCost,
      };
    });
  }, [filteredPurchases, selectedMonth, settings.messStartDate]);

  const summary = useMemo(() => {
    const computedFixedTotal = dailyRows.reduce((sum, row) => sum + row.fixedCost, 0);
    const computedVariableTotal = dailyRows.reduce((sum, row) => sum + row.variableCost, 0);
    const computedGrandTotal = computedFixedTotal + computedVariableTotal;
    const advanceCredit = settings.advanceByMonth[selectedMonth] ?? 0;
    const customMonthTotal = settings.customTotalByMonth[selectedMonth] ?? 0;
    const grandTotal = customMonthTotal > 0 ? customMonthTotal : computedGrandTotal;

    return {
      fixedTotal: computedFixedTotal,
      variableTotal: computedVariableTotal,
      grandTotal,
      customMonthTotal,
      advanceCredit,
      payableTotal: Math.max(grandTotal - advanceCredit, 0),
    };
  }, [dailyRows, selectedMonth, settings.advanceByMonth, settings.customTotalByMonth]);

  const todayKey = toLocalDateKey(new Date());

  // Gmail sync + realtime feed both land here; dedupe by id.
  const mergeNewPurchases = useCallback((records: SyncedPurchase[]) => {
    setPurchaseRecords((current) => {
      const byId = new Map(current.map((r) => [r.id, r]));
      for (const r of records) byId.set(r.id, r);
      return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
    });
  }, []);

  async function handleGoogleLogin() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
          // Gmail read access rides on the same Google login — no second sign-in.
          scopes: "https://www.googleapis.com/auth/gmail.readonly",
          // `access_type: offline` still yields a refresh token on the first
          // authorization. We deliberately omit `prompt: "consent"` here so
          // returning users aren't forced through the Google consent screen on
          // every login — the explicit "connect gmail" button re-forces consent
          // if the refresh token is ever missing.
          queryParams: { access_type: "offline" },
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Google Login Error:", error);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    if (!user) return;
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setIsImporting(true);
    setImportMessage("Reading invoices...");

    const parsedInvoices: PurchaseRecord[] = [];

    for (const file of files) {
      try {
        // 1. Parse the PDF invoice
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/parse-invoice", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("parse failed");
        }

        const parsedList = (await response.json()) as ParsedInvoice[];

        // 2. Add each parsed item as a separate purchase record
        for (const parsed of parsedList) {
          parsedInvoices.push({
            date: parsed.date,
            item: parsed.item,
            total: parsed.total,
            sourceFile: "pdf",
            id: `${parsed.date}-${parsed.item.replace(/\s+/g, "_")}-${parsed.total}-pdf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          });
        }
      } catch (err) {
        console.error("Parsing error for file:", file.name, err);
        setImportMessage(`Couldn't read ${file.name}`);
      }
    }

    if (parsedInvoices.length > 0) {
      const toUpsert = parsedInvoices.map((invoice) => ({
        id: invoice.id,
        date: invoice.date,
        item: invoice.item,
        source_file: invoice.sourceFile,
        total: invoice.total,
        user_id: user.id,
      }));

      try {
        const { error } = await supabase.from("purchases").upsert(toUpsert);
        if (error) throw error;

        setPurchaseRecords((current) => {
          const merged = [...current];

          for (const invoice of parsedInvoices) {
            const existingIndex = merged.findIndex(
              (entry) =>
                entry.id === invoice.id ||
                (entry.sourceFile === invoice.sourceFile &&
                  entry.date === invoice.date &&
                  entry.total === invoice.total) ||
                (entry.date === invoice.date &&
                  entry.total === invoice.total &&
                  looksLikeFallbackItem(entry.item, entry.sourceFile)),
            );

            if (existingIndex >= 0) {
              merged[existingIndex] = invoice;
            } else {
              merged.push(invoice);
            }
          }

          return merged.sort((a, b) => a.date.localeCompare(b.date));
        });

        setImportMessage(`Added ${parsedInvoices.length} invoice${parsedInvoices.length > 1 ? "s" : ""}`);
      } catch (err) {
        console.error("Error upserting uploads:", err);
        setImportMessage("Failed to save to database");
      }
    }

    setIsImporting(false);
    event.target.value = "";
  }

  async function clearMonth() {
    if (!user) return;
    if (!window.confirm(`Delete all extras logged for ${getMonthLabel(selectedMonth)}? This can't be undone.`)) {
      return;
    }
    try {
      const startDate = `${selectedMonth}-01`;
      const endDate = new Date(
        Number(selectedMonth.split("-")[0]),
        Number(selectedMonth.split("-")[1]),
        0,
      ).toISOString().slice(0, 10);

      const { error } = await supabase
        .from("purchases")
        .delete()
        .eq("user_id", user.id)
        .gte("date", startDate)
        .lte("date", endDate);

      if (error) throw error;

      setPurchaseRecords((current) =>
        current.filter((purchase) => !monthMatches(purchase.date, selectedMonth)),
      );
      setImportMessage("Month extras cleared");
    } catch (err) {
      console.error("Error clearing month:", err);
      setImportMessage("Failed to clear month");
    }
  }

  async function clearAll() {
    if (!user) return;
    if (!window.confirm("Delete every logged extra, across all months? This can't be undone.")) {
      return;
    }
    try {
      const { error } = await supabase
        .from("purchases")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      setPurchaseRecords([]);
      setImportMessage("All uploads cleared");
    } catch (err) {
      console.error("Error clearing all purchases:", err);
      setImportMessage("Failed to clear all entries");
    }
  }

  async function addManualEntry() {
    if (!user) return;
    const item = manualEntry.item.trim();
    const total = Number.parseFloat(manualEntry.total);

    if (!manualEntry.date || !item || Number.isNaN(total) || total <= 0) {
      setImportMessage("Fill date, item, and amount for the custom entry");
      return;
    }

    const newRecord = {
      date: manualEntry.date,
      item,
      source_file: "manual",
      total,
      user_id: user.id,
    };

    try {
      const { data, error } = await supabase.from("purchases").insert(newRecord).select().single();
      if (error) throw error;

      const recordToSave: PurchaseRecord = {
        id: data.id,
        date: data.date,
        item: data.item,
        sourceFile: data.source_file,
        total: Number(data.total),
      };

      setPurchaseRecords((current) => [...current, recordToSave].sort((a, b) => a.date.localeCompare(b.date)));
      setManualEntry((current) => ({
        ...current,
        item: "",
        total: "",
      }));
      setImportMessage("Manual entry added");
    } catch (err) {
      console.error("Error adding manual entry:", err);
      setImportMessage("Failed to save entry");
    }
  }

  async function deletePurchase(purchaseId: string) {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("purchases")
        .delete()
        .eq("id", purchaseId)
        .eq("user_id", user.id);

      if (error) throw error;

      setPurchaseRecords((current) => current.filter((p) => p.id !== purchaseId));
    } catch (err) {
      console.error("Error deleting purchase:", err);
      setImportMessage("Failed to delete entry");
    }
  }

  function toggleRowExpanded(date: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  const inputClassNames = {
    inputWrapper:
      "border border-[#d9d1bc] bg-[#fdfbf5] shadow-none data-[hover=true]:border-[#b9ae90] group-data-[focus=true]:border-[#e08a2e]",
    label: "text-[#5c6a54] text-xs",
    input: "text-[#1f2a1c] font-medium",
  };

  // --- Render Auth Loading Spinner ---
  // Show the stable loading state whenever auth is in flight — including a
  // transient `user === null` mid-transition — so the dashboard never tears
  // down to a blank/login flash while a session is being (re)established.
  if (authLoading) {
    return (
      <div className="paper-bg flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#2a4a2e] border-t-transparent"></div>
          <p className="font-[family-name:var(--font-manrope)] text-sm text-[#5c6a54]">opening your ledger…</p>
        </div>
      </div>
    );
  }

  // --- Render Login Screen if not Authenticated ---
  if (!user) {
    return (
      <main className="paper-bg flex min-h-screen items-center justify-center px-4 font-[family-name:var(--font-manrope)] text-[#1f2a1c]">
        <div className="ledger-card receipt-edge w-full max-w-md p-8 sm:p-10">
          <div className="rise space-y-6" style={{ animationDelay: "60ms" }}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5c6a54]">
                ximb mess tracker
              </p>
              <span className="num text-[11px] uppercase tracking-wider text-[#8a987e]">mess canteen</span>
            </div>

            <div className="rule-dashed" />

            <div className="space-y-3">
              <h1 className="font-[family-name:var(--font-bricolage)] text-[2.6rem] font-bold leading-[1.05] tracking-tight">
                Your mess P&amp;L,
                <br />
                <span className="text-[#2a4a2e]">sorted.</span>
              </h1>
              <p className="text-sm leading-relaxed text-[#5c6a54]">
                Four meals a day at the mess, billed whether you show
                up or not.
                <br />
                Sunk cost, literally.
                <br />
                This tracks that, plus every &ldquo;just one Diet Coke&rdquo; on
                top, so month-end isn&rsquo;t a plot twist.
              </p>
            </div>

            <Button
              onPress={handleGoogleLogin}
              className="w-full bg-[#16321e] py-6 text-[15px] font-semibold text-white transition-transform hover:bg-[#2a4a2e] active:scale-[0.99]"
              radius="full"
              size="lg"
            >
              <svg className="mr-1 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Sign in with Google
            </Button>

            <p className="text-center text-[11px] text-[#8a987e]">
              Your data stays yours. We just run the numbers.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // --- Render Dashboard if Authenticated ---
  const daysCounted = dailyRows.length;
  const avgPerDay = daysCounted > 0 ? Math.round(summary.grandTotal / daysCounted) : 0;

  return (
    <main className="paper-bg min-h-screen font-[family-name:var(--font-manrope)] text-[#1f2a1c]">
      <div className="mx-auto max-w-5xl px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">

        {/* Masthead */}
        <header className="rise mb-5" style={{ animationDelay: "0ms" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[#5c6a54]">
              <span className="h-2 w-2 rounded-full bg-[#4c8a3f]" aria-hidden="true"></span>
              <span className="truncate">
                <span className="hidden sm:inline">logged in as </span>
                <span className="font-semibold text-[#1f2a1c]">{user.email}</span>
              </span>
            </div>
            <Button
              size="sm"
              variant="light"
              className="h-7 min-w-0 px-3 font-medium text-[#c94f36] hover:bg-[#c94f36]/10"
              radius="full"
              onPress={() => supabase.auth.signOut()}
            >
              Sign Out
            </Button>
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5c6a54]">
                ximb · mess canteen
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-bricolage)] text-4xl font-bold tracking-tight md:text-5xl">
                mess ledger
              </h1>
              <p className="mt-1 font-[family-name:var(--font-instrument-serif)] text-lg italic text-[#5c6a54]">
                {getMonthLabel(selectedMonth)} · {daysCounted} day{daysCounted === 1 ? "" : "s"} counted
              </p>
            </div>

            <div className="flex flex-col gap-2.5 md:items-end">
              <label
                htmlFor="invoice-upload"
                className="group flex cursor-pointer items-center justify-between gap-3 rounded-full border border-dashed border-[#b9ae90] bg-[#fdfbf5] py-1.5 pl-4 pr-1.5 text-sm text-[#1f2a1c] transition-colors hover:border-[#e08a2e]"
              >
                <span className="truncate text-[13px] text-[#5c6a54]">{importMessage}</span>
                <input
                  id="invoice-upload"
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                />
                <Button
                  as="span"
                  className="bg-[#16321e] px-4 text-white shadow-none group-hover:bg-[#2a4a2e]"
                  isLoading={isImporting}
                  radius="full"
                  size="sm"
                >
                  upload
                </Button>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="month"
                  value={selectedMonth}
                  onValueChange={setSelectedMonth}
                  aria-label="month"
                  className="max-w-[170px]"
                  size="sm"
                  classNames={inputClassNames}
                />
                <Button
                  variant="flat"
                  radius="full"
                  size="sm"
                  className="border border-[#d9d1bc] bg-[#fdfbf5] text-[#5c6a54] hover:text-[#c94f36]"
                  onPress={clearMonth}
                >
                  clear month
                </Button>
                <Button
                  variant="flat"
                  radius="full"
                  size="sm"
                  className="border border-[#d9d1bc] bg-[#fdfbf5] text-[#5c6a54] hover:text-[#c94f36]"
                  onPress={clearAll}
                >
                  clear all
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Gmail auto-sync */}
        <GmailSync user={user} onNewPurchases={mergeNewPurchases} />

        {/* Summary tickets */}
        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "fixed per day", value: formatCurrency(DAILY_FIXED_COST), sub: "The non-negotiable", delay: 80 },
            {
              label: "extras total",
              value: formatCurrency(summary.variableTotal),
              sub:
                filteredPurchases.length > 0
                  ? `${filteredPurchases.length} moment${filteredPurchases.length === 1 ? "" : "s"} of weakness`
                  : "None yet. Iron discipline.",
              delay: 140,
            },
            {
              label: "month total",
              value: formatCurrency(summary.grandTotal),
              sub: summary.customMonthTotal > 0 ? "Using custom month total" : `Burn rate ≈ ${formatCurrency(avgPerDay)}/day`,
              delay: 200,
            },
          ].map((card) => (
            <div key={card.label} className="ledger-card rise p-4" style={{ animationDelay: `${card.delay}ms` }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5c6a54]">{card.label}</p>
              <p key={card.value} className="num ticker-pop mt-1.5 text-2xl font-semibold md:text-[1.7rem]">{card.value}</p>
              <p className="mt-0.5 truncate text-[11px] text-[#8a987e]">{card.sub}</p>
            </div>
          ))}

          {/* payable — the hero ticket */}
          <div className="ledger-card receipt-edge rise relative overflow-hidden !border-[#16321e] !bg-[#16321e] p-4 text-[#f4efe4]" style={{ animationDelay: "260ms" }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a8bd9c]">payable this month</p>
            <p key={summary.payableTotal} className="num ticker-pop mt-1.5 text-2xl font-semibold text-white md:text-[1.7rem]">
              {formatCurrency(summary.payableTotal)}
            </p>
            <p className="mt-0.5 text-[11px] text-[#a8bd9c]">advance: {formatCurrency(summary.advanceCredit)}</p>
            {summary.payableTotal === 0 && (
              <span className="stamp num absolute right-3 top-3 rounded border-2 border-[#e08a2e] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#e08a2e]">
                paid up
              </span>
            )}
          </div>
        </section>

        {/* Settings row */}
        <section className="rise mb-5 grid gap-3 md:grid-cols-3" style={{ animationDelay: "320ms" }}>
          <div className="ledger-card space-y-3 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5c6a54]">mess setup</p>
            <Input
              type="date"
              value={settings.messStartDate}
              onValueChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  messStartDate: value || DEFAULT_MESS_START_DATE,
                }))
              }
              label="mess start date"
              labelPlacement="outside"
              classNames={inputClassNames}
            />
            <p className="text-xs leading-relaxed text-[#8a987e]">
              set this if the mess started mid-month, like 15 june.
            </p>
          </div>

          <div className="ledger-card space-y-3 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5c6a54]">custom month total</p>
            <Input
              type="number"
              value={String(settings.customTotalByMonth[selectedMonth] ?? 0)}
              onValueChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  customTotalByMonth: {
                    ...current.customTotalByMonth,
                    [selectedMonth]: Number.parseInt(value || "0", 10) || 0,
                  },
                }))
              }
              label="saved total for this month"
              labelPlacement="outside"
              endContent={<span className="text-xs text-[#8a987e]">optional</span>}
              classNames={inputClassNames}
            />
            <p className="text-xs leading-relaxed text-[#8a987e]">
              overrides the computed total — e.g. set 4200 if you only care about the final amount.
            </p>
          </div>

          <div className="ledger-card space-y-3 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5c6a54]">advance</p>
            <Input
              type="number"
              value={String(settings.advanceByMonth[selectedMonth] ?? 0)}
              onValueChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  advanceByMonth: {
                    ...current.advanceByMonth,
                    [selectedMonth]: Number.parseInt(value || "0", 10) || 0,
                  },
                }))
              }
              label="advance credit for this month"
              labelPlacement="outside"
              endContent={<span className="text-xs text-[#8a987e]">optional</span>}
              classNames={inputClassNames}
            />
            <p className="text-xs leading-relaxed text-[#8a987e]">
              already paid a deposit? it gets subtracted from the payable amount.
            </p>
          </div>
        </section>

        {/* Manual entry */}
        <section className="rise mb-5" style={{ animationDelay: "380ms" }}>
          <div className="ledger-card space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5c6a54]">add an extra by hand</p>
              <p className="text-xs text-[#8a987e]">No invoice? The 2 a.m. Maggi still counts.</p>
            </div>

            <div className="grid gap-2.5 md:grid-cols-[160px_1fr_140px_auto]">
              <Input
                type="date"
                value={manualEntry.date}
                onValueChange={(value) => setManualEntry((current) => ({ ...current, date: value }))}
                aria-label="entry date"
                classNames={inputClassNames}
              />
              <Input
                value={manualEntry.item}
                onValueChange={(value) => setManualEntry((current) => ({ ...current, item: value }))}
                placeholder="what you bought"
                aria-label="entry item"
                classNames={inputClassNames}
              />
              <Input
                type="number"
                value={manualEntry.total}
                onValueChange={(value) => setManualEntry((current) => ({ ...current, total: value }))}
                placeholder="amount ₹"
                aria-label="entry amount"
                classNames={inputClassNames}
              />
              <Button
                className="bg-[#16321e] font-semibold text-white shadow-none hover:bg-[#2a4a2e]"
                radius="full"
                onPress={addManualEntry}
              >
                add entry
              </Button>
            </div>
          </div>
        </section>

        {/* Daily ledger */}
        <div className="ledger-card rise overflow-hidden" style={{ animationDelay: "440ms" }}>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-[#d9d1bc] bg-[#f4efe4]/60 text-left">
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5c6a54]">date</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5c6a54]">fixed</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5c6a54]">extras</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5c6a54]">what you bought</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5c6a54]">total</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((row) => {
                  const isExpanded = expandedRows.has(row.date);
                  const hasPurchases = row.purchases.length > 0;
                  const isToday = row.date === todayKey;

                  return (
                    <tr
                      key={row.date}
                      className={`border-b border-[#e7e0cd] transition-colors last:border-b-0 hover:bg-[#f4efe4]/50 ${isToday ? "today-row" : ""}`}
                    >
                      <td className="px-4 py-3.5 align-top text-sm text-[#1f2a1c]">
                        <span className="font-medium">{formatDateLabel(row.date)}</span>
                        {isToday && (
                          <span className="ml-2 rounded-full bg-[#e08a2e]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#b05f0a]">
                            today
                          </span>
                        )}
                      </td>
                      <td className="num px-4 py-3.5 align-top text-[15px] text-[#5c6a54]">{formatCurrency(row.fixedCost)}</td>
                      <td className="num px-4 py-3.5 align-top text-[15px] font-medium">
                        {row.variableCost > 0 ? (
                          <span className="text-[#b05f0a]">+{formatCurrency(row.variableCost)}</span>
                        ) : (
                          <span className="text-[#8a987e]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top text-sm text-[#1f2a1c]">
                        {hasPurchases ? (
                          <div>
                            <button
                              type="button"
                              onClick={() => toggleRowExpanded(row.date)}
                              className="flex w-full items-center gap-1.5 text-left transition-colors hover:text-[#2a4a2e]"
                              aria-expanded={isExpanded}
                            >
                              <svg
                                className={`h-3.5 w-3.5 shrink-0 text-[#8a987e] transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                                aria-hidden="true"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="truncate">
                                {row.purchases.length === 1
                                  ? row.purchases[0].item
                                  : `${row.purchases.length} items`}
                              </span>
                            </button>

                            {isExpanded && (
                              <div className="ml-5 mt-2 space-y-1.5 animate-[fadeIn_150ms_ease-in]">
                                {row.purchases.map((purchase) => (
                                  <div
                                    key={purchase.id}
                                    className="group/item flex items-center justify-between gap-3 rounded-lg bg-[#f4efe4] px-3 py-2"
                                  >
                                    <span className="min-w-0 flex-1 truncate text-sm text-[#1f2a1c]">{purchase.item}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="num whitespace-nowrap text-xs text-[#5c6a54]">{formatCurrency(purchase.total)}</span>
                                      <button
                                        type="button"
                                        onClick={() => deletePurchase(purchase.id)}
                                        className="shrink-0 rounded-md p-1 text-[#8a987e]/50 opacity-0 transition-all hover:bg-[#c94f36]/10 hover:text-[#c94f36] focus:opacity-100 group-hover/item:opacity-100"
                                        title="Remove this entry"
                                      >
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                {row.purchases.length > 1 && (
                                  <div className="mt-1 flex items-center justify-between border-t border-[#d9d1bc] px-3 pb-0.5 pt-2">
                                    <span className="text-xs font-semibold text-[#1f2a1c]">Total</span>
                                    <span className="num text-xs font-semibold text-[#1f2a1c]">{formatCurrency(row.variableCost)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#8a987e]">—</span>
                        )}
                      </td>
                      <td className="num px-4 py-3.5 text-right align-top text-base font-semibold">{formatCurrency(row.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="block divide-y divide-[#e7e0cd] md:hidden">
            {dailyRows.map((row) => {
              const isExpanded = expandedRows.has(row.date);
              const hasPurchases = row.purchases.length > 0;
              const isToday = row.date === todayKey;

              return (
                <div key={row.date} className={`space-y-2.5 p-4 ${isToday ? "today-row" : ""}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#1f2a1c]">
                      {formatDateLabel(row.date)}
                      {isToday && (
                        <span className="ml-2 rounded-full bg-[#e08a2e]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#b05f0a]">
                          today
                        </span>
                      )}
                    </span>
                    <span className="num text-base font-bold text-[#1f2a1c]">{formatCurrency(row.total)}</span>
                  </div>

                  <div className="flex gap-4 text-xs text-[#5c6a54]">
                    <div>
                      <span className="mr-1 text-[10px] uppercase tracking-wider text-[#8a987e]">Fixed:</span>
                      <span className="num font-semibold text-[#5c6a54]">{formatCurrency(row.fixedCost)}</span>
                    </div>
                    {row.variableCost > 0 && (
                      <div>
                        <span className="mr-1 text-[10px] uppercase tracking-wider text-[#8a987e]">Extras:</span>
                        <span className="num font-semibold text-[#b05f0a]">+{formatCurrency(row.variableCost)}</span>
                      </div>
                    )}
                  </div>

                  {hasPurchases && (
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => toggleRowExpanded(row.date)}
                        className="flex w-full items-center gap-1.5 py-1 text-left text-xs font-semibold text-[#1f2a1c] transition-colors hover:text-[#2a4a2e]"
                        aria-expanded={isExpanded}
                      >
                        <svg
                          className={`h-3.5 w-3.5 shrink-0 text-[#8a987e] transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span>
                          {row.purchases.length === 1
                            ? row.purchases[0].item
                            : `${row.purchases.length} items`}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="ml-4 mt-2 space-y-1.5 animate-[fadeIn_150ms_ease-in]">
                          {row.purchases.map((purchase) => (
                            <div
                              key={purchase.id}
                              className="flex items-center justify-between gap-3 rounded-lg bg-[#f4efe4] px-3 py-2"
                            >
                              <span className="min-w-0 truncate text-xs font-medium text-[#1f2a1c]">{purchase.item}</span>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="num whitespace-nowrap text-[11px] text-[#5c6a54]">{formatCurrency(purchase.total)}</span>
                                <button
                                  type="button"
                                  onClick={() => deletePurchase(purchase.id)}
                                  className="rounded-md p-1.5 text-[#8a987e] transition-colors hover:text-[#c94f36]"
                                  title="Remove this entry"
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                          {row.purchases.length > 1 && (
                            <div className="mt-1 flex items-center justify-between border-t border-[#d9d1bc] px-3 pb-0.5 pt-1.5">
                              <span className="text-[10px] font-bold text-[#1f2a1c]">Total</span>
                              <span className="num text-[10px] font-bold text-[#1f2a1c]">{formatCurrency(row.variableCost)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sticky payable bar — mobile only */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#2a4a2e] bg-[#16321e] px-4 py-3 text-[#f4efe4] md:hidden" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a8bd9c]">payable · {getMonthLabel(selectedMonth)}</p>
            <p className="num text-xl font-bold text-white">{formatCurrency(summary.payableTotal)}</p>
          </div>
          <div className="text-right text-[11px] leading-tight text-[#a8bd9c]">
            <p>total {formatCurrency(summary.grandTotal)}</p>
            <p>advance −{formatCurrency(summary.advanceCredit)}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
