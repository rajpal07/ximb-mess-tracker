import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  let tempPath = "";

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing file" }, { status: 400 });
    }

    tempPath = path.join(
      os.tmpdir(),
      `mess-tracker-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`,
    );
    await fs.writeFile(tempPath, new Uint8Array(await file.arrayBuffer()));

    const scriptPath = path.join(process.cwd(), "scripts", "parse_invoice.py");
    const { stdout } = await execFileAsync("python", [scriptPath, tempPath], {
      windowsHide: true,
    });
    const parsed = JSON.parse(stdout);

    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "could not parse invoice";
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    if (tempPath) {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }
}
