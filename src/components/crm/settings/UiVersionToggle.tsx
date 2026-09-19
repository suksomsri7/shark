"use client";

// UiVersionToggle.tsx — ปุ่มสลับ "หน้าจอ CRM เดิม ↔ CRM ใหม่" ของเจ้าของร้าน (ใบ C1.11 · มติ C23)
// 🔴 ไฟล์ client: ไม่ import โมดูล CRM — หน้า server ส่ง server action (`action`) มาทาง props
// 🔴 สลับไปมาไม่ลบข้อมูล · ไม่ต้องยืนยันซ้ำ (กลับได้ทุกเมื่อ) · ผลลัพธ์/ข้อผิดพลาดแสดงในหน้า ไม่ใช้ alert()

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Result = { ok: true; uiVersion: 1 | 2 } | { ok: false; error: string };

export function UiVersionToggle({ systemId, current, action }: { systemId: string; current: 1 | 2; action: (systemId: string, uiVersion: 1 | 2) => Promise<Result> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const next: 1 | 2 = current === 2 ? 1 : 2;
  const flip = () =>
    start(async () => {
      setError(null);
      setDone(null);
      const r = await action(systemId, next);
      if (!r.ok) return setError(r.error);
      setDone(r.uiVersion === 2 ? "เปิด CRM ใหม่แล้ว — เมนูใหม่อยู่ในเมนู ☰ ของระบบนี้" : "กลับไปใช้หน้าจอ CRM เดิมแล้ว — ข้อมูลทั้งหมดยังอยู่ครบ");
      // กลับหน้าจอเดิม: ร้านที่ไม่ได้เปิดให้เห็นสวิตช์จะเปิดหน้านี้ไม่ได้อีก ⇒ พากลับหน้าภาพรวมของระบบ
      if (r.uiVersion === 1) router.push(`/app/sys/${systemId}`);
      else router.refresh();
    });
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button type="button" className={`btn ${next === 2 ? "btn-primary" : "btn-ghost"} self-start text-sm`} disabled={pending} onClick={flip} data-testid="crm-uiversion-submit">
        {pending ? "กำลังสลับ…" : next === 2 ? "เปิดใช้ CRM ใหม่" : "สลับกลับไปหน้าจอเดิม"}
      </button>
      {error && (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert" data-testid="crm-uiversion-error">
          {error}
        </p>
      )}
      {done && (
        <p className="text-sm text-[color:var(--color-muted)]" role="status" data-testid="crm-uiversion-done">
          {done}
        </p>
      )}
    </div>
  );
}
