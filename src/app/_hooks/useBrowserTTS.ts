// src/app/_hooks/useBrowserTTS.ts
"use client";

import { useEffect, useRef, useState } from "react";

export function useBrowserTTS() {
  const synthRef = useRef<typeof window.speechSynthesis | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [rate, setRate] = useState(0.95);   // קצב דיבור
  const [pitch, setPitch] = useState(1.0);  // גובה קול
  const [volume, setVolume] = useState(1.0);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setEnabled(false);
      return;
    }
    synthRef.current = window.speechSynthesis;

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const pickHebVoice = () => {
    // ננסה עברית אם קיימת, אחרת גיבוי כלשהו
    const heb = voices.find(v => v.lang?.toLowerCase().startsWith("he"));
    return heb ?? voices[0] ?? null;
  };

  function speak(text: string) {
    if (!enabled) return;
    if (!synthRef.current || !("SpeechSynthesisUtterance" in window)) return;
    const clean = (text || "").trim();
    if (!clean) return;

    // עצירה של הקראה קודמת אם יש
    synthRef.current.cancel();

    const u = new SpeechSynthesisUtterance(clean);
    const v = pickHebVoice();
    if (v) u.voice = v;

    u.rate = rate;
    u.pitch = pitch;
    u.volume = volume;

    u.onstart = () => setIsSpeaking(true);
    u.onend = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);

    synthRef.current.speak(u);
  }

  function stop() {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  }

  return {
    // פעולות
    speak,
    stop,
    // מצבים
    isSpeaking,
    enabled,
    setEnabled,
    // פרמטרים
    rate,
    setRate,
    pitch,
    setPitch,
    volume,
    setVolume,
    hasAPI: typeof window !== "undefined" && "speechSynthesis" in window,
  };
}
