// TemplatePicker.tsx — แถว "เริ่มจากเทมเพลต" ของหน้ารวมบอร์ด (K1.12 · มาตรฐาน mockup 01 บล็อกล่างสุด)
//
// การ์ดเทมเพลต: ไอคอน + ชื่อ + คำอธิบาย + "N คอลัมน์ · M การ์ด" — คลิกเปิดพรีวิวคอลัมน์แบบเต็ม
// (เทียบ `.dashed`/`.g5` ของแบบ) → ปุ่ม "ใช้เทมเพลตนี้" ส่งต่อให้หน้าหลักเปิด `CreateBoardModal`
"use client";

import { useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import type { BoardTemplateDto } from "@/lib/modules/kanban/types";

export function TemplatePicker({
  templates,
  onUseTemplate,
}: {
  templates: BoardTemplateDto[];
  onUseTemplate: (templateId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (templates.length === 0) return null;

  return (
    <section data-testid="templates-row" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
        <KanbanIcon name="copy" size="sm" />
        <h2 style={{ fontSize: 14.5, fontWeight: 700 }}>เริ่มจากเทมเพลต</h2>
        <span style={{ fontSize: 12, color: "var(--color-muted)" }}>โครงคอลัมน์ + การ์ดตัวอย่าง + ป้ายกำกับ พร้อมใช้ใน 1 คลิก</span>
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        {templates.map((t) => {
          const open = openId === t.id;
          const colCount = t.structure.columns.length;
          const cardCount = t.structure.cards.length;
          return (
            <div
              key={t.id}
              data-testid="template-card"
              className="flex flex-col gap-1 rounded-xl p-3"
              style={{ border: "1px solid var(--color-line)", background: "var(--color-surface)", cursor: "pointer" }}
              onClick={() => setOpenId(open ? null : t.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpenId(open ? null : t.id);
                }
              }}
            >
              <KanbanIcon name={t.icon} size="md" />
              <b style={{ fontSize: 12.5, color: "var(--color-ink)" }}>{t.name}</b>
              <span style={{ fontSize: 11, color: "var(--color-muted)" }}>
                {colCount} คอลัมน์ · {cardCount} การ์ด
              </span>
              {open && (
                <div data-testid="template-preview" className="mt-1 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                  {t.description && <p style={{ fontSize: 11.5, color: "var(--color-ink-soft)" }}>{t.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    {t.structure.columns.map((c) => (
                      <span
                        key={c.name}
                        className="inline-flex items-center"
                        style={{
                          height: 20,
                          padding: "0 8px",
                          borderRadius: 999,
                          fontSize: 10.5,
                          border: `1px solid ${c.isDone ? "var(--color-tag-green)" : "var(--color-line)"}`,
                          color: c.isDone ? "var(--color-tag-green)" : "var(--color-ink-soft)",
                        }}
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    data-testid="template-use"
                    className="btn btn-primary self-start text-xs"
                    onClick={() => onUseTemplate(t.id)}
                  >
                    ใช้เทมเพลตนี้ →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default TemplatePicker;
