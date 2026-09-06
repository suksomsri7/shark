// Shortcuts.tsx — ปุ่มลัดคีย์บอร์ดของหน้าบอร์ด (K1.14 · แบบ §5.6)
//
// ═══ 🔴 กติกา 3 ข้อที่ไฟล์นี้ต้องรักษา ═══
//  1. **ห้ามทำงานขณะเคอร์เซอร์อยู่ในช่องพิมพ์** — เป็นบั๊กคลาสสิกกับคีย์บอร์ดไทย: พิมพ์ชื่อการ์ด
//     แล้วตัวอักษรที่ตรงกับปุ่มลัดถูกขโมยไปสั่งงานแทน · guard ครอบทั้ง INPUT/TEXTAREA/SELECT และ
//     ทุก element ที่ `isContentEditable`
//  2. **ห้ามทำงานขณะ IME กำลังประกอบตัวอักษร** — คนพิมพ์ไทย/ญี่ปุ่น/จีนใช้ IME ระหว่างประกอบคำ
//     เบราว์เซอร์ยิง keydown ที่มี `isComposing = true` (หรือ `keyCode === 229` ในเบราว์เซอร์รุ่นเก่า)
//     ⇒ ทิ้งทั้งหมด · ตรวจ **ทั้งสองแบบ** เพราะ Safari/Android รุ่นเก่ายังไม่ตั้ง `isComposing`
//  3. **ปิดได้ทั้งชุด** — `enabled` มาจาก user preference `kanbanShortcuts`
//     (`src/lib/modules/kanban/preferences.ts` · สวิตช์อยู่ `/app/settings/preferences`)
//     จำเป็นสำหรับคนใช้โปรแกรมอ่านหน้าจอ — ปิดแล้วต้องไม่มีตัวฟังคีย์ค้างอยู่เลย
//
// ปุ่มลัดตัวจริงถูก "แปล" เป็นคำสั่ง (`ShortcutCommand`) แล้วส่งกลับให้ `BoardView` ตัดสินใจ —
// ไฟล์นี้ไม่รู้จักการ์ด/คอลัมน์เลย (ทดสอบง่ายกว่า และ BoardView คือที่เดียวที่ถือ state ของบอร์ด)

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KanbanIcon } from "./KanbanIcon";

export type ShortcutCommand =
  | "help" // ?
  | "boards" // b — ตัวสลับบอร์ด
  | "filter" // f
  | "filter-clear" // x
  | "new-card" // n
  | "rename-card" // t
  | "due" // d
  | "labels" // l
  | "archive-card" // c
  | "card-next" // j / ArrowDown
  | "card-prev" // k / ArrowUp
  | "undo" // z
  | "search" // Ctrl/⌘ K
  | "escape" // Esc
  | "move-left" // Shift + ←
  | "move-right" // Shift + →
  | "go-inbox" // g แล้ว i
  | "go-my-tasks" // g แล้ว t
  | "go-boards"; // g แล้ว b

/** เวลาที่รอปุ่มตัวที่สองของชุด `g` (Trello ใช้ท่านี้: กด g แล้วตามด้วย i/t/b) */
const G_CHORD_MS = 1500;

/** ตารางที่โชว์ในหน้า `?` — ข้อความไทยตรงตามแบบ §5.6 */
const HELP_ROWS: { keys: string; what: string }[] = [
  { keys: "?", what: "เปิดรายการปุ่มลัด" },
  { keys: "b", what: "ตัวสลับบอร์ด" },
  { keys: "f / x", what: "เปิดตัวกรอง / ล้างตัวกรอง" },
  { keys: "n", what: "สร้างการ์ดใต้การ์ดที่ชี้อยู่" },
  { keys: "t", what: "แก้ชื่อการ์ด" },
  { keys: "d", what: "ตั้งกำหนดส่ง" },
  { keys: "l", what: "เมนูป้ายกำกับ" },
  { keys: "c", what: "เก็บการ์ดเข้าคลัง" },
  { keys: "j / k", what: "เลื่อนเลือกการ์ดลง / ขึ้น" },
  { keys: "Shift + ← / →", what: "ย้ายการ์ดที่เลือกข้ามคอลัมน์" },
  { keys: "z", what: "ย้อนการกระทำล่าสุด (5 วินาที)" },
  { keys: "Ctrl / ⌘ + K", what: "ค้นหาข้ามบอร์ด" },
  { keys: "g แล้ว i / t / b", what: "ไปกล่องงานเข้า / งานของฉัน / บอร์ด" },
  { keys: "Esc", what: "ปิดหลังการ์ดหรือแผงที่เปิดอยู่" },
];

