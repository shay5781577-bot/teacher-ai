"use client";

import React, { useState } from "react";
import { Mic, Upload, X } from "lucide-react";

type ChatMsg = {
  type: "user" | "ai";
  text: string;
  image?: string;
  isLoading?: boolean;
};

// ====== Math spacing helpers ======
function tokenize(line: string) {
  return (
    line.match(/[\u0590-\u05FF]+|[A-Za-z]+|\d+|[=+\-*/^()]+|\s+/g) || [line]
  );
}

function renderWithMathSpacing(line: string) {
  const tokens = tokenize(line);
  return tokens.map((tok, i) => {
    const isSpace = /^\s+$/.test(tok);
    const isMath =
      /^[A-Za-z]+$/.test(tok) ||
      /^\d+$/.test(tok) ||
      /^[=+\-*/^()]+$/.test(tok);

    if (isSpace) return " ";

    if (isMath) {
      return (
        <span
          key={i}
          style={{
            display: "inline-block",
            marginInline: 6,
            letterSpacing: "0.5px",
            direction: "ltr",
            unicodeBidi: "isolate",
          }}
        >
          {tok}
        </span>
      );
    }

    return <span key={i}>{tok}</span>;
  });
}
// ====== END Math spacing helpers ======

export default function AITeacherPlatform() {
  const [currentPage, setCurrentPage] = useState<"login" | "selectMode" | "chat">("login");
  const [userInfo, setUserInfo] = useState({
    firstName: "",
    lastName: "",
    schoolName: "",
    city: "",
    grade: "",
  });
  const [selectedMode, setSelectedMode] = useState<"" | "private" | "homework" | "practice">("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  // ✅ תמונה בתצוגה מקדימה - עדיין לא נשלחה
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewImageDataUrl, setPreviewImageDataUrl] = useState<string | null>(null);

  const handleRegister = () => {
    if (
      userInfo.firstName &&
      userInfo.lastName &&
      userInfo.schoolName &&
      userInfo.city &&
      userInfo.grade
    ) {
      setCurrentPage("selectMode");
    }
  };

  const handleModeSelect = (mode: "private" | "homework" | "practice") => {
    setSelectedMode(mode);
    setCurrentPage("chat");

    const welcomeText = `שלום ${userInfo.firstName}! אני כאן לעזור לך. ${
      mode === "private"
        ? "בואו נתחיל בשיעור פרטי!"
        : mode === "homework"
        ? "מה השיעורי בית שאתה צריך עזרה איתם?"
        : "בואו נתרגל ביחד!"
    }`;

    setMessages([{ type: "ai", text: welcomeText }]);
  };

  // ── שליחת הודעה ──
  const handleSendMessage = async () => {
    const text = (inputText || "").trim();
    const hasImage = !!previewImageDataUrl;
    
    // אם אין טקסט ואין תמונה - לא שולחים
    if (!text && !hasImage) return;

    // בדיקה אם המשתמש כתב בקשה ספציפית (יותר מ-5 תווים)
    const hasSpecificRequest = text.length > 5;

    // הודעת המשתמש
    const userMessage: ChatMsg = {
      type: "user",
      text: text || "📸 תמונה",
      image: hasImage ? previewImage! : undefined,
    };

    // מנקים את שדה הקלט והתמונה
    setInputText("");
    setPreviewImage(null);
    
    const messagesToAdd: ChatMsg[] = [userMessage];

    // אם יש תמונה אבל אין בקשה ספציפית - נוסיף הודעת הסבר
    if (hasImage && !hasSpecificRequest) {
      messagesToAdd.push({
        type: "ai",
        text: "✅ התמונה הועלתה. עכשיו אפשר לכתוב: \"ענה על סעיף א\" או כל בקשה לפתרון.",
      });
      setMessages((prev) => [...prev, ...messagesToAdd]);
      setPreviewImageDataUrl(null); // מנקים את התמונה
      return; // לא שולחים ל-API עדיין
    }

    // אם יש בקשה ספציפית - מוסיפים הודעת טעינה ושולחים ל-API
    messagesToAdd.push({ type: "ai", text: "⏳ פותר את הבעיה...", isLoading: true });
    setMessages((prev) => [...prev, ...messagesToAdd]);

    try {
      const endpoint = "/api/openai-test";
      const payload: Record<string, any> = { message: text };
      if (previewImageDataUrl) payload.imageDataUrl = previewImageDataUrl;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const reply = data?.reply || "אופס! משהו השתבש";

      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { type: "ai", text: String(reply) };
        return next;
      });
    } catch (err: any) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          type: "ai",
          text: `❌ שגיאה בחיבור: ${err?.message || err}`,
        };
        return next;
      });
    }
    
    // איפוס התמונה אחרי השליחה
    setPreviewImageDataUrl(null);
  };

  function fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ✅ העלאת תמונה - רק תצוגה מקדימה, לא שולחים עדיין
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // תצוגה מקומית
      const localUrl = URL.createObjectURL(file);
      setPreviewImage(localUrl);

      // המרה ל-dataURL לשליחה עתידית
      const dataUrl = await fileToDataURL(file);
      setPreviewImageDataUrl(dataUrl);
    } catch (err) {
      alert("❌ שגיאה בהעלאת התמונה. נסה שוב.");
    } finally {
      e.target.value = "";
    }
  };

  const toggleRecording = () => {
    setIsRecording((x) => !x);
    if (!isRecording) {
      setTimeout(() => {
        setIsRecording(false);
        setMessages((prev) => [...prev, { type: "user", text: "🎤 הקלטה קולית" }]);
      }, 1500);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ====== עיבוד טקסט + ריווח מתמטי ======
  const formatText = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // כותרת ראשית
      if (trimmed.startsWith("#")) {
        return (
          <div key={idx} className="mb-4 mt-2">
            <div className="text-2xl font-bold text-blue-900 border-b-2 border-blue-400 pb-2 inline-block">
              {trimmed.replace(/^#+\s*/, "")}
            </div>
          </div>
        );
      }

      // תשובה סופית - הדגשה בצהוב כמו מרקר
      if (trimmed.startsWith("✓")) {
        return (
          <div key={idx} className="my-4 py-3 px-4 rounded-lg" style={{ backgroundColor: "#fef08a" }}>
            <div className="text-2xl font-bold text-gray-900">
              {renderWithMathSpacing(trimmed)}
            </div>
          </div>
        );
      }

      // כותרת שלב (שלב 1, שלב 2...)
      if (/^שלב\s+\d+:/i.test(trimmed)) {
        return (
          <div key={idx} className="mt-4 mb-2">
            <div className="text-lg font-bold text-purple-700">
              {renderWithMathSpacing(trimmed)}
            </div>
          </div>
        );
      }

      // כותרות אחרות (עם נקודותיים)
      if (trimmed.includes(":") && trimmed.length < 60) {
        return (
          <div key={idx} className="mt-3 mb-2">
            <div className="text-lg font-semibold text-gray-800">
              {renderWithMathSpacing(trimmed)}
            </div>
          </div>
        );
      }

      // טקסט רגיל
      return trimmed ? (
        <div key={idx} className="my-1 text-gray-800 text-base leading-relaxed">
          {renderWithMathSpacing(line)}
        </div>
      ) : (
        <div key={idx} className="h-2" />
      );
    });
  };
  // ====== END ======

  // ====== UI ======
  if (currentPage === "login") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md border-2 border-gray-200">
          <div className="text-center mb-8">
            <div className="bg-slate-700 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">📚</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">מורה דיגיטלי AI</h1>
            <p className="text-gray-600">הפלטפורמה החכמה ללמידה אישית</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 text-right">שם פרטי</label>
                <input
                  type="text"
                  value={userInfo.firstName}
                  onChange={(e) => setUserInfo({ ...userInfo, firstName: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-slate-600 focus:outline-none text-right"
                  placeholder="שם"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 text-right">שם משפחה</label>
                <input
                  type="text"
                  value={userInfo.lastName}
                  onChange={(e) => setUserInfo({ ...userInfo, lastName: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-slate-600 focus:outline-none text-right"
                  placeholder="משפחה"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-right">🏫 שם בית הספר</label>
              <input
                type="text"
                value={userInfo.schoolName}
                onChange={(e) => setUserInfo({ ...userInfo, schoolName: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-slate-600 focus:outline-none text-right"
                placeholder="בית הספר שלי"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-right">📍 עיר מגורים</label>
              <input
                type="text"
                value={userInfo.city}
                onChange={(e) => setUserInfo({ ...userInfo, city: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-slate-600 focus:outline-none text-right"
                placeholder="העיר שלי"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 text-right">כיתה</label>
              <select
                value={userInfo.grade}
                onChange={(e) => setUserInfo({ ...userInfo, grade: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-slate-600 focus:outline-none text-right"
              >
                <option value="">בחר כיתה</option>
                <option value="ז">ז'</option>
                <option value="ח">ח'</option>
                <option value="ט">ט'</option>
                <option value="י">י'</option>
                <option value="יא">יא'</option>
                <option value="יב">יב'</option>
              </select>
            </div>

            <button
              onClick={handleRegister}
              className="w-full bg-slate-700 text-white py-4 rounded-xl font-semibold hover:bg-slate-800 transform hover:scale-105 transition-all duration-200"
            >
              התחל ללמוד! 🚀
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentPage === "selectMode") {
    const modes: { id: "private" | "homework" | "practice"; icon: string; title: string; desc: string }[] = [
      { id: "private", icon: "👤", title: "שיעור פרטי", desc: "למידה אישית עם מורה AI" },
      { id: "homework", icon: "📚", title: "עזרה בשיעורי בית", desc: "פתרון תרגילים צעד אחר צעד" },
      { id: "practice", icon: "🎯", title: "תרגולים", desc: "אימון ושיפור מיומנויות" },
    ];

    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">שלום {userInfo.firstName}! 👋</h1>
            <p className="text-xl text-gray-600">במה אוכל לעזור לך היום?</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => handleModeSelect(mode.id)}
                className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transform hover:scale-105 transition-all duration-300 text-center group border-2 border-gray-200"
              >
                <div className="bg-slate-700 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform text-4xl">
                  {mode.icon}
                </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-3">{mode.title}</h3>
                <p className="text-gray-600">{mode.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #e5e7eb 1px, transparent 1px),
            linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px",
          backgroundColor: "#fafafa",
        }}
      />

      <div className="bg-slate-700 shadow-lg p-4 relative z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setCurrentPage("selectMode")}
            className="text-white hover:text-gray-200 flex items-center gap-2 transition-all font-medium px-4 py-2 rounded-lg hover:bg-slate-600"
          >
            ← חזור
          </button>

          <div className="text-center">
            <h2 className="text-xl font-bold text-white">
              {selectedMode === "private"
                ? "📚 שיעור פרטי"
                : selectedMode === "homework"
                ? "📝 עזרה בשיעורי בית"
                : "🎯 תרגולים"}
            </h2>
            <p className="text-sm text-gray-300">
              {userInfo.firstName} | כיתה {userInfo.grade}
            </p>
          </div>

          <button
            onClick={toggleRecording}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
              isRecording ? "bg-red-500 text-white animate-pulse" : "bg-slate-600 text-white hover:bg-slate-500"
            }`}
          >
            <Mic size={16} />
            {isRecording ? "מקליט..." : "הקלט"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 relative z-10">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.type === "user" ? "justify-start" : "justify-end"}`}>
            {msg.type === "user" ? (
              <div className="max-w-2xl">
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="uploaded"
                    className="rounded-lg mb-3 max-w-md border-2 border-gray-300 shadow-md"
                  />
                )}
                <div
                  className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 shadow-md"
                  style={{
                    fontFamily: "'Segoe Print', 'Bradley Hand', cursive",
                    fontSize: "18px",
                    lineHeight: "1.9",
                    color: "#1e3a8a",
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl p-6">
                <div
                  style={{
                    fontFamily: "'Rubik', 'Heebo', 'Assistant', sans-serif",
                    fontSize: "17px",
                    lineHeight: "1.8",
                    color: "#1f2937",
                    direction: "rtl",
                  }}
                >
                  {formatText(msg.text)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white border-t-4 border-slate-700 p-5 shadow-2xl relative z-10">
        <div className="max-w-4xl mx-auto">
          {/* תצוגה מקצועית של תמונה שהועלתה */}
          {previewImage && (
            <div className="mb-4 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-2xl p-4 shadow-lg">
              <div className="flex items-start gap-4">
                {/* אייקון V ירוק */}
                <div className="flex-shrink-0">
                  <div className="bg-green-500 rounded-full w-12 h-12 flex items-center justify-center shadow-md">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                </div>

                {/* תצוגה מוקטנת של התמונה */}
                <div className="flex-grow">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm text-gray-700">עכשיו תוכל לכתוב את השאלה ולשלוח הכל ביחד</p>
                    </div>
                    <button
                      onClick={() => {
                        setPreviewImage(null);
                        setPreviewImageDataUrl(null);
                      }}
                      className="bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-all shadow-md font-bold"
                      title="הסר תמונה"
                    >
                      ✕
                    </button>
                  </div>
                  
                  {/* תמונה מוקטנת */}
                  <div className="relative inline-block">
                    <img
                      src={previewImage}
                      alt="preview"
                      className="rounded-xl max-h-28 border-2 border-white shadow-lg hover:scale-105 transition-transform cursor-pointer"
                    />
                    <div className="absolute top-1 left-1 bg-green-500 text-white text-xs px-2 py-1 rounded-md font-semibold shadow">
                      📎 מצורף
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() && !previewImageDataUrl}
              className="bg-slate-700 text-white px-6 py-3 rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-lg font-semibold shadow-lg"
            >
              שלח
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="כתוב שאלה או העלה תמונה..."
              className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-xl focus:border-slate-600 focus:outline-none text-right text-lg shadow-sm"
              style={{ fontFamily: "'Segoe Print', 'Bradley Hand', cursive" }}
            />

            <label className="bg-slate-700 text-white px-4 py-3 rounded-xl hover:bg-slate-800 cursor-pointer transition-all flex items-center gap-2 shadow-lg">
              <Upload size={18} />
              <span className="hidden sm:inline">תמונה</span>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>

          <p className="text-center text-sm text-gray-500 mt-3">
            💡 העלה תמונה, כתוב "ענה על סעיף א", ושלח הכל ביחד!
          </p>
        </div>
      </div>
    </div>
  );
}