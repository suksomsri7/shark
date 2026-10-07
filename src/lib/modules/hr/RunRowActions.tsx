"use client";

import { useActionState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { deleteDraftRunAction, recomputeDraftRunAction } from "./payroll-actions";

// H0.1 ▸ R6: ปุ่ม "ดึงข้อมูลใหม่" (= คำนวณใหม่ · ถ้อยคำตามแบบ design-hr/06 — CR10) / "ลบร่าง" ของรอบจ่ายที่ยังเป็นร่าง (DRAFT) 1 แถว
//   — server action คืน { ok, reason } · ปุ่มใช้ token ชุดเดียวกับปุ่มเดิมของแถว (border · surface-2 · danger สำหรับลบ) ไม่มีสีใหม่
//   ⇒ เหตุผลที่ถูกปฏิเสธ (รอบเปลี่ยนไปแล้ว · ไม่ใช่ร่าง · ระบบขัดข้อง) แสดงในแถวนี้ (แบบเดียวกับ PayAdjustRowActions)
//   ทุกปุ่มผ่าน ConfirmDialog · `key` เปลี่ยนเมื่อทำรายการเสร็จ ⇒ กล่องยืนยันปิดเอง · ไม่ใช่ร่าง = ไม่แสดงอะไรเลย ◂
type Op = "recompute" | "delete";
type Res = { ok: boolean; reason?: string; op: Op; n: number } | null;

const triggerBase = "min-h-[44px] rounded-full border px-3 text-xs hover:bg-[color:var(--color-surface-2)]";

export default function RunRowActions({
  systemId,
  runId,
  periodKey,
  status,
}: {
  systemId: string;
  runId: string;
  periodKey: string;
  status: string;
}) {
  const [state, run] = useActionState<Res, FormData>(async (prev, formData) => {
    const op: Op = formData.get("op") === "delete" ? "delete" : "recompute";
    const r = op === "delete" ? await deleteDraftRunAction(formData) : await recomputeDraftRunAction(formData);
    return { ok: r.ok, reason: r.reason, op, n: (prev?.n ?? 0) + 1 };
  }, null);

  // ปุ่มแก้ร่างมีเฉพาะรอบที่ยังเป็นร่าง — อนุมัติ/จ่าย/กลับรายการแล้ว ใช้ทางของสถานะนั้น
  if (status !== "DRAFT") return null;

  const n = state?.n ?? 0;
  return (
    <>
      <ConfirmDialog
        key={`recompute-${n}`}
        triggerLabel="ดึงข้อมูลใหม่"
        triggerClassName={triggerBase}
        title={`ดึงข้อมูลใหม่ของรอบจ่ายงวด ${periodKey}?`}
        detail="คำนวณรอบจ่ายใหม่จากข้อมูลปัจจุบัน — เงินเดือน ประกันสังคม และภาษีของทุกคนที่มีโปรไฟล์เงินเดือน รวมรายการเพิ่ม/หักที่อนุมัติแล้วของงวด · ตัวเลขอาจเปลี่ยน กรุณาตรวจอีกครั้งก่อนอนุมัติ"
        confirmLabel="ยืนยันคำนวณใหม่"
        action={run}
        fields={{ systemId, runId, op: "recompute" }}
        testId={`hr-payroll-run-${periodKey}-recompute`}
      />
      <ConfirmDialog
        key={`delete-${n}`}
        triggerLabel="ลบร่าง"
        triggerClassName={`${triggerBase} text-[color:var(--color-danger)]`}
        title={`ลบรอบร่างงวด ${periodKey}?`}
        detail="รอบนี้ยังไม่ได้อนุมัติและยังไม่ได้ลงบัญชี — ลบแล้วรายการเพิ่ม/หักที่อนุมัติแล้วจะกลับไปรอรอบใหม่ของงวดนี้ และสร้างรอบของงวดนี้ใหม่ได้"
        confirmLabel="ยืนยันลบร่าง"
        danger
        action={run}
        fields={{ systemId, runId, op: "delete" }}
        testId={`hr-payroll-run-${periodKey}-delete`}
      />
      {state && !state.ok && (
        <span role="alert" data-testid={`hr-payroll-run-${periodKey}-error`} className="max-w-[16rem] text-xs text-[color:var(--color-danger)]">
          ไม่สำเร็จ: {state.reason}
        </span>
      )}
      {state?.ok && state.op === "recompute" && (
        <span role="status" className="text-xs text-[color:var(--color-muted)]">
          คำนวณใหม่แล้ว
        </span>
      )}
    </>
  );
}