/**
 * true = เหตุการณ์นี้ต้อง "ปล่อยผ่าน" ไม่ใช่ปุ่มลัด
 * 🔴 อ่าน `e.target` **และ** `document.activeElement` — บางเบราว์เซอร์ยิง keydown ที่ target เป็น body
 *    ทั้งที่โฟกัสอยู่ในช่องพิมพ์ (เช่นตอน IME เปิดอยู่)
 */
function inTypingContext(e: KeyboardEvent): boolean {
  // ── IME: ระหว่างประกอบคำ ห้ามตีความเป็นคำสั่ง (ทั้งมาตรฐานใหม่และรหัสเก่า 229) ──
  if (e.isComposing || e.keyCode === 229) return true;
  const nodes = [e.target, typeof document !== "undefined" ? document.activeElement : null];
  for (const node of nodes) {
    if (!node || !(node instanceof HTMLElement)) continue;
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    // contenteditable (กล่องเขียนความเห็น/รายละเอียดในอนาคต)
    if (node.isContentEditable || node.getAttribute("contenteditable") === "true") return true;
  }
  return false;
}

export function Shortcuts({
  enabled,
  onCommand,
}: {
  /** อ่านจาก user preference `kanbanShortcuts` — false = ไม่ผูกตัวฟังคีย์เลย */
  enabled: boolean;
  onCommand: (command: ShortcutCommand) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;
  /** เพิ่งกด `g` ไปเมื่อไหร่ (0 = ไม่ได้อยู่ในชุด) */
  const gAt = useRef(0);

  const run = useCallback((command: ShortcutCommand) => {
    if (command === "help") {
      setHelpOpen((o) => !o);
      return;
    }
    commandRef.current(command);
  }, []);

  useEffect(() => {
    // 🔴 ปิดปุ่มลัด = ไม่ผูกตัวฟังเลย (ไม่ใช่ผูกแล้ว return ข้างใน) — คนที่ปิดคือคนที่ต้องการให้
    //    คีย์บอร์ดเป็นของโปรแกรมอ่านหน้าจอล้วน ๆ
    if (!enabled || typeof window === "undefined") return;

    const onKeyDown = (e: KeyboardEvent) => {
      // 🔴 มีคนจัดการปุ่มนี้ไปแล้ว (การ์ดที่โฟกัสอยู่ · หลังการ์ด · แผงค้นหา ⌘K) = จบตรงนี้
      //    ตัวฟังของเราอยู่ที่ `window` ซึ่งเป็นปลายทางสุดท้ายของ bubble ⇒ handler ของ React
      //    ที่อยู่ใกล้ต้นทางกว่าได้ทำงานไปก่อนแล้วเสมอ · ไม่เช็คตรงนี้ = Shift+← ย้ายการ์ด 2 ครั้ง
      if (e.defaultPrevented) return;

      // Esc ต้องทำงานแม้อยู่ในช่องพิมพ์ (ปิดแผง/เลิกแก้) — เป็นข้อยกเว้นเดียวของ guard
      if (e.key === "Escape") {
        gAt.current = 0;
        if (helpOpen) {
          setHelpOpen(false);
          e.preventDefault();
          return;
        }
        run("escape");
        return;
      }

      // Ctrl/⌘ K ทำงานได้ทุกที่ (มาตรฐานเว็บสมัยนี้) — ยกเว้นตอน IME กำลังประกอบคำ
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (e.isComposing || e.keyCode === 229) return;
        // `SearchPalette` ผูก ⌘K ของตัวเองอยู่แล้ว — ที่นี่ไม่ preventDefault ซ้ำ ปล่อยให้ตัวนั้นทำงาน
        run("search");
        return;
      }

      // ── guard หลัก (ข้อ 1–2 ที่หัวไฟล์) ──
      if (inTypingContext(e)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return; // คีย์ผสมของระบบ/เบราว์เซอร์ ไม่ใช่ของเรา

      // ── Shift + ลูกศรซ้าย/ขวา = ย้ายการ์ดที่เลือกข้ามคอลัมน์ (ของเรา · เข้าถึงได้ด้วยคีย์บอร์ดล้วน) ──
      if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        run(e.key === "ArrowLeft" ? "move-left" : "move-right");
        return;
      }

      // ── ชุด `g` แล้ว i/t/b ──
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (gAt.current > 0 && Date.now() - gAt.current <= G_CHORD_MS) {
        gAt.current = 0;
        if (key === "i") {
          e.preventDefault();
          run("go-inbox");
          return;
        }
        if (key === "t") {
          e.preventDefault();
          run("go-my-tasks");
          return;
        }
        if (key === "b") {
          e.preventDefault();
          run("go-boards");
          return;
        }
        // ตัวที่สองไม่ใช่ i/t/b → ตกลงมาให้ตีความเป็นปุ่มเดี่ยวตามปกติ
      }
      if (key === "g") {
        gAt.current = Date.now();
        return;
      }

      // ── ปุ่มเดี่ยว (ยึดของ Trello · แบบ §5.6) ──
      switch (key) {
        case "?":
          e.preventDefault();
          run("help");
          return;
        case "b":
          e.preventDefault();
          run("boards");
          return;
        case "f":
          e.preventDefault();
          run("filter");
          return;
        case "x":
          e.preventDefault();
          run("filter-clear");
          return;
        case "n":
          e.preventDefault();
          run("new-card");
          return;
        case "t":
          e.preventDefault();
          run("rename-card");
          return;
        case "d":
          e.preventDefault();
          run("due");
          return;
        case "l":
          e.preventDefault();
          run("labels");
          return;
        case "c":
          e.preventDefault();
          run("archive-card");
          return;
        case "j":
        case "ArrowDown":
          e.preventDefault();
          run("card-next");
          return;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          run("card-prev");
          return;
        case "z":
          e.preventDefault();
          run("undo");
          return;
        default:
          return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, helpOpen, run]);

  if (!enabled || !helpOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="ปุ่มลัดคีย์บอร์ด">
      <span className="absolute inset-0" style={{ background: "rgba(10,10,10,.4)" }} onClick={() => setHelpOpen(false)} />
      <div
        data-testid="shortcuts-help"
        className="relative flex max-h-[80vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[14px]"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", boxShadow: "0 24px 60px rgba(10,10,10,.22)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-line)" }}>
          <KanbanIcon name="grid" size="sm" />
          <h2 style={{ fontSize: 14.5, fontWeight: 700 }}>ปุ่มลัดคีย์บอร์ด</h2>
          <span className="flex-1" />
          <button
            type="button"
            data-testid="shortcuts-help-close"
            aria-label="ปิด"
            onClick={() => setHelpOpen(false)}
            style={{ color: "var(--color-muted)" }}
          >
            <KanbanIcon name="x" size="sm" />
          </button>
        </div>
        <div className="flex flex-col overflow-y-auto px-4 py-3">
          {HELP_ROWS.map((row) => (
            <div key={row.keys} className="flex items-center gap-3 py-1.5">
              <kbd
                className="inline-flex flex-none items-center justify-center tabular-nums"
                style={{
                  minWidth: 106,
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "inherit",
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-line)",
                }}
              >
                {row.keys}
              </kbd>
              <span style={{ fontSize: 13 }}>{row.what}</span>
            </div>
          ))}
        </div>
        <p className="px-4 py-3" style={{ fontSize: 12, color: "var(--color-muted)", borderTop: "1px solid var(--color-line)" }}>
          ปิดปุ่มลัดทั้งหมดได้ที่ ตั้งค่า › การตั้งค่าส่วนตัว (ปุ่มลัดจะไม่ทำงานขณะพิมพ์ในช่องข้อความอยู่แล้ว)
        </p>
      </div>
    </div>
  );
}

export default Shortcuts;
