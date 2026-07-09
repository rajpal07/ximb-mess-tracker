"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, Input } from "@heroui/react";
import { supabase } from "@/app/utils/supabaseClient";
import type { User } from "@supabase/supabase-js";

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

function getTodayMonthKey() {
  return new Date().toISOString().slice(0, 7);
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
    dates.push(new Date(year, month - 1, day).toISOString().slice(0, 10));
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
  const [importMessage, setImportMessage] = useState("upload invoice PDFs");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [manualEntry, setManualEntry] = useState({
    date: `${selectedMonth}-01`,
    item: "",
    total: "",
  });

  // Check auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
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

  async function handleGoogleLogin() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
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
    setImportMessage("reading invoices...");

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
        setImportMessage(`couldn't read ${file.name}`);
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

        setImportMessage(`added ${parsedInvoices.length} invoice${parsedInvoices.length > 1 ? "s" : ""}`);
      } catch (err) {
        console.error("Error upserting uploads:", err);
        setImportMessage("failed to save to database");
      }
    }

    setIsImporting(false);
    event.target.value = "";
  }

  async function clearMonth() {
    if (!user) return;
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
      setImportMessage("month extras cleared");
    } catch (err) {
      console.error("Error clearing month:", err);
      setImportMessage("failed to clear month");
    }
  }

  async function clearAll() {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("purchases")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      setPurchaseRecords([]);
      setImportMessage("all uploads cleared");
    } catch (err) {
      console.error("Error clearing all purchases:", err);
      setImportMessage("failed to clear all entries");
    }
  }

  async function addManualEntry() {
    if (!user) return;
    const item = manualEntry.item.trim();
    const total = Number.parseFloat(manualEntry.total);

    if (!manualEntry.date || !item || Number.isNaN(total) || total <= 0) {
      setImportMessage("fill date, item, and amount for the custom entry");
      return;
    }

    const tempId = `manual-${manualEntry.date}-${item}-${total}-${Date.now()}`;
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
      setImportMessage("manual entry added");
    } catch (err) {
      console.error("Error adding manual entry:", err);
      setImportMessage("failed to save entry");
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
      setImportMessage("failed to delete entry");
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

  // --- Render Auth Loading Spinner ---
  if (authLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f4]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#1f3a2b] border-t-transparent"></div>
          <p className="font-[family-name:var(--font-manrope)] text-sm text-[#5c6a62]">connecting to secure space...</p>
        </div>
      </div>
    );
  }

  // --- Render Login Screen if not Authenticated ---
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f4] font-[family-name:var(--font-manrope)] text-[#1b2a21] px-4">
        <div className="w-full max-w-md border border-[#d7ddd5] bg-white p-8 rounded-3xl shadow-sm space-y-6">
          <div className="space-y-2 text-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">ximb mess tracker</p>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">daily mess spend</h1>
            <p className="text-sm text-[#5c6a62]">
              sign in with your Google account to log spends, upload invoices, and sync data securely.
            </p>
          </div>

          <Button
            onPress={handleGoogleLogin}
            className="w-full bg-[#1f3a2b] text-white hover:bg-[#15271d] py-6 font-semibold flex items-center justify-center transition-colors gap-2"
            radius="full"
            size="lg"
          >
            <svg className="w-5 h-5 mr-1" viewBox="0 0 24 24">
              <path
                fill="#ffffff"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#ffffff"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#ffffff"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#ffffff"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign in with Google
          </Button>

          <p className="text-[10px] text-center text-[#95a099]">
            your data is synced to database securely.
          </p>
        </div>
      </main>
    );
  }

  // --- Render Dashboard if Authenticated ---
  return (
    <main className="min-h-screen bg-[#f7f7f4] font-[family-name:var(--font-manrope)] text-[#1b2a21]">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
        
        {/* User Info Bar */}
        <div className="mb-4 flex items-center justify-between rounded-full border border-[#d7ddd5] bg-white px-4 py-2 text-xs text-[#5c6a62]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>logged in as <span className="font-semibold text-[#314238]">{user.email}</span></span>
          </div>
          <Button
            size="sm"
            variant="light"
            className="text-[#e23b3b] font-medium h-7 px-3 min-w-0 hover:bg-red-50"
            radius="full"
            onPress={() => supabase.auth.signOut()}
          >
            Sign Out
          </Button>
        </div>

        <div className="mb-6 flex flex-col gap-5 border-b border-[#d7ddd5] pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">ximb mess tracker</p>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">daily mess spend</h1>
            <p className="text-sm text-[#5c6a62]">{getMonthLabel(selectedMonth)}</p>
          </div>

          <div className="flex flex-col gap-3 md:items-end">
            <label
              htmlFor="invoice-upload"
              className="flex cursor-pointer items-center gap-3 rounded-full border border-[#d7ddd5] bg-white px-4 py-3 text-sm text-[#314238] transition hover:border-[#adb8b0]"
            >
              <span>{importMessage}</span>
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
                className="bg-[#1f3a2b] px-4 text-white shadow-none"
                isLoading={isImporting}
                radius="full"
                size="sm"
              >
                upload
              </Button>
            </label>

            <div className="flex flex-wrap gap-2">
              <Input
                type="month"
                value={selectedMonth}
                onValueChange={setSelectedMonth}
                aria-label="month"
                className="max-w-[180px]"
                classNames={{
                  inputWrapper: "border border-[#d7ddd5] bg-white shadow-none",
                  input: "text-[#1b2a21]",
                }}
              />
              <Button variant="flat" radius="full" className="bg-white text-[#314238]" onPress={clearMonth}>
                clear month
              </Button>
              <Button variant="flat" radius="full" className="bg-[#1f3a2b] text-white" onPress={clearAll}>
                clear all
              </Button>
            </div>
          </div>
        </div>

        <section className="mb-6 grid gap-3 grid-cols-2 md:grid-cols-4">
          <Card className="border border-[#d7ddd5] bg-white shadow-none">
            <CardBody className="gap-1 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">fixed per day</p>
              <p className="text-2xl font-semibold">{formatCurrency(DAILY_FIXED_COST)}</p>
            </CardBody>
          </Card>
          <Card className="border border-[#d7ddd5] bg-white shadow-none">
            <CardBody className="gap-1 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">extras total</p>
              <p className="text-2xl font-semibold">{formatCurrency(summary.variableTotal)}</p>
            </CardBody>
          </Card>
          <Card className="border border-[#d7ddd5] bg-white shadow-none">
            <CardBody className="gap-1 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">month total</p>
              <p className="text-2xl font-semibold">{formatCurrency(summary.grandTotal)}</p>
              {summary.customMonthTotal > 0 ? (
                <p className="text-xs text-[#5c6a62]">using custom month total</p>
              ) : null}
            </CardBody>
          </Card>
          <Card className="border border-[#d7ddd5] bg-white shadow-none">
            <CardBody className="gap-1 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">payable this month</p>
              <p className="text-2xl font-semibold">{formatCurrency(summary.payableTotal)}</p>
              <p className="text-xs text-[#5c6a62]">advance: {formatCurrency(summary.advanceCredit)}</p>
            </CardBody>
          </Card>
        </section>

        <section className="mb-6 grid gap-3 md:grid-cols-3">
          <Card className="border border-[#d7ddd5] bg-white shadow-none">
            <CardBody className="gap-3 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">mess setup</p>
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
                classNames={{
                  inputWrapper: "border border-[#d7ddd5] bg-white shadow-none",
                  label: "text-[#5c6a62]",
                  input: "text-[#1b2a21]",
                }}
              />
              <p className="text-xs text-[#5c6a62]">
                use this if mess started mid-month, like `15 june`.
              </p>
            </CardBody>
          </Card>

          <Card className="border border-[#d7ddd5] bg-white shadow-none">
            <CardBody className="gap-3 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">custom month total</p>
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
                endContent={<span className="text-xs text-[#5c6a62]">optional</span>}
                classNames={{
                  inputWrapper: "border border-[#d7ddd5] bg-white shadow-none",
                  label: "text-[#5c6a62]",
                  input: "text-[#1b2a21]",
                }}
              />
              <p className="text-xs text-[#5c6a62]">
                example: set june to `4200` if you only want to track the final amount.
              </p>
            </CardBody>
          </Card>

          <Card className="border border-[#d7ddd5] bg-white shadow-none">
            <CardBody className="gap-3 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">advance</p>
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
                endContent={<span className="text-xs text-[#5c6a62]">optional</span>}
                classNames={{
                  inputWrapper: "border border-[#d7ddd5] bg-white shadow-none",
                  label: "text-[#5c6a62]",
                  input: "text-[#1b2a21]",
                }}
              />
              <p className="text-xs text-[#5c6a62]">
                june can stay `0`. from july to september, enter `3000` or any custom amount.
              </p>
            </CardBody>
          </Card>
        </section>

        <section className="mb-6">
          <Card className="border border-[#d7ddd5] bg-white shadow-none">
            <CardBody className="gap-3 p-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">manual entry</p>
                <p className="text-sm text-[#5c6a62]">
                  use this for june or any older month when you want to add something by hand.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[160px_1fr_140px_auto]">
                <Input
                  type="date"
                  value={manualEntry.date}
                  onValueChange={(value) => setManualEntry((current) => ({ ...current, date: value }))}
                  aria-label="entry date"
                  classNames={{
                    inputWrapper: "border border-[#d7ddd5] bg-white shadow-none",
                    input: "text-[#1b2a21]",
                  }}
                />
                <Input
                  value={manualEntry.item}
                  onValueChange={(value) => setManualEntry((current) => ({ ...current, item: value }))}
                  placeholder="what you bought or note"
                  aria-label="entry item"
                  classNames={{
                    inputWrapper: "border border-[#d7ddd5] bg-white shadow-none",
                    input: "text-[#1b2a21]",
                  }}
                />
                <Input
                  type="number"
                  value={manualEntry.total}
                  onValueChange={(value) => setManualEntry((current) => ({ ...current, total: value }))}
                  placeholder="amount"
                  aria-label="entry amount"
                  classNames={{
                    inputWrapper: "border border-[#d7ddd5] bg-white shadow-none",
                    input: "text-[#1b2a21]",
                  }}
                />
                <Button className="bg-[#1f3a2b] text-white shadow-none" radius="full" onPress={addManualEntry}>
                  add entry
                </Button>
              </div>
            </CardBody>
          </Card>
        </section>

        <Card className="border border-[#d7ddd5] bg-white shadow-none">
          <CardBody className="p-0">
            {/* Desktop Table View (Hidden on mobile) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#d7ddd5] bg-[#fbfbf9] text-left">
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">date</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">fixed</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">variable</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">what you bought</th>
                    <th className="px-4 py-3 text-right text-[11px] uppercase tracking-[0.2em] text-[#5c6a62]">total</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((row) => {
                    const isExpanded = expandedRows.has(row.date);
                    const hasPurchases = row.purchases.length > 0;

                    return (
                      <tr key={row.date} className="border-b border-[#eef1ec] last:border-b-0 group">
                        <td className="px-4 py-4 text-sm text-[#314238] align-top">{formatDateLabel(row.date)}</td>
                        <td className="px-4 py-4 text-base font-medium align-top">{formatCurrency(row.fixedCost)}</td>
                        <td className="px-4 py-4 text-base font-medium align-top">
                          {row.variableCost > 0 ? formatCurrency(row.variableCost) : "-"}
                        </td>
                        <td className="px-4 py-4 text-sm text-[#314238] align-top">
                          {hasPurchases ? (
                            <div>
                              <button
                                type="button"
                                onClick={() => toggleRowExpanded(row.date)}
                                className="flex items-center gap-1.5 text-left hover:text-[#1f3a2b] transition-colors w-full"
                              >
                                <svg
                                  className={`w-3.5 h-3.5 shrink-0 text-[#5c6a62] transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
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
                                <div className="mt-2 ml-5 space-y-1.5 animate-[fadeIn_150ms_ease-in]">
                                  {row.purchases.map((purchase) => (
                                    <div
                                      key={purchase.id}
                                      className="flex items-center justify-between gap-3 rounded-lg bg-[#f7f7f4] px-3 py-2 group/item"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <span className="text-[#314238] text-sm">{purchase.item}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-[#5c6a62] whitespace-nowrap">{formatCurrency(purchase.total)}</span>
                                        <button
                                          type="button"
                                          onClick={() => deletePurchase(purchase.id)}
                                          className="shrink-0 rounded-md p-1 text-[#5c6a62]/40 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                                          title="Remove this entry"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  {row.purchases.length > 1 && (
                                    <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#d7ddd5] mt-1 pt-2">
                                      <span className="text-xs font-semibold text-[#314238]">Total</span>
                                      <span className="text-xs font-semibold text-[#314238]">{formatCurrency(row.variableCost)}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-4 text-right text-lg font-semibold align-top">{formatCurrency(row.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View (Visible on mobile, hidden on desktop) */}
            <div className="block md:hidden divide-y divide-[#eef1ec]">
              {dailyRows.map((row) => {
                const isExpanded = expandedRows.has(row.date);
                const hasPurchases = row.purchases.length > 0;

                return (
                  <div key={row.date} className="p-4 space-y-3">
                    {/* Header: Date & Total */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#314238]">{formatDateLabel(row.date)}</span>
                      <span className="text-base font-bold text-[#1b2a21]">{formatCurrency(row.total)}</span>
                    </div>

                    {/* Cost breakdown */}
                    <div className="flex gap-4 text-xs text-[#5c6a62]">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-[#95a099] mr-1">Fixed:</span>
                        <span className="font-semibold text-[#314238]">{formatCurrency(row.fixedCost)}</span>
                      </div>
                      {row.variableCost > 0 && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-[#95a099] mr-1">Extras:</span>
                          <span className="font-semibold text-[#314238]">{formatCurrency(row.variableCost)}</span>
                        </div>
                      )}
                    </div>

                    {/* What you bought */}
                    {hasPurchases && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => toggleRowExpanded(row.date)}
                          className="flex items-center gap-1.5 text-left text-xs font-semibold text-[#314238] hover:text-[#1f3a2b] transition-colors w-full"
                        >
                          <svg
                            className={`w-3.5 h-3.5 shrink-0 text-[#5c6a62] transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
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
                          <div className="mt-2 ml-4 space-y-1.5 animate-[fadeIn_150ms_ease-in]">
                            {row.purchases.map((purchase) => (
                              <div
                                key={purchase.id}
                                className="flex items-center justify-between gap-3 rounded-lg bg-[#f7f7f4] px-3 py-2"
                              >
                                <span className="text-[#314238] text-xs font-medium min-w-0 truncate">{purchase.item}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11px] text-[#5c6a62] whitespace-nowrap">{formatCurrency(purchase.total)}</span>
                                  <button
                                    type="button"
                                    onClick={() => deletePurchase(purchase.id)}
                                    className="p-1 text-[#5c6a62]/60 hover:text-red-500 rounded-md transition-colors"
                                    title="Remove this entry"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                            {row.purchases.length > 1 && (
                              <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#d7ddd5] mt-1 pt-1.5">
                                <span className="text-[10px] font-bold text-[#314238]">Total</span>
                                <span className="text-[10px] font-bold text-[#314238]">{formatCurrency(row.variableCost)}</span>
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
          </CardBody>
        </Card>
      </div>
    </main>
  );
}

