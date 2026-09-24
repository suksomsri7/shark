// SentenceParts.tsx — ชิ้นส่วนของ "ตัวสร้างกฎแบบประโยคไทย" (K2.9 · ภาพ kanban 08) ที่ตัวสร้างกฎหลายโลกใช้ร่วมกัน
//
// ย้ายออกจาก `src/components/kanban/AutomationBuilder.tsx` แบบ move-only (CRM C2.1 · addendum 7 ของผู้คุมงาน):
//   ตัวสร้างกฎของบอร์ดงาน (K2.9) และของ CRM (C2.1 · ภาพ CRM 07 บน) ใช้ select/การ์ด/สไตล์ชุดเดียวกัน — ไม่มีตัวสร้างชุดที่สาม
// 🔴 client component ล้วน — ไม่ import โมดูลที่แตะ prisma
"use client";

import type React from "react";

export type Opt = { id: string; name: string };


export const selCls = "rounded-lg border px-2";
export const selStyle: React.CSSProperties = { height: 30, fontSize: 12.5, borderColor: "var(--color-line)", background: "var(--color-surface)", maxWidth: 230 };
export const tagStyle: React.CSSProperties = {
  height: 26,
  padding: "0 9px",
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 700,
  background: "var(--color-surface-2)",
  color: "var(--color-ink-soft)",
  border: "1px solid var(--color-line)",
};

export function Pick({ value, onChange, options, placeholder, ariaLabel }: { value: string; onChange: (v: string) => void; options: Opt[]; placeholder: string; ariaLabel: string }) {
  return (
    <select aria-label={ariaLabel} className={selCls} style={selStyle} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function Card({ children, testId, className }: { children: React.ReactNode; testId?: string; className?: string }) {
  return (
    <section
      data-testid={testId}
      className={`flex flex-col rounded-xl ${className ?? ""}`}
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", padding: 14, gap: 10 }}
    >
      {children}
    </section>
  );
}

