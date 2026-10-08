"use client";

import { useActionState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { approvePayrollRunAction, createPayrollRunAction, deleteDraftRunAction, moveStrandedAdjustmentAction, recomputeDraftRunAction } from "./payroll-actions";

// H0.1 ▸ R6: ปุ่ม "ดึงข้อมูลใหม่" (= คำนวณใหม่ · ถ้อยคำตามแบบ design-hr/06 — CR10) / "ลบร่าง" ของรอบจ่ายที่ยังเป็นร่าง (DRAFT) 1 แถว
//   — server action คืน { ok, reason } · ปุ่มใช้ token ชุดเดียวกับปุ่มเดิมของแถว (border · surface-2 · danger สำหรับลบ) ไม่มีสีใหม่
//   ⇒ เหตุผลที่ถูกปฏิเสธ (รอบเปลี่ยนไปแล้ว · ไม่ใช่ร่าง · ไม่มีสิทธิ์) แสดงในแถวนี้ (แบบเดียวกับ PayAdjustRowActions)
//   ทุกปุ่มผ่าน ConfirmDialog · `key` เปลี่ยนเมื่อทำรายการเสร็จ ⇒ กล่องยืนยันปิดเอง · ไม่ใช่ร่าง = ไม่แสดงอะไรเลย ◂
// H0.1 ▸ CR12: ปุ่ม "อนุมัติ" ย้ายมาอยู่ที่นี่ ⇒ อนุมัติไม่สำเร็จ (ตัวเลขเปลี่ยน · ไม่ใช่ร่างแล้ว · ลงบัญชีล้ม) เห็นเหตุผลในแถวเดียวกัน ·
//   ช่องซ่อนของตัวเลขที่ผู้อนุมัติเห็น (expectNet · expectItems · expectGross — CR3/CR11) มาจาก props ของแถวที่แสดงอยู่ ◂
// ปุ่มของร่างมีเฉพาะรอบที่ยังเป็นร่าง — อนุมัติแล้ว/จ่าย/กลับรายการ ใช้ทางของสถานะนั้น
// H0.1 ▸ CR16: + `expectDigest` = ลายนิ้วมือแถวพนักงานที่หน้า (server component) คำนวณมาให้ทาง prop `itemsDigest` — ไฟล์นี้ไม่คำนวณเอง ◂
type Op = "approve" | "recompute" | "delete";
type Res = { ok: boolean; reason?: string; op: Op; n: number } | null;

const triggerBase = "min-h-[44px] rounded-full border px-3 text-xs hover:bg-[color:var(--color-surface-2)]";

const opOf = (v: FormDataEntryValue | null): Op => (v === "approve" ? "approve" : v === "delete" ? "delete" : "recompute");

export default function RunRowActions({
  systemId,
  runId,
  periodKey,
  status,
  totalNetSatang,
  totalGrossSatang,
  itemCount,
  itemsDigest,
  approveDetail,
}: {
  systemId: string;
  runId: string;
  periodKey: string;
  status: string;
  totalNetSatang: number;
  totalGrossSatang: number;
  itemCount: number;
  itemsDigest: string;
  approveDetail: string;
}) {
  const [state, run] = useActionState<Res, FormData>(async (prev, formData) => {
    const op = opOf(formData.get("op"));
    const r = op === "approve" ? await approvePayrollRunAction(formData) : op === "delete" ? await deleteDraftRunAction(formData) : await recomputeDraftRunAction(formData);
    return { ok: r.ok, reason: r.reason, op, n: (prev?.n ?? 0) + 1 };
  }, null);

  if (status !== "DRAFT") return null; // ปุ่มของร่างเท่านั้น

  const n = state?.n ?? 0;
  return (
    <>
      <ConfirmDialog
        key={`approve-${n}`}
        fields={{ systemId, runId, op: "approve", expectNet: String(totalNetSatang), expectItems: String(itemCount), expectGross: String(totalGrossSatang), expectDigest: itemsDigest }}
        triggerLabel="อนุมัติ"
        triggerClassName="rounded-full border px-3 py-1.5 text-xs hover:bg-[color:var(--color-surface-2)]"
        title={`อนุมัติรอบจ่ายงวด ${periodKey}?`}
        detail={approveDetail}
        confirmLabel="ยืนยันอนุมัติ"
        action={run}
        testId={`hr-payroll-run-${periodKey}-approve`}
      />
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

// ─────────── H0.2 ▸ R4 (D12): ฟอร์มสร้างรอบจ่าย — action คืน { ok, reason } ⇒ งวด/วันที่จ่ายไม่ถูกต้อง · งวดซ้ำ · ไม่มีใครต้องจ่าย
//   แสดงเหตุผลใต้ฟอร์ม (เดิมเป็น void action: งวดซ้ำ = หน้า error · งวด 2026-13 ถูกสร้างจริง) ◂
type FormRes = { ok: boolean; reason?: string } | null;
const muted = "text-[color:var(--color-muted)]";

export function CreateRunForm({ systemId }: { systemId: string }) {
  const [state, run] = useActionState<FormRes, FormData>(createPayrollRunAction, null);
  return (
    <form action={run} className="flex flex-wrap items-end gap-2" data-testid="hr-payroll-create">
      <input type="hidden" name="systemId" value={systemId} />
      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        งวด (เดือน)
        <input name="periodKey" type="month" required className="input" />
      </label>
      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        วันที่จ่าย
        <input name="payDate" type="date" required className="input" />
      </label>
      <SubmitButton variant="primary" pendingText="กำลังสร้าง…">
        + สร้างรอบจ่าย
      </SubmitButton>
      {state && !state.ok && (
        <span role="alert" data-testid="hr-payroll-create-error" className="w-full text-xs text-[color:var(--color-danger)]">
          สร้างรอบไม่สำเร็จ: {state.reason}
        </span>
      )}
    </form>
  );
}

// ─────────── H0.2 ▸ R2 (D5): ปุ่ม "ย้ายไปงวดถัดไป" ของรายการค้าง 1 แถว (รายการปกติ — ของ CRM ระบบ CRM ย้ายเอง) ◂
export function StrandedMoveButton({ systemId, id, testId }: { systemId: string; id: string; testId: string }) {
  const [state, run] = useActionState<FormRes, FormData>((_prev, formData) => moveStrandedAdjustmentAction(formData), null);
  return (
    <form action={run} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" data-testid={testId} className="min-h-[44px] rounded-full border px-3 text-xs hover:bg-[color:var(--color-surface-2)]">
        ย้ายไปงวดถัดไป
      </button>
      {state && (
        <span role={state.ok ? "status" : "alert"} className={`max-w-[14rem] text-xs ${state.ok ? muted : "text-[color:var(--color-danger)]"}`}>
          {state.ok ? state.reason : `ไม่สำเร็จ: ${state.reason}`}
        </span>
      )}
    </form>
  );
}
