// SVC B.5 — มือถือช่าง "ของฉัน" (ใบสั่ง §3.6) · หน่วยแถวเดียวเท่านั้น · ไม่มีสิทธิ์ดู/ร้านเดิม ⇒ notFound
//   ?at= = นาฬิกา QC เฉพาะ SVC_QC_CLOCK=1 · ?err= = เหตุผลจาก action ที่ล้ม
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { AutoRefresh } from "@/components/queue-auto-refresh";
import MyQueue from "@/components/booking/MyQueue";
import { lineActionsFor, qcNowOf } from "@/components/booking/line-page";
import { lineAccess, type LineMember } from "@/lib/modules/booking/line-access";
import { loadTodayLine } from "@/lib/modules/booking/today-line";
import { loadJobCustomerNotes } from "@/lib/modules/booking/customer-notes"; // SVC B.16 ▸ ความชอบ/ข้อห้ามลูกค้าบนมือถือหมอ ◂
// SVC B.10 ▸ แผ่น "เสร็จงาน" (?finish=<เลขบัตร|รหัสนัด>&add=<id,id>) — ภาพ จอง 07 ก ◂
import FinishJobSheet from "@/components/booking/FinishJobSheet";
import { amendServiceBillAction, cancelServiceBillAction, finishJobAction, voidPaidServiceBillAction } from "@/lib/actions/booking-line";
import { appointmentIdForFinish, authorizeServiceBillOp, extrasFromIds, finishCatalog, previewServiceBill } from "@/lib/modules/booking/finish";

export const dynamic = "force-dynamic";

export default async function BookingMinePage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams?: Promise<{ err?: string; at?: string; finish?: string; add?: string | string[] }>;
}) {
  const { unitSlug } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const err = typeof sp?.err === "string" ? sp.err.slice(0, 300) : "";
  const { auth, unit } = await requireUnit(unitSlug);
  const m: LineMember = {
    role: auth.active.role as LineMember["role"],
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const qc = qcNowOf(sp?.at, process.env.SVC_QC_CLOCK === "1");
  const view = await loadTodayLine({ tenantId: auth.active.tenantId, unitId: unit.id }, { userId: auth.user.id, access: lineAccess(m, unit.id) }, { now: qc.now });
  if (!view) notFound();
  // SVC B.10 ▸ แผ่นจบงาน: งานของสาขานี้ + ผู้ดูทำ "เสร็จ" ได้ (authorizeServiceBillOp · Membership สด) — ไม่ผ่าน = จอ "ของฉัน" ตามเดิม ◂
  const finishKey = typeof sp?.finish === "string" ? sp.finish.slice(0, 200) : "";
  if (finishKey) {
    const ctx = { tenantId: auth.active.tenantId, unitId: unit.id, actorUserId: auth.user.id };
    const apptId = await appointmentIdForFinish(ctx, finishKey, { now: qc.now });
    const gate = apptId ? await authorizeServiceBillOp(ctx, auth.user.id, "finish", apptId) : null;
    if (apptId && gate?.ok) {
      const addRaw = Array.isArray(sp?.add) ? sp.add : typeof sp?.add === "string" ? [sp.add] : [];
      const ids = addRaw.flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean).slice(0, 20);
      const extras = await extrasFromIds(ctx, ids);
      const [preview, catalog] = await Promise.all([previewServiceBill(ctx, apptId, { extras }), finishCatalog(ctx)]);
      if (preview) {
        const bind = (fn: (slug: string, fd: FormData) => Promise<void>) => fn.bind(null, unitSlug);
        return (
          <div className="flex w-full min-w-0 flex-col gap-4">
            {err ? (
              <p role="alert" data-testid="booking-status-error" className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-sm text-[color:var(--color-danger)]">
                {err}
              </p>
            ) : null}
            <FinishJobSheet
              view={preview}
              unitSlug={unitSlug}
              actions={{
                finish: bind(finishJobAction),
                amend: bind(amendServiceBillAction),
                ...((await authorizeServiceBillOp(ctx, auth.user.id, "cancel", apptId)).ok ? { cancel: bind(cancelServiceBillAction), voidPaid: bind(voidPaidServiceBillAction) } : {}),
              }}
              at={qc.at}
              catalog={catalog}
              finishKey={finishKey}
            />
          </div>
        );
      }
    }
  }
  // SVC B.16 ▸ โน้ตลูกค้าของงานบนจอ (คีย์ booking.customer.notes + นโยบายอ่อนไหวของสมาชิก · ไม่มีสิทธิ์ = {} = จอเดิม) ◂
  const notes = await loadJobCustomerNotes(
    { tenantId: auth.active.tenantId, unitId: unit.id },
    { userId: auth.user.id, member: m },
    [...view.waiting, ...view.inService, ...view.skipped].map((j) => j.appointmentId),
    { page: "booking.mine", now: qc.now },
  );
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <AutoRefresh />
      {err ? (
        <p role="alert" data-testid="booking-status-error" className="rounded-xl border border-[color:var(--color-danger)] px-4 py-3 text-sm text-[color:var(--color-danger)]">
          {err}
        </p>
      ) : null}
      <MyQueue view={view} unitSlug={unitSlug} actions={lineActionsFor(unitSlug)} at={qc.at} notes={notes} />
    </div>
  );
}
