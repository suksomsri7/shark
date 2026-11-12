"use client";
// HR H2.9 ▸ ส่วนที่กดได้ของคำขอ OT (ภาพ 05 การ์ด OT · ภาพ 07a "ขอ OT") — ฟอร์มยื่น + ปุ่มอนุมัติ/ไม่อนุมัติ/ยกเลิก/ยกเลิก OT ที่อนุมัติแล้ว ·
//   ข้อมูล/ยอดเงินมาจากหน้า server (ui.tsx#HrOtSection) — ไฟล์นี้ไม่ import อะไรที่ถึงฐานข้อมูล · ผลปฏิเสธ = ข้อความไทยคงที่ของ service ◂
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { cancelOtAction, decideOtAction, requestOtAction, revokeOtAction } from "./ot-actions";

type Res = { ok: boolean; reason?: string; warnWeek?: boolean } | null;
const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";

function Result({ state }: { state: Res }) {
  const t = useTranslations("hr.ot");
  if (!state) return null;
  if (!state.ok)
    return (
      <span role="alert" className="text-xs text-[color:var(--color-danger)]">
        {t("failed", { reason: state.reason ?? "" })}
      </span>
    );
  return (
    <span role="status" className="text-xs text-[color:var(--color-muted)]">
      {state.warnWeek ? t("warnWeek") : t("done")}
    </span>
  );
}

/** ฟอร์มยื่นคำขอ OT — employees ว่าง = ยื่นของตัวเองเท่านั้น · มีรายชื่อ = เลือก "ตัวเอง" หรือพนักงานในสาขาที่ยื่นแทนได้ */
export function OtRequestForm({ systemId, employees, canSelf }: { systemId: string; employees: { id: string; name: string }[]; canSelf: boolean }) {
  const t = useTranslations("hr.ot");
  const [state, run, pending] = useActionState<Res, FormData>(requestOtAction, null);
  return (
    <form action={run} className="flex flex-col gap-2" data-testid="hr-ot-form">
      <input type="hidden" name="systemId" value={systemId} />
      {employees.length > 0 && (
        <label className="flex flex-col gap-1 text-xs">
          {t("employee")}
          <select name="employeeId" className="input min-h-[44px]" defaultValue={canSelf ? "" : employees[0]?.id}>
            {canSelf && <option value="">{t("self")}</option>}
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          {t("date")}
          <input name="date" type="date" required className="input min-h-[44px]" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("start")}
          <input name="start" type="time" required step={60} className="input min-h-[44px] w-28" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t("end")}
          <input name="end" type="time" required step={60} className="input min-h-[44px] w-28" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        {t("reason")}
        <input name="reason" maxLength={200} className="input min-h-[44px]" />
      </label>
      <p className="text-xs text-[color:var(--color-muted)]">{t("windowNote")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={`${btn} self-start`} disabled={pending} data-testid="hr-ot-submit">
          {t("submit")}
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** ปุ่มของคำขอหนึ่งรายการ — decide (รออนุมัติ) · revoke (อนุมัติแล้ว + เหตุผล) · cancel (ของตัวเองที่ยังรอ) */
export function OtRowActions({ systemId, id, decide, revoke, cancel }: { systemId: string; id: string; decide: boolean; revoke: boolean; cancel: boolean }) {
  const t = useTranslations("hr.ot");
  const [dState, dRun, dPending] = useActionState<Res, FormData>(decideOtAction, null);
  const [rState, rRun, rPending] = useActionState<Res, FormData>(revokeOtAction, null);
  const [cState, cRun, cPending] = useActionState<Res, FormData>(cancelOtAction, null);
  const hidden = (
    <>
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="id" value={id} />
    </>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {decide && (
        <>
          <form action={dRun}>
            {hidden}
            <input type="hidden" name="decision" value="REJECTED" />
            <button type="submit" className={ghost} disabled={dPending} data-testid="hr-ot-reject">
              {t("reject")}
            </button>
          </form>
          <form action={dRun}>
            {hidden}
            <input type="hidden" name="decision" value="APPROVED" />
            <button type="submit" className={btn} disabled={dPending} data-testid="hr-ot-approve">
              {t("approve")}
            </button>
          </form>
          <Result state={dState} />
        </>
      )}
      {revoke && (
        <form action={rRun} className="flex flex-wrap items-end gap-2">
          {hidden}
          <label className="flex flex-col gap-1 text-xs">
            {t("revokeReason")}
            <input name="reason" required minLength={3} maxLength={200} className="input min-h-[44px] w-48" />
          </label>
          <button type="submit" className={ghost} disabled={rPending} data-testid="hr-ot-revoke">
            {t("revoke")}
          </button>
          <Result state={rState} />
        </form>
      )}
      {cancel && (
        <form action={cRun}>
          {hidden}
          <button type="submit" className={ghost} disabled={cPending} data-testid="hr-ot-cancel">
            {t("cancel")}
          </button>
          <Result state={cState} />
        </form>
      )}
    </div>
  );
}
