"use client";

// ─────────────────────────────────────────────────────────────
// LegalWarnings — ที่แสดงคำเตือนกฎหมายแบบเดียวกันทุกหน้า (T0.4)
//   ข้อมูลมาจากทะเบียนกลาง `src/lib/core/settings/legal/warnings.ts` เท่านั้น (รูป LegalWarning ชุดเดียวกับ REST/AI)
//   แต่ละรายการ: ข้อความ · อ้างอิงกฎหมาย (ภาษาไทยล้วน — T4 Job 0) · ไอคอน warn ของ AccountIcon (ไม่ใช้ emoji)
//   ถ้ามีรายการที่ต้องกดยืนยัน → ช่องติ๊ก "รับทราบคำเตือนและทำต่อ"
//     - ในฟอร์ม server action: ติ๊กแล้วส่ง <input name={ackName} value=code> ทุกรหัสที่ต้องยืนยัน
//     - แบบควบคุมเอง: onAckChange(codes | [])
// 🔴 client: import ได้เฉพาะไฟล์ pure (warnings.ts) — ห้ามลาก prisma
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { AccountIcon } from "./AccountIcon";
import { legalWarningRefTh, type LegalWarning } from "@/lib/core/settings/legal/warnings";

export function LegalWarnings({
  warnings,
  ackName,
  onAckChange,
  testId = "legal-warnings",
  compact = false,
  collapsible = false,
}: {
  warnings: readonly LegalWarning[];
  /** ชื่อช่องในฟอร์มที่ส่งรหัสที่ยืนยัน (server action อ่าน formData.getAll(ackName)) */
  ackName?: string;
  onAckChange?: (codes: string[]) => void;
  testId?: string;
  compact?: boolean;
  /** ACC T3b A2 ▸ ข้อความยาว (เช่นจอขาย): แสดง 2 บรรทัด + "อ่านเพิ่ม" เปิดข้อความเต็ม/อ้างอิง — ทะเบียนยังเก็บข้อความเต็ม ◂ */
  collapsible?: boolean;
}) {
  const [acked, setAcked] = useState(false);
  const [open, setOpen] = useState(false);
  if (!warnings.length) return null;
  const needAck = warnings.filter((w) => w.ack).map((w) => w.code);
  const canAck = needAck.length > 0 && (ackName !== undefined || onAckChange !== undefined);
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] p-3"
      data-testid={testId}
    >
      <ul className="flex flex-col gap-1.5">
        {warnings.map((w, i) => (
          <li key={`${w.code}-${i}`} className="flex gap-2 text-sm text-[color:var(--color-ink)]" data-code={w.code} data-testid={`${testId}-item`}>
            <span className="mt-0.5 shrink-0">
              <AccountIcon name="warn" className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={collapsible && !open ? "line-clamp-2" : undefined} data-testid={`${testId}-text`}>
                {w.messageTh}
              </span>
              {collapsible ? (
                <button
                  type="button"
                  className="self-start text-xs font-medium underline"
                  aria-expanded={open}
                  onClick={() => setOpen((v) => !v)}
                  data-testid={`${testId}-more`}
                >
                  {open ? "ย่อ" : "อ่านเพิ่ม"}
                </button>
              ) : null}
              {/* ACC T4 Job 0 ▸ ผู้ใช้เห็นเฉพาะมาตรา/ประกาศภาษาไทย + "โปรดตรวจกับนักบัญชีของร้าน" ของป้าย [S]/[U] — ไม่มี path ภายใน/ป้ายตัวอักษร/วันที่ตรวจ ◂ */}
              {(!compact || (collapsible && open)) && legalWarningRefTh(w) ? (
                <span className="text-xs text-[color:var(--color-muted)]" data-testid={`${testId}-ref`}>
                  {legalWarningRefTh(w)}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {canAck ? (
        <label className="flex items-center gap-2 text-sm font-medium text-[color:var(--color-ink)]">
          <input
            type="checkbox"
            checked={acked}
            onChange={(e) => {
              setAcked(e.target.checked);
              onAckChange?.(e.target.checked ? needAck : []);
            }}
            data-testid={`${testId}-ack`}
          />
          รับทราบคำเตือนและทำต่อ
        </label>
      ) : null}
      {canAck && ackName && acked ? needAck.map((c) => <input key={c} type="hidden" name={ackName} value={c} />) : null}
      <p className="text-xs text-[color:var(--color-muted)]">ข้อมูลอ้างอิงจากผลค้นคว้าของระบบ ไม่ใช่คำปรึกษากฎหมาย</p>
    </div>
  );
}

export default LegalWarnings;
