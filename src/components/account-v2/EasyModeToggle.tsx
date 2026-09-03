"use client";

import { useEffect, useState } from "react";
import { ACC_MODE_COOKIE, type AccMode } from "./mode-shared";

const STORAGE_KEY = "acc.mode";

/** ค่าเริ่มต้น = โหมดนักบัญชี (ยังไม่เคยเลือก) — ภาพที่อนุมัติ (g1/g5/g17) วาดโหมดเต็มทุกใบ
 *  ผู้ใช้สลับไป "โหมดง่าย" เองได้ และค่าที่เลือกอยู่ยาว (localStorage + cookie) */
function readInitialMode(): AccMode {
  if (typeof window === "undefined") return "accountant";
  const ls = window.localStorage.getItem(STORAGE_KEY);
  return ls === "easy" ? "easy" : "accountant";
}

function writeMode(mode: AccMode) {
  window.localStorage.setItem(STORAGE_KEY, mode);
  // cookie ให้ server component อ่านได้ทันทีในโหลดหน้าถัดไป — path=/ ครอบทั้งแอป, ไม่ httpOnly (client ต้องอ่าน/เขียนเอง)
  document.cookie = `${ACC_MODE_COOKIE}=${mode}; path=/; max-age=31536000; SameSite=Lax`;
}

/** hook อ่าน/สลับโหมดฝั่ง client — sync localStorage + cookie ให้ตรงกันเสมอ */
export function useAccMode(): [AccMode, (m: AccMode) => void] {
  const [mode, setModeState] = useState<AccMode>(readInitialMode);
  useEffect(() => setModeState(readInitialMode()), []);
  const setMode = (m: AccMode) => {
    setModeState(m);
    writeMode(m);
  };
  return [mode, setMode];
}

// สวิตช์ "โหมดง่าย | โหมดนักบัญชี" (BLUEPRINT-ACCOUNT-V2 §0.3-1)
export function EasyModeToggle({ testId }: { testId?: string }) {
  const [mode, setMode] = useAccMode();
  return (
    <div
      role="radiogroup"
      aria-label="โหมดการใช้งาน"
      className="inline-flex overflow-hidden rounded-lg border text-sm"
      data-testid={testId}
    >
      {(["easy", "accountant"] as AccMode[]).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className="px-3 py-2"
          style={mode === m ? { background: "var(--color-ink)", color: "var(--color-surface)" } : undefined}
          onClick={() => setMode(m)}
        >
          {m === "easy" ? "โหมดง่าย" : "โหมดนักบัญชี"}
        </button>
      ))}
    </div>
  );
}

export default EasyModeToggle;
