"use client";

// BusinessTemplatePicker.tsx — ตัวเลือก "เทมเพลตตามประเภทกิจการ" 16 แบบ บนหน้าแรก CRM v2 ครั้งแรก (ใบ C1.11 · พิมพ์เขียว §10 · รีวิว SF-7)
// แตะเพื่อเลือก → กด "ใช้แบบนี้" ยืนยัน (แตะพลาดไม่เขียนอะไร) · "ไม่ใช้เทมเพลต" = ซ่อนตัวเลือกนี้ (ไม่เพิ่มอะไรให้ระบบ)
// 🔴 ไฟล์ client: ไม่ import โมดูล CRM — หน้า server ส่ง server action (`apply` · `skip`) + รายการเทมเพลตมาทาง props
// 🔴 เลือกแล้วเพิ่ม pipeline/ขั้น/เหตุผลที่แพ้/ฟิลด์/วัตถุตามแบบนั้น (ไม่ลบของเดิม) · กดซ้ำได้ ไม่เกิดรายการซ้ำ

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type TemplateOption = { key: string; label: string; description: string };
type ApplyResult = { ok: true; notice?: string | null } | { ok: false; error: string };

export function BusinessTemplatePicker({
  systemId,
  templates,
  apply,
  skip,
}: {
  systemId: string;
  templates: TemplateOption[];
  apply: (systemId: string, key: string) => Promise<ApplyResult>;
  skip: (systemId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chosen = templates.find((t) => t.key === picked) ?? null;
  const confirm = () =>
    start(async () => {
      if (!chosen) return setError("แตะเลือกแบบที่ตรงกับกิจการก่อน");
      setError(null);
      const r = await apply(systemId, chosen.key);
      if (!r.ok) return setError(r.error);
      // มีส่วนที่ข้าม (เช่น ไม่มีสิทธิ์ตั้งค่าวัตถุ) = ค้างข้อความไว้ให้อ่านก่อน · รีเฟรชเองเมื่อพร้อม
      if (r.notice) return setNotice(r.notice);
      router.refresh();
    });
  const none = () =>
    start(async () => {
      setError(null);
      const r = await skip(systemId);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ul className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="แบบตามประเภทกิจการ">
        {templates.map((t) => (
          <li key={t.key}>
            <button
              type="button"
              role="radio"
              aria-checked={picked === t.key}
              disabled={pending}
              onClick={() => setPicked(t.key)}
              className={`card flex w-full min-w-0 flex-col gap-1 p-3 text-left ${picked === t.key ? "border-[color:var(--color-accent)]" : ""}`}
              data-testid="crm-template-option"
            >
              <span className="text-sm font-semibold">{t.label}</span>
              <span className="text-xs text-[color:var(--color-muted)]">{t.description}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="btn btn-ghost text-sm" disabled={pending} onClick={none} data-testid="crm-template-none">
          ไม่ใช้เทมเพลต
        </button>
        <button type="button" className="btn btn-primary text-sm" disabled={pending || !chosen} onClick={confirm} data-testid="crm-template-apply">
          {pending && chosen ? `กำลังตั้งค่า ${chosen.label}…` : "ใช้แบบนี้"}
        </button>
      </div>
      {error && (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert" data-testid="crm-template-error">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm text-[color:var(--color-muted)]" role="status" data-testid="crm-template-notice">
          {notice}
        </p>
      )}
    </div>
  );
}
