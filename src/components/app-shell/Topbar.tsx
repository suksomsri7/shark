"use client";

// แถบบนสุดติดตายตลอด (fixed) — ใช้ทุกจอ + เหมาะกับ webview
//
// T7 (เจ้าของเคาะ 6 ก.ย. รอบ 2 · ledger/DESIGN-BRANDING.md §5 · ภาพ 02/03):
//   ซ้าย  = โลโก้กิจการ 34px (หรือตัวย่อ 2 ตัวบนพื้นสีแบรนด์) + ชื่อที่แสดง
//   ขวา   = **2 ปุ่มเท่านั้น** — "แจ้งปัญหาการใช้งาน" + ไอคอน SHARK AI (orb)
//   ☰     = เฉพาะเว็บบนจอเล็ก (`lg:hidden`) · **ในแอปไม่มีเลย** (ใช้ท่าปัดจากขอบซ้ายแทน — SwipeEdge)
//   ถอดออก: ค้นหา / กระดิ่งแจ้งเตือน / avatar — ย้ายไปอยู่ในแต่ละระบบและท้ายแถบเมนู
//
// 🔴 orb ตัวนี้คือ orb เดียวของเว็บ (AiDock เลิกลอยปุ่มมุมขวาล่างแล้ว):
//    · เว็บ → ยิง CustomEvent `app:ai-open` ให้ AiDock เปิดแผง (ไม่ผูก state ข้ามชั้น)
//    · ในแอป → postMessage {ev:"open-ai"} ให้แอปเปิดจอแชท AI ของตัวเอง (สัญญาเดิมของแอป)

import { useState } from "react";
import { IssueReportSheet } from "./IssueReportSheet";

export type TopbarBranding = {
  /** ชื่อที่แสดงข้างโลโก้ (ว่าง = ชื่อกิจการ — service เติมให้แล้ว) */
  displayName: string;
  logoUrl: string | null;
};

/** ตัวย่อ 2 ตัวอักษรจากชื่อกิจการ — ใช้เมื่อร้านยังไม่อัปโลโก้ (เหมือนพฤติกรรมเดิม) */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function Topbar({
  branding,
  onMenu,
  inApp = false,
  hideOnMobile = false,
  aiUnread = 0,
}: {
  branding: TopbarBranding;
  onMenu: () => void;
  /** เปิดจากแอป SHARK HUB (WebView) — ไม่มี ☰ เลย (เมนูเปิดด้วยการปัดจากขอบซ้าย) */
  inApp?: boolean;
  /**
   * WO-CV12 (มติเจ้าของ 1 ก.ย. 2026): หน้ากล่องแชทเต็มจอบนจอที่ไม่มีแถบเมนูปักซ้าย (< lg)
   * ต้อง "ตัด" แถบบนทิ้ง แล้วให้หัวรายการแชทขึ้นเป็นหัวจอแทน
   * 🔴 เดสก์ท็อป (lg+) ยังต้องมีแถบบนเหมือนเดิม ⇒ ซ่อนด้วย `hidden lg:block` ไม่ใช่ถอดออกจากต้นไม้
   */
  hideOnMobile?: boolean;
  /** จำนวนแจ้งเตือนของผู้ช่วย AI — ย้ายจาก badge ของ orb มุมล่างขวาเดิมมาไว้ที่ orb แถบบน */
  aiUnread?: number;
}) {
  const [issueOpen, setIssueOpen] = useState(false);
  // จุดสีที่ปุ่มหลังส่งเรื่องสำเร็จ (แบบ §7b "ผู้แจ้งเห็นสถานะที่ปุ่มเดิม") — อยู่จนกว่าจะปิดแผ่น
  const [reported, setReported] = useState(false);

  const openAi = () => {
    const rn = (window as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView;
    if (rn) {
      rn.postMessage(JSON.stringify({ ev: "open-ai" }));
      return;
    }
    window.dispatchEvent(new CustomEvent("app:ai-open"));
  };

  return (
    <header
      data-qc="app-topbar"
      className={`fixed inset-x-0 top-0 z-40 h-14 bg-[color:var(--color-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${
        hideOnMobile ? "hidden lg:block" : ""
      }`}
    >
      <div className="mx-auto flex h-full items-center gap-2 px-3 sm:px-4">
        {/* ☰ เว็บจอเล็กเท่านั้น — ในแอปไม่มี (ปัดจากขอบซ้ายแทน) · จอ ≥ lg มีแถบเมนู/รางอยู่แล้ว */}
        {!inApp && (
          <button
            type="button"
            onClick={onMenu}
            aria-label="เมนูระบบ"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl leading-none hover:bg-[color:var(--color-surface-2)] lg:hidden"
          >
            ☰
          </button>
        )}

        {/* ซ้าย: โลโก้กิจการ + ชื่อที่แสดง */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- โลโก้มาจาก CDN ของร้าน (โดเมนไม่คงที่) ⇒ next/image ต้องตั้ง remotePatterns ต่อร้าน
            <img
              src={branding.logoUrl}
              alt=""
              width={34}
              height={34}
              className="h-[34px] w-[34px] shrink-0 rounded-lg object-contain"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg text-[12px] font-bold"
              style={{ background: "var(--color-accent)", color: "var(--color-accent-fg)" }}
            >
              {initialsOf(branding.displayName)}
            </span>
          )}
          <span className="truncate text-sm font-bold tracking-tight">{branding.displayName}</span>
        </div>

        {/* ขวา: 2 ปุ่มเท่านั้น (T7) · pr-1 เผื่อจุดแจ้งเตือนที่ล้นมุม orb ไม่ให้ชนขอบจอ */}
        <div className="flex shrink-0 items-center gap-2 pr-1">
          <button
            type="button"
            data-testid="report-issue"
            onClick={() => setIssueOpen((o) => !o)}
            aria-label="แจ้งปัญหาการใช้งาน"
            title="แจ้งปัญหาการใช้งาน"
            className="relative hidden h-10 items-center gap-1.5 rounded-full border border-[color:var(--color-border)] px-3 text-xs font-medium hover:bg-[color:var(--color-surface-2)] md:inline-flex"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            แจ้งปัญหาการใช้งาน
            {reported && (
              <span aria-hidden className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-green-600" />
            )}
          </button>

          <button
            type="button"
            data-testid="ai-orb"
            onClick={openAi}
            aria-label={aiUnread > 0 ? `SHARK AI (${aiUnread} แจ้งเตือนใหม่)` : "SHARK AI"}
            title="SHARK AI"
            className="ai-orb-breathe relative h-9 w-9 shrink-0"
          >
            <span aria-hidden className="ai-orb" />
            {aiUnread > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">
                {aiUnread > 9 ? "9+" : aiUnread}
              </span>
            )}
          </button>
        </div>
      </div>

      {issueOpen && (
        <IssueReportSheet
          onClose={() => {
            setIssueOpen(false);
            setReported(false); // ปิดแผ่น = เคลียร์จุดสีที่ปุ่ม (แบบ §7b)
          }}
          onSent={() => setReported(true)}
        />
      )}
    </header>
  );
}
