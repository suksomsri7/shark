// CardTemplatePicker.tsx — ปุ่ม "จากเทมเพลต ▾" ข้าง "+ เพิ่มการ์ด" ในทุกคอลัมน์ (K2.7 · ไม่มี mockup เฉพาะ)
// เลือกเทมเพลต → ช่องชื่อ (prefill จาก title ของเทมเพลต แก้ได้ก่อนสร้าง) → สร้างทันที
"use client";

import { useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import type { CardTemplateDto } from "@/lib/modules/kanban/types";

export function CardTemplatePicker({
  templates,
  onCreate,
}: {
  templates: CardTemplateDto[];
  /** เลือกเทมเพลตแล้วยืนยันชื่อ → เรียกสร้างการ์ดจริง (ผู้เรียกจัดการ action + patch state บอร์ดเอง) */
  onCreate: (templateId: string, title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<CardTemplateDto | null>(null);
  const [title, setTitle] = useState("");

  if (templates.length === 0) return null;

  const create = () => {
    const t = title.trim();
    if (!picked || !t) return;
    onCreate(picked.id, t);
    setPicked(null);
    setOpen(false);
    setTitle("");
  };

  return (
    <div data-testid="card-template-picker" className="relative">
      {picked ? (
        <div className="flex flex-col gap-1.5 rounded-[10px] p-2" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") setPicked(null);
            }}
            placeholder="ชื่องาน"
            aria-label="ชื่อการ์ดใหม่"
            className="w-full rounded-[10px] p-2"
            style={{ fontSize: 12.8, background: "var(--color-surface)", border: "1px solid var(--color-line)" }}
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={create} className="rounded-lg px-3 py-1.5" style={{ fontSize: 12.5, background: "var(--color-ink)", color: "var(--color-surface)" }}>
              สร้างการ์ด
            </button>
            <button type="button" aria-label="ยกเลิก" onClick={() => setPicked(null)} style={{ color: "var(--color-muted)" }}>
              <KanbanIcon name="x" size="sm" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center"
          style={{ gap: 7, height: 32, padding: "0 6px", borderRadius: 8, fontSize: 12.5, color: "var(--color-muted)" }}
        >
          <KanbanIcon name="doc" size="sm" />
          จากเทมเพลต ▾
        </button>
      )}
      {open && !picked && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full z-50 mt-1 flex max-h-64 w-56 flex-col gap-0.5 overflow-y-auto rounded-xl border p-1.5"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-line)", boxShadow: "0 14px 34px rgba(10,10,10,.14)" }}
          >
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setPicked(t);
                  setTitle(t.title);
                  setOpen(false);
                }}
                className="flex flex-col items-start rounded-lg px-2 py-1.5 text-left"
                style={{ fontSize: 12.5 }}
              >
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                <span className="truncate" style={{ fontSize: 11, color: "var(--color-muted)", maxWidth: 200 }}>
                  {t.title}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default CardTemplatePicker;
