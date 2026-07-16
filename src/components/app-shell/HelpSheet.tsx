"use client";

import { useState } from "react";

// ศูนย์ช่วยเหลือ — เปิดจากปุ่ม "?" บน topbar
// ฟอร์ม "แจ้งปัญหาการใช้งาน" แบบ placeholder (ยังไม่บันทึกจริง)
// กดส่งแล้วแสดงข้อความยืนยันว่าระบบรับเรื่องจะเปิดใช้เร็ว ๆ นี้

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sent, setSent] = useState(false);

  if (!open) return null;

  const close = () => {
    setSent(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/30" onClick={close} />

      <div className="relative flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] p-5 shadow-[0_-4px_20px_rgba(0,0,0,0.12)] sm:max-w-md sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">ศูนย์ช่วยเหลือ</h2>
            <p className="text-xs text-[color:var(--color-muted)]">แจ้งปัญหาการใช้งาน แล้วทีมงานจะช่วยดูแล</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="ปิด"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none hover:bg-[color:var(--color-surface-2)]"
          >
            ✕
          </button>
        </div>

        {sent ? (
          <div className="card text-center">
            <div className="text-sm font-medium">รับเรื่องเรียบร้อย</div>
            <p className="mt-1 text-xs text-[color:var(--color-muted)]">
              ระบบรับเรื่องจะเปิดใช้เร็ว ๆ นี้
            </p>
            <button type="button" onClick={close} className="btn btn-primary mt-4 text-sm">
              ปิด
            </button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              หัวข้อ
              <input name="topic" required className="input" placeholder="เช่น เข้าหน้าจองไม่ได้" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              รายละเอียด
              <textarea name="detail" required rows={4} className="input" placeholder="อธิบายปัญหาที่พบ" />
            </label>
            <button type="submit" className="btn btn-primary text-sm">
              ส่งเรื่อง
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
