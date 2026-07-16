import { NextResponse } from "next/server";
import { parseInvoicePdf } from "@/app/utils/invoiceParser";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const itemsList = await parseInvoicePdf(new Uint8Array(arrayBuffer), file.name);

    return NextResponse.json(itemsList);
  } catch (error) {
    console.error("parse-invoice error:", error);
    const message = error instanceof Error ? error.message : "could not parse invoice";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
