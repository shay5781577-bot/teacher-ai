// src/app/api/openai-test/route.ts
import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

export async function POST(req: NextRequest) {
  try {
    const { message, imageDataUrl } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing 'message' string" }),
        { status: 400 }
      );
    }

    // יצירת המודל - Gemini 2.0 Flash (מהיר ואיכותי)
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.4,
      }
    });

    // הפרומפט המדויק מLovable!
    const systemPrompt = `אתה מורה למתמטיקה מומחה ומסביר. תפקידך לפתור תרגילי מתמטיקה בעברית בצורה מפורטת וברורה.

כשאתה מקבל שאלה או תרגיל:
1. זהה את השאלה והבעיה המתמטית
2. הסבר את הגישה לפתרון
3. פתור צעד אחר צעד עם הסברים ברורים
4. הצג את התשובה הסופית בבירור

השתמש בעברית ברורה ונעימה. הוסף אימוג'ים כדי להפוך את הפתרון למעניין יותר (✓, →, 📝, 🎯).
חשוב מאוד: כתוב בעברית תקנית וברורה, עם שורות ריווח בין צעדים.`;

    // בניית התוכן
    const contentParts: any[] = [
      systemPrompt + "\n\n" + message
    ];

    // אם יש תמונה - נוסיף אותה
    if (imageDataUrl && typeof imageDataUrl === "string") {
      contentParts.push(dataUrlToGeminiFormat(imageDataUrl));
    }

    // קריאה ל-Gemini
    const result = await model.generateContent(contentParts);
    const response = await result.response;
    const reply = response.text();

    return Response.json({ ok: true, reply });
  } catch (e: any) {
    console.error("Gemini Error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "Server error" }),
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    info: "POST JSON { message: 'שאלה', imageDataUrl?: 'data:image/png;base64,...' }",
  });
}