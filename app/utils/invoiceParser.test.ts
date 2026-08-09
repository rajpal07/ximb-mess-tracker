// Run: node --experimental-strip-types --test app/utils/invoiceParser.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseInvoiceText } from "./invoiceParser.ts";

const HEADER = "Invoice Date : 12-07-2026 SNo Item Name Qty Rate Amount Disc Taxable CGST% CGST SGST% Total";

// Exactly 7 numeric columns before the total: the shape the row regex accepts.
const MATCHING_ROW = "1 COLD DRINK 2.0PC A 20.00 40.00 0.00 40.00 2.5 1.00 2.5 44.00";
// Only 3 numeric columns before the total — the row regex cannot see this line.
const UNMATCHED_ROW = "2 SAMOSA 9 1.0PC 15.00 0.00 15.00 15.76";

test("books unparsed rows against the invoice's printed total", () => {
  const items = parseInvoiceText(
    `${HEADER} ${MATCHING_ROW} ${UNMATCHED_ROW} Total Invoice Amount After Tax 59.76`,
    "invoice1.pdf",
  );

  const sum = items.reduce((acc, i) => acc + i.total, 0);
  assert.equal(Math.round(sum * 100) / 100, 59.76, "total must match the printed invoice total");
  assert.ok(
    items.some((i) => i.item === "Tax / Unparsed Items" && i.total === 15.76),
    `expected a 15.76 reconciling line, got ${JSON.stringify(items)}`,
  );
});

// Verbatim text layer of Invoice_31815_02-08-2026.pdf. The unit `BTL` arrives
// split as `BT L`, which the old PC-only pattern could not match.
const REAL_INVOICE =
  "OMM Thank You Visit Again XIMB MESS XIMB CAMPUS, BHUBANESWAR Invoice No. : 31815 " +
  "Place Of Supply : Odisha State Code : 21 Invoice Date : 02-08-2026 Details Of Receiver " +
  "SNo. Item Name HSN Code Qty MRP Unit Price Disc Amt Taxable Value GST Rate Tax Amt cess Amt Total " +
  "1 MINARAL WATER 7 1.0BT L 7.00 7.00 0.00 7.00 0.00 0.00 0.00 7.00 " +
  "Sub Total 1.000 7.00 0.00 7.00 0.00 0.00 7.00 " +
  "Total Invoice Amount in Words: Seven Rupees Only Total Amount Before Tax 7.00 " +
  "Total CGST 0.00 Total SGST/UTGST 0.00 Total IGST 0.00 Total cess 0.00 Tax Amount: GST 0.00 " +
  "Other Charges 0.00 Total Amount After Tax 7.00 Total Invoice Amount 7.00 Petty Cash Payment 7.00";

test("names the item on a bottled-unit invoice instead of falling back", () => {
  const items = parseInvoiceText(REAL_INVOICE, "Invoice_31815_02-08-2026.pdf");

  assert.deepEqual(items, [
    {
      date: "2026-08-02",
      item: "Minaral Water",
      sourceFile: "Invoice_31815_02-08-2026.pdf",
      total: 7,
    },
  ]);
});

test("adds no reconciling line when every row parses", () => {
  const items = parseInvoiceText(
    `${HEADER} ${MATCHING_ROW} Total Invoice Amount After Tax 44.00`,
    "invoice2.pdf",
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].total, 44);
  assert.equal(items[0].date, "2026-07-12");
});
