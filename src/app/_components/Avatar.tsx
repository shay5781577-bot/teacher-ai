// src/app/_components/Avatar.tsx
"use client";
import React from "react";

export function Avatar({
  speaking,
  muted,
  onToggleMute,
}: {
  speaking: boolean;
  muted?: boolean;
  onToggleMute?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow">
        <div className="relative w-8 h-8">
          {/* עיניים */}
          <div className="absolute left-1.5 top-1.5 w-2 h-2 bg-white rounded-full" />
          <div className="absolute right-1.5 top-1.5 w-2 h-2 bg-white rounded-full" />
          {/* פה */}
          <div
            className={
              "absolute left-1/2 -translate-x-1/2 bottom-1 w-5 h-1.5 bg-white rounded-full origin-center transition-all " +
              (speaking ? "scale-y-[2] animate-pulse" : "scale-y-[1]")
            }
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleMute}
        className={
          "text-sm px-2 py-1 rounded border " +
          (muted
            ? "border-red-400 text-red-600 bg-red-50"
            : "border-green-400 text-green-700 bg-green-50")
        }
        title={muted ? "מושתק" : "פעיל"}
      >
        {muted ? "מושתק" : "מדבר"}
      </button>
    </div>
  );
}
