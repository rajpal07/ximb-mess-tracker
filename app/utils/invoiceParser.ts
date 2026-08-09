import { extractText, getDocumentProxy } from "unpdf";

export type ParsedInvoiceItem = {
  date: string;
  item: string;
  sourceFile: string;
  total: number;
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Shared Shirdi Sai invoice parser: PDF bytes → line items.
 * Used by both the manual upload route and the Gmail sync pipeline.
 * Throws if the PDF has no recognizable invoice date.
 */
export async function parseInvoicePdf(
  bytes: Uint8Array,
  sourceFile: string,
): Promise<ParsedInvoiceItem[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return parseInvoiceText(text, sourceFile);
}

/** Text-layer half of the parser, split out so the totals math is testable. */
export function parseInvoiceText(
  rawText: string,
  sourceFile: string,
): ParsedInvoiceItem[] {
  const text = rawText.split(/\s+/).join(" ");

  const dateMatch = text.match(/Invoice Date\s*:?\s*(\d{2}-\d{2}-\d{4})/i);
  if (!dateMatch) {
    throw new Error("Invoice date not found in PDF");
  }

  const [day, month, year] = dateMatch[1].split("-");
  const dateStr = `${year}-${month}-${day}`;

  // Match structured item rows and extract:
  // 1. SNo, 2. Item Name (alphabets only), 3. Qty, 4. Total Price
  //   1 MINARAL WATER 7 1.0BT L 7.00 7.00 0.00 7.00 0.00 0.00 0.00 7.00
  //   ^ ^item         ^HSN ^qty ^unit  \______ 7 numeric columns ____/ ^total
  // The unit is whatever the vendor sells in (PC, BTL, NOS, PKT...) and the PDF
  // text layer often splits it mid-token, so `BTL` arrives as `BT L`. Match any
  // alpha unit in up to two chunks rather than hardcoding one.
  const rowPattern = /\b(\d+)\s+([A-Z][A-Z\s&.-]*?)(?:\s+\d+)?\s+(\d+(?:\.\d+)?)\s*(?:[A-Z]+(?:\s+[A-Z]+)?)\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)\b/gi;

  // The invoice's own printed total is the source of truth; the row regex is a
  // best-effort itemisation on top of it.
  const totalMatches = [...text.matchAll(/Total Invoice Amount(?: After Tax)?\s*(\d+(?:\.\d{1,2})?)/gi)];
  const printedTotal =
    totalMatches.length > 0 ? parseFloat(totalMatches[totalMatches.length - 1][1]) : 0;

  const matches = [...text.matchAll(rowPattern)];
  const itemsList: ParsedInvoiceItem[] = [];

  for (const match of matches) {
    const [, , name, qty, price] = match;
    let cleanName = titleCase(name.trim());
    const q = parseFloat(qty);
    if (q > 1) {
      cleanName = `${cleanName} (${q})`;
    }
    itemsList.push({
      date: dateStr,
      item: cleanName,
      sourceFile,
      total: parseFloat(price),
    });
  }

  if (itemsList.length === 0) {
    // Fallback if no structured table rows found
    const itemMatch = text.match(/Item Name.*?Total\s+\d+\s+(.+?)\s+\d+\s+1\.0PC\b/i);
    let fallbackItem = itemMatch
      ? titleCase(itemMatch[1].trim())
      : sourceFile.replace(/\.[^/.]+$/, "");
    fallbackItem = fallbackItem.replace(/\s*\d+\s*$/, "");

    itemsList.push({
      date: dateStr,
      item: fallbackItem,
      sourceFile,
      total: printedTotal,
    });

    return itemsList;
  }

  // Reconcile: the row regex needs an exact column count and a `PC` unit, so it
  // silently drops rows it cannot match, and it never sees tax lines. Book the
  // difference against the invoice's printed total so the tracker can never
  // undercount what the mess actually billed.
  const parsedSum = itemsList.reduce((sum, entry) => sum + entry.total, 0);
  const delta = printedTotal - parsedSum;
  if (printedTotal > 0 && Math.abs(delta) >= 0.5) {
    itemsList.push({
      date: dateStr,
      item: delta > 0 ? "Tax / Unparsed Items" : "Invoice Adjustment",
      sourceFile,
      total: Math.round(delta * 100) / 100,
    });
  }

  return itemsList;
}
