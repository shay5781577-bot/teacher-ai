// @ts-nocheck
import { NextResponse } from 'next/server';

// ---- 1) תצורה כללית ----
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ---- 2) בחירת מנוע OCR: Production => Gemini, Local => Tesseract ----
const IS_VERCEL = !!process.env.VERCEL;
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

let useGemini = false;
if (IS_VERCEL && GEMINI_KEY) useGemini = true;

// ---- 3) קריאת תמונה מהבקשה (imageUrl או imageDataUrl או multipart) ----
async function readBytesOrDataUrl(req: Request): Promise<{ bytes?: Uint8Array; dataUrl?: string } | null> {
  const ct = req.headers.get('content-type') || '';
  // JSON
  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => null as any);
    if (!body) return null;
    if (typeof body.imageDataUrl === 'string') return { dataUrl: body.imageDataUrl };
    if (typeof body.imageUrl === 'string') {
      const res = await fetch(body.imageUrl);
      const ab = await res.arrayBuffer();
      return { bytes: new Uint8Array(ab) };
    }
  }
  // Multipart
  if (ct.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null as any);
    const file = form?.get('file') as File | null;
    if (file && typeof file.arrayBuffer === 'function') {
      const ab = await file.arrayBuffer();
      return { bytes: new Uint8Array(ab) };
    }
  }
  return null;
}

// ---- 4) ממירים ל-dataURL אם צריך (ל־Gemini) ----
function bytesToDataUrl(bytes: Uint8Array, mime = 'image/png'): string {
  const b64 = Buffer.from(bytes).toString('base64');
  return `data:${mime};base64,${b64}`;
}
function dataUrlToGeminiPart(dataUrl: string) {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.split(':')[1]?.split(';')[0] || 'image/png';
  return { inlineData: { data: b64, mimeType: mime } };
}

// ---- 5) Tesseract (לוקאלי בלבד) ----
const CDN_WORKER = 'https://unpkg.com/tesseract.js@v5.0.4/dist/worker.min.js';
const CDN_CORE   = 'https://unpkg.com/tesseract.js-core@v5.0.2/tesseract-core.wasm.js';
const CDN_LANGS  = 'https://tessdata.projectnaptha.com/4.0.0';

// ---- 6) Gemini (Production) ----
async function geminiOcr(dataUrl: string) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  const prompt = `קרא במדויק את הטקסט המתמטי מהתמונה והחזר אותו כפי שהוא (עברית, סימנים, מספרים), ללא הסברים.`;
  const img = dataUrlToGeminiPart(dataUrl);
  const result = await model.generateContent([prompt, img]);
  const text = result.response.text().trim();
  return { text, engine: 'gemini' as const };
}

export async function GET() {
  return NextResponse.json({ ok: true, engine: useGemini ? 'gemini' : 'tesseract' });
}

export async function POST(req: Request) {
  try {
    const parsed = await readBytesOrDataUrl(req);
    if (!parsed) return NextResponse.json({ ok: false, error: 'no image data' }, { status: 400 });

    // Production (Vercel) => Gemini
    if (useGemini) {
      const dataUrl = parsed.dataUrl ?? bytesToDataUrl(parsed.bytes!);
      const { text } = await geminiOcr(dataUrl);
      return NextResponse.json({ ok: true, text, engine: 'gemini' });
    }

    // Local dev => Tesseract
    const Tesseract = (await import('tesseract.js')).default;
    const bytes = parsed.bytes ?? Buffer.from(parsed.dataUrl!.split(',')[1], 'base64');

    // @ts-ignore  — tesseract מקבל Buffer בזמן ריצה
    const { data } = await (Tesseract as any).recognize(
      Buffer.from(bytes),
      'heb+eng',
      { workerPath: CDN_WORKER, corePath: CDN_CORE, langPath: CDN_LANGS, logger: () => {} }
    );

    const text = (data?.text || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    return NextResponse.json({ ok: true, text, engine: 'tesseract' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'ocr failed' }, { status: 500 });
  }
}
