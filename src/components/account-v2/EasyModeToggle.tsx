"use client";

import { useEffect, useState } from "react";
import { ACC_MODE_COOKIE, type AccMode } from "./mode-shared";

const STORAGE_KEY = "acc.mode";

/** ค่าเริ่มต้นเมื่อ "ยังไม่เคยเลือก" = โหมดนักบัญชี — ภาพที่อนุมัติ (g1/g5/g17) วาดโหมดเต็มทุกใบ */
export const DEFAULT_ACC_MODE: AccMode = "accountant";

/** ค่าที่ผู้ใช้เคยเลือกไว้ใน localStorage — `null` = ยังไม่เคยเลือก (ห้ามตีเป็นค่า default เอง) */
function readStoredMode(): AccMode | null {
  if (typeof window === "undefined") return null;
  const ls = window.localStorage.getItem(STORAGE_KEY);
  return ls === "easy" || ls === "accountant" ? ls : null;
}

function writeMode(mode: AccMode) {
  window.localStorage.setItem(STORAGE_KEY, mode);
  // cookie ให้ server component อ่านได้ทันทีในโหลดหน้าถัดไป — path=/ ครอบทั้งแอป, ไม่ httpOnly (client ต้องอ่าน/เขียนเอง)
  document.cookie = `${ACC_MODE_COOKIE}=${mode}; path=/; max-age=31536000; SameSite=Lax`;
}

/**
 * hook อ่าน/สลับโหมดฝั่ง client — sync localStorage + cookie ให้ตรงกันเสมอ
 *
 * 🔴 `ssrMode` = ค่าที่ server อ่านจากคุกกี้ `acc_mode` แล้วส่งลงมาเป็น prop (ดู `mode.ts` + `DocEditorPage`)
 *    ต้องใช้เป็น state ตั้งต้น ไม่งั้น (ก) hydration mismatch (ข) **คุกกี้ไม่มีผลเลย** — บั๊กที่ Fable เจอ
 *    รอบ 2: สคริปต์ถ่ายภาพตั้ง `acc_mode=easy` แล้วหน้ายังเป็นโหมดนักบัญชี เพราะฝั่ง client ตัดสินเองล้วน
 *    ลำดับความสำคัญ: ผู้ใช้เคยเลือกไว้ (localStorage) > ค่าจากคุกกี้ที่ server อ่าน > ค่าเริ่มต้น
 */
export function useAccMode(ssrMode?: AccMode): [AccMode, (m: AccMode) => void] {
  const [mode, setModeState] = useState<AccMode>(ssrMode ?? DEFAULT_ACC_MODE);
  useEffect(() => {
    const stored = readStoredMode();
    setModeState(stored ?? ssrMode ?? DEFAULT_ACC_MODE);
  }, [ssrMode]);
  const setMode = (m: AccMode) => {
    setModeState(m);
    writeMode(m);
  };
  return [mode, setMode];
}

// สวิตช์ "โหมดง่าย | โหมดนักบัญชี" (BLUEPRINT-ACCOUNT-V2 §0.3-1)
export function EasyModeToggle({ ssrMode, testId }: { ssrMode?: AccMode; testId?: string }) {
  const [mode, setMode] = useAccMode(ssrMode);
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
