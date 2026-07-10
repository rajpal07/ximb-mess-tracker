import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
    const { text: rawText } = await extractText(pdf, { mergePages: true });
    const text = rawText.split(/\s+/).join(" ");

    const dateMatch = text.match(/Invoice Date\s*:?\s*(\d{2}-\d{2}-\d{4})/i);
    if (!dateMatch) {
      return NextResponse.json({ error: "Invoice date not found in PDF" }, { status: 422 });
    }

    const [day, month, year] = dateMatch[1].split("-");
    const dateStr = `${year}-${month}-${day}`;

    // Pattern to match structured item rows and extract:
    // 1. SNo, 2. Item Name (alphabets only), 3. Qty, 4. Total Price
    const rowPattern = /\b(\d+)\s+([A-Z][A-Z\s&.-]*?)(?:\s+\d+)?\s+(\d+(?:\.\d+)?)\s*PC(?:\s+[A-Z])?\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)\b/gi;

    const matches = [...text.matchAll(rowPattern)];
    const itemsList: {
      date: string;
      item: string;
      sourceFile: string;
      total: number;
    }[] = [];

    for (const match of matches) {
      const [, , name, qty, price] = match;
      let cleanName = titleCase(name.trim());
      const q = parseFloat(qty);
      if (q > 1) {
        const qtyLabel = Number.isInteger(q) ? q.toString() : q.toString();
        cleanName = `${cleanName} (${qtyLabel})`;
      }
      itemsList.push({
        date: dateStr,
        item: cleanName,
        sourceFile: file.name,
        total: parseFloat(price),
      });
    }

    if (itemsList.length === 0) {
      // Fallback if no structured table rows found
      const itemMatch = text.match(/Item Name.*?Total\s+\d+\s+(.+?)\s+\d+\s+1\.0PC\b/i);
      let fallbackItem = itemMatch ? titleCase(itemMatch[1].trim()) : file.name.replace(/\.[^/.]+$/, "");
      fallbackItem = fallbackItem.replace(/\s*\d+\s*$/, "");

      const totalMatches = [...text.matchAll(/Total Invoice Amount(?: After Tax)?\s*(\d+(?:\.\d{1,2})?)/gi)];
      const grandTotal = totalMatches.length > 0 ? parseFloat(totalMatches[totalMatches.length - 1][1]) : 0.0;

      itemsList.push({
        date: dateStr,
        item: fallbackItem,
        sourceFile: file.name,
        total: grandTotal,
      });
    }

    return NextResponse.json(itemsList);
  } catch (error) {
    console.error("parse-invoice error:", error);
    const message = error instanceof Error ? error.message : "could not parse invoice";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
