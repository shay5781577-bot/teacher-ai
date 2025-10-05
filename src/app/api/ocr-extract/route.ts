// src/app/api/ocr-extract/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function readImageFromRequest(req: Request) {
  const ct = req.headers.get("content-type") || "";

  if (ct.includes("application/json")) {
    try {
      const body = await req.json();
      if (typeof body?.imageDataUrl === "string") {
        return { dataUrl: body.imageDataUrl };
      }
    } catch {}
  }

  return { dataUrl: null };
}

// המרה מ-data URL ל-format שGemini מבין
function dataUrlToGeminiFormat(dataUrl: string) {
  const base64Data = dataUrl.split(",")[1];
  const mimeType = dataUrl.split(";")[0].split(":")[1];
  
  return {
    inlineData: {
      data: base64Data,
      mimeType: mimeType,
    },
  };
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    const { dataUrl } = await readImageFromRequest(req);
    if (!dataUrl) {
      return NextResponse.json(
        { ok: false, error: "no image data" },
        { status: 400 }
      );
    }

    // יצירת המודל - Gemini 2.0 Flash (החדש והמהיר ביותר!)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // הכנת הפרומפט והתמונה
    const prompt = `קרא בקפידה את הטקסט המתמטי שכתוב בתמונה זו.
זו תמונה של תרגיל מתמטיקה או שאלה.

חשוב מאוד:
1. החזר את הטקסט המדויק בעברית
2. שמור על כל הסימנים המתמטיים: +, -, ×, ÷, =, √, ≥, ≤
3. שמור על כל המספרים והמשתנים (x, y, z וכו')
4. אל תוסיף הסברים או טקסט נוסף
5. התעלם מכל טקסט של ממשק משתמש או כפתורים
6. אם יש משוואות - כתוב אותן בדיוק כמו שהן`;

    const imagePart = dataUrlToGeminiFormat(dataUrl);

    // קריאה ל-Gemini
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text().trim();

    return NextResponse.json({
      ok: true,
      text,
      draft: { problem: text },
    });
  } catch (e: any) {
    console.error("Gemini OCR Error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Gemini error" },
      { status: 500 }
    );
  }
}