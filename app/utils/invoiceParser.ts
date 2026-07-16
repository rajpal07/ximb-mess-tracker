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
  const { text: rawText } = await extractText(pdf, { mergePages: true });
  const text = rawText.split(/\s+/).join(" ");

  const dateMatch = text.match(/Invoice Date\s*:?\s*(\d{2}-\d{2}-\d{4})/i);
  if (!dateMatch) {
    throw new Error("Invoice date not found in PDF");
  }

  const [day, month, year] = dateMatch[1].split("-");
  const dateStr = `${year}-${month}-${day}`;

  // Pattern to match structured item rows and extract:
  // 1. SNo, 2. Item Name (alphabets only), 3. Qty, 4. Total Price
  const rowPattern = /\b(\d+)\s+([A-Z][A-Z\s&.-]*?)(?:\s+\d+)?\s+(\d+(?:\.\d+)?)\s*PC(?:\s+[A-Z])?\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)\b/gi;

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

    const totalMatches = [...text.matchAll(/Total Invoice Amount(?: After Tax)?\s*(\d+(?:\.\d{1,2})?)/gi)];
    const grandTotal =
      totalMatches.length > 0 ? parseFloat(totalMatches[totalMatches.length - 1][1]) : 0.0;

    itemsList.push({
      date: dateStr,
      item: fallbackItem,
      sourceFile,
      total: grandTotal,
    });
  }

  return itemsList;
}
