// Diagnostic: show what the parser actually sees in one invoice PDF.
// Run: node --experimental-strip-types scripts/dump-invoice.ts path/to/invoice.pdf
import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import { parseInvoiceText } from "../app/utils/invoiceParser.ts";

const file = process.argv[2];
if (!file) {
  console.error("usage: node --experimental-strip-types scripts/dump-invoice.ts <invoice.pdf>");
  process.exit(1);
}

const pdf = await getDocumentProxy(new Uint8Array(await readFile(file)));
const { text } = await extractText(pdf, { mergePages: true });
const flat = text.split(/\s+/).join(" ");

console.log("=== RAW TEXT ===");
console.log(flat);

console.log("\n=== PRINTED INVOICE TOTAL ===");
const totals = [...flat.matchAll(/Total Invoice Amount(?: After Tax)?\s*(\d+(?:\.\d{1,2})?)/gi)];
console.log(totals.length ? totals.map((m) => m[1]).join(", ") : "NOT FOUND");

console.log("\n=== PARSED ITEMS ===");
const items = parseInvoiceText(text, file);
for (const i of items) console.log(`${i.total.toFixed(2).padStart(10)}  ${i.item}`);
console.log(`${items.reduce((s, i) => s + i.total, 0).toFixed(2).padStart(10)}  TOTAL`);
