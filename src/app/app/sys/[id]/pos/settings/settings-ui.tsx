"use client";

// settings-ui.tsx — ชิ้นส่วนแสดงผลของหน้าตั้งค่า POS (P1.10 U · ภาพ 17A/17B): การ์ด · หัวการ์ด · หัวหน้า · ปุ่มสวิตช์ (ภาพเท่านั้น) · การ์ดปฏิเสธ
// 🔴 ไฟล์นี้ไม่มีปุ่ม/ช่องกรอก (element ที่กดได้อยู่ในไฟล์แท็บ พร้อม data-testid ตัวอักษรตรง — ทะเบียนปุ่ม F15.3)

import type { ReactNode } from "react";
import { RegisterIcon, type RegisterIconName } from "@/components/pos/register/RegisterIcon";

export type T = (key: string, values?: Record<string, string | number>) => string;

/** การ์ดขาว ขอบ มุม 18 (ภาพ 17A .card) */
export function SettingsCard({ children, className = "", testid }: { children: ReactNode; className?: string; testid?: string }) {
  return (
    <section data-testid={testid} className={`flex min-w-0 flex-col rounded-[18px] border bg-[color:var(--color-surface)] px-5 py-5 md:px-7 md:py-6 ${className}`}>
      {children}
    </section>
  );
}

/** หัวการ์ด: ไอคอน + ชื่อ 17 หนา + ช่องขวา */
export function CardHead({ icon, title, right }: { icon: RegisterIconName; title: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <RegisterIcon name={icon} size={17} />
      <h2 className="text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
      <span className="flex-1" />
      {right}
    </div>
  );
}

/** หัวหน้าแท็บ: ชื่อ 26 หนา + คำอธิบาย 13 + ปุ่มขวา (children — ไม่รับปุ่มเป็น prop เพราะตัวสแกน F15.3 อ่านแท็กเปิดทั้งก้อน) */
// POS HF-P1CLOSE ▸ O4: stackBelowXl = ต่ำกว่า xl ชิป/ปุ่มลงแถวใต้ชื่อ (ไวยากรณ์เดียวกับหัวหน้ารายงาน V4) — หัว "การเชื่อมต่อระบบ SHARK"
//   ที่ 1024 เดิมถูกบีบเหลือคอลัมน์ ~60px คำละบรรทัด · แท็บอื่นคงเดิม (md+ แถวเดียว) ◂
export function TabHead({ title, desc, children, stackBelowXl = false }: { title: string; desc: string; children?: ReactNode; stackBelowXl?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 ${stackBelowXl ? "xl:flex-row xl:items-start xl:gap-5" : "md:flex-row md:items-start md:gap-5"}`}>
      <div className="min-w-0 flex-1">
        <h2 className="text-[22px] font-bold leading-[1.25] tracking-[-0.02em] md:text-[26px]">{title}</h2>
        <p className="mt-1 text-[13px] text-[color:var(--color-muted)]">{desc}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** รูปสวิตช์ 42×24 (ภาพเท่านั้น — ปุ่มจริง role="switch" อยู่ที่ผู้เรียก) */
export function SwitchKnob({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative inline-block h-6 w-[42px] shrink-0 rounded-full transition-colors ${on ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"} ${disabled ? "opacity-50" : ""}`}
    >
      <span className={`absolute top-[3px] size-[18px] rounded-full bg-[color:var(--color-surface)] shadow transition-[left] ${on ? "left-[21px]" : "left-[3px]"}`} />
    </span>
  );
}

/** ป้ายเล็กมีขอบ (รอผู้ให้บริการ · อ่านอย่างเดียว · ชิปเครื่องพิมพ์) */
export function Chip({ children, tone = "plain", testid }: { children: ReactNode; tone?: "plain" | "muted" | "danger" | "accent"; testid?: string }) {
  const c =
    tone === "danger"
      ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]"
      : tone === "accent"
        ? "border-transparent bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]"
        : tone === "muted"
          ? "text-[color:var(--color-muted)]"
          : "text-[color:var(--color-ink-soft)]";
  return (
    <span data-testid={testid} className={`inline-flex h-8 shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[9px] border px-3 text-[13px] ${c}`}>
      {children}
    </span>
  );
}

/** การ์ดปฏิเสธทั้งแท็บ (ไม่มีสิทธิ์) — หน้า 200 */
export function SettingsRefusal({ message }: { message: string }) {
  return (
    <div data-testid="pos-settings-refusal" role="alert" className="flex items-start gap-3 rounded-[18px] border-[1.5px] border-[color:var(--color-danger)] px-5 py-4 text-[14.5px] text-[color:var(--color-ink-soft)]">
      <RegisterIcon name="warn" size={18} className="mt-[2px] shrink-0 text-[color:var(--color-danger)]" />
      <span>{message}</span>
    </div>
  );
}

/** ข้อความแจ้งในบรรทัด (ปฏิเสธจากเซิร์ฟเวอร์ · บันทึกแล้ว) */
export function InlineNote({ tone, children, testid }: { tone: "error" | "ok"; children: ReactNode; testid?: string }) {
  return (
    <p
      data-testid={testid}
      role={tone === "error" ? "alert" : "status"}
      className={`text-[13.5px] ${tone === "error" ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink-soft)]"}`}
    >
      {children}
    </p>
  );
}
