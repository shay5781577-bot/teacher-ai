// app/api/ocr-extract/route.ts
import { NextResponse } from "next/server";
import Tesseract from "tesseract.js";

export const runtime = "nodejs";          // אל Edge
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// כתובות CDN מפורשות כדי לא לחפש קבצים מקומיים (פותר את C:\ROOT\node_modules...)
const CDN_WORKER = "https://unpkg.com/tesseract.js@v5.0.4/dist/worker.min.js";
const CDN_CORE   = "https://unpkg.com/tesseract.js-core@v5.0.2/tesseract-core.wasm.js";
const CDN_LANGS  = "https://tessdata.projectnaptha.com/4.0.0"; // heb/eng traineddata

async function readImageFromRequest(req: Request): Promise<Uint8Array | null> {
  const ct = req.headers.get("content-type") || "";
  // JSON: { imageDataUrl }
  if (ct.includes("application/json")) {
    try {
      const body = await req.json();
      if (typeof body?.imageDataUrl === "string") {
        const m = body.imageDataUrl.match(/^data:(.+?);base64,(.*)$/);
        if (!m) return null;
        return new Uint8Array(Buffer.from(m[2], "base64"));
      }
    } catch {}
  }
  // FormData: file
  if (ct.includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const file = form.get("file");
      if (file && typeof (file as File).arrayBuffer === "function") {
        const ab = await (file as File).arrayBuffer();
        return new Uint8Array(ab);
      }
    } catch {}
  }
  return null;
}

export async function GET() {
  return NextResponse.json({ ok: true, ocr: "tesseract.js", lang: "heb+eng", source: "cdn" });
}

export async function POST(req: Request) {
  try {
    const bytes = await readImageFromRequest(req);
    if (!bytes) {
      return NextResponse.json({ ok: false, error: "no image data" }, { status: 400 });
    }

// ממירים Uint8Array ל-Buffer כדי להתאים להרצה ב-Node
const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

// טיפוסי TS של tesseract לא מקבלים Buffer, אבל בפועל זה נתמך.
// לכן אנחנו משקיטים את השגיאה של TS בלבד.
 // @ts-expect-error tesseract accepts Buffer at runtime
const { data } = await Tesseract.recognize(input as any, "heb+eng", {
  workerPath: CDN_WORKER,
  corePath:   CDN_CORE,
  langPath:   CDN_LANGS,
  logger:     () => {},
});


    const text = (data?.text || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();

    return NextResponse.json({
      ok: true,
      text,
      draft: { problem: text },
      confidence: data?.confidence ?? null,
      lang: data?.language ?? "heb+eng",
      source: "cdn",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ocr failed" }, { status: 500 });
  }
}
