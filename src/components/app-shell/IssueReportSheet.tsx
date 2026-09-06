"use client";

// แผ่น "แจ้งปัญหาการใช้งาน" (B3 · T8 · แบบ ledger/DESIGN-BRANDING.md §7b)
//
// เปิดจากปุ่มมุมขวาบน (Topbar) และจากท้ายเมนู overlay บนจอเล็ก (NavDrawer — แถบบนจอเล็กไม่มีที่)
// ผู้ใช้กรอกแค่ 2 อย่าง: ประเภท + สิ่งที่เจอ · ที่เหลือระบบแนบให้เอง (หน้าที่อยู่ · เบราว์เซอร์/แอป · เวอร์ชัน)
//
// 🔴 ห้ามใช้กล่องเด้งของเบราว์เซอร์ (alert / confirm) — ข้อความทุกอย่าง inline ในแผ่น (มาตรฐานเดียวกับทั้งระบบ)
// 🔴 ห้ามโทษผู้ใช้เวลาส่งไม่ผ่าน — ข้อความจาก action เป็นไทยและบอกสิ่งที่ทำได้ต่อ

import { useState, useTransition } from "react";
import { reportIssueAction } from "@/lib/branding/issue-actions";

type IssueKindOption = { value: "BUG" | "DISPLAY" | "IDEA"; label: string };

// ป้ายไทยชุดเดียวกับ ISSUE_KIND_LABEL ใน src/lib/branding/issues.ts (ฝั่ง client import ไม่ได้ — พ่วง prisma)
const KIND_OPTIONS: readonly IssueKindOption[] = [
  { value: "BUG", label: "ใช้งานไม่ได้" },
  { value: "DISPLAY", label: "แสดงผลผิด" },
  { value: "IDEA", label: "ข้อเสนอแนะ" },
];

const MESSAGE_MAX = 2000;

export function IssueReportSheet({ onClose, onSent }: { onClose: () => void; onSent?: () => void }) {
  const [kind, setKind] = useState<IssueKindOption["value"]>("BUG");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const text = message.trim();
    if (!text) {
      setError("กรุณาพิมพ์รายละเอียดปัญหาที่พบก่อนส่ง");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("message", text.slice(0, MESSAGE_MAX));
    // บริบทที่ผู้ใช้ไม่ต้องพิมพ์เอง — หน้าที่เกิดปัญหา + เบราว์เซอร์/แอปที่ใช้อยู่จริง
    fd.set("pageUrl", window.location.href);
    fd.set("userAgent", navigator.userAgent);
    // UA ของ WebView แอปเป็นรูป `SharkApp/<version>` ⇒ ส่งเวอร์ชันไปตรง ๆ ให้ฝั่งเซิร์ฟเวอร์ไม่ต้องเดา
    const appVersion = /SharkApp\/([\w.+-]+)/i.exec(navigator.userAgent)?.[1] ?? "";
    if (appVersion) fd.set("appVersion", appVersion);
    if (file) fd.set("screenshot", file);

    startTransition(async () => {
      const res = await reportIssueAction(fd);
      if (res.ok) {
        setSent(true);
        onSent?.();
        return;
      }
      setError(res.error);
    });
  };

  return (
    <>
      {/* ฉากหลังใส แตะที่ไหนก็ปิด (ไม่บังจอ — คนกำลังชี้ว่าอะไรพัง ต้องยังเห็นหน้าจอเดิม) */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        data-testid="issue-sheet"
        role="dialog"
        aria-label="แจ้งปัญหาการใช้งาน"
        className="fixed right-2 top-[3.25rem] z-50 flex w-[min(94vw,22rem)] flex-col gap-2.5 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.14)] sm:right-4"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold">แจ้งปัญหาการใช้งาน</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-base leading-none hover:bg-[color:var(--color-surface-2)]"
          >
            ✕
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col gap-2 py-1">
            <p className="text-sm font-medium text-green-700">✅ รับเรื่องแล้ว</p>
            <p className="text-xs text-[color:var(--color-muted)]">
              ทีมงานได้รับเรื่องพร้อมหน้าที่คุณอยู่และรุ่นของเบราว์เซอร์/แอปแล้ว — ไม่ต้องส่งซ้ำ
            </p>
            <button type="button" onClick={onClose} className="btn btn-sm mt-1 self-start">
              ปิด
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {KIND_OPTIONS.map((o) => {
                const active = kind === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    data-testid={`issue-kind-${o.value}`}
                    onClick={() => setKind(o.value)}
                    className="rounded-full border px-2.5 py-1.5 text-xs"
                    style={
                      active
                        ? { background: "var(--color-accent)", color: "var(--color-accent-fg)", borderColor: "var(--color-accent)" }
                        : undefined
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>

            <textarea
              data-testid="issue-message"
              value={message}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="เกิดอะไรขึ้น? เช่น กดปุ่มบันทึกแล้วไม่มีอะไรเกิดขึ้น"
              className="input resize-y"
            />

            <label className="flex cursor-pointer items-center gap-2 text-xs text-[color:var(--color-muted)]">
              <span className="btn-sm shrink-0 px-2 py-1 text-xs">แนบรูป</span>
              <span className="min-w-0 truncate">{file ? file.name : "ไม่บังคับ · รูปไม่เกิน 2 MB"}</span>
              <input
                type="file"
                data-testid="issue-screenshot"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>

            <p className="text-[11px] leading-relaxed text-[color:var(--color-muted)]">
              ระบบจะแนบให้อัตโนมัติ: หน้าที่คุณอยู่ · กิจการ · บัญชีผู้ใช้ · เบราว์เซอร์/แอปและเวอร์ชัน
            </p>

            {error && <p className="text-xs font-medium text-[color:var(--color-danger)]">{error}</p>}

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="issue-send"
                onClick={submit}
                disabled={pending}
                className="btn btn-primary text-sm disabled:opacity-50"
              >
                {pending ? "กำลังส่ง…" : "ส่งเรื่อง"}
              </button>
              <button type="button" onClick={onClose} className="btn btn-sm text-sm">
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default IssueReportSheet;
