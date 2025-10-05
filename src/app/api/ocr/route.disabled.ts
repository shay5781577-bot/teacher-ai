// @ts-nocheck

export const runtime = 'nodejs';

export async function GET() {
  return new Response('OK', { status: 200 });
}

export async function POST() {
  // נטרלי: ה-OCR האמיתי בנתיב /api/ocr-extract
  return new Response(JSON.stringify({ ok: true, note: 'use /api/ocr-extract' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
