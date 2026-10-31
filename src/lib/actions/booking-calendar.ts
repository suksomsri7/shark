"use server";

// SVC B.14 — server actions ของปฏิทินนัด (ใบสั่ง §1 · §4) · ทุกตัว (unitSlug, formData):
//   requireUnit → assertBookingActionAllowed (ด่านสิทธิ์ต่อ action) → facade (actor จาก session) → scheduleDrain + revalidate
//   ล้ม ⇒ redirect กลับปฏิทิน (มุมมองเดิม) ?err= เหตุผลไทย ≤ 300 · ไม่ throw ข้อผิดพลาดธุรกิจ
//   🔴 นาฬิกา QC: ฟิลด์ `at` ใช้เฉพาะเมื่อ process.env.SVC_QC_CLOCK === "1" (prod ไม่ตั้ง ⇒ นาฬิกาจริงเสมอ)
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import { assertBookingActionAllowed } from "@/lib/modules/booking/access";
import { bookForCustomer, moveAppointment, type CalendarActor } from "@/lib/modules/booking/calendar";
import { scheduleDrain } from "@/lib/outbox-consumers";

type Auth = Awaited<ReturnType<typeof requireUnit>>["auth"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function actorOf(auth: Auth): CalendarActor {
  return {
    role: auth.active.role as CalendarActor["role"],
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.user.id,
  };
}
const memberOf = (auth: Auth) => {
  const a = actorOf(auth);
  return { role: a.role, unitAccess: a.unitAccess, permissions: a.permissions };
};

/** นาฬิกา QC (เฉพาะ SVC_QC_CLOCK=1) */
function qcAtOf(formData: FormData): { now: Date | undefined; at: string | null } {
  if (process.env.SVC_QC_CLOCK !== "1") return { now: undefined, at: null };
  const raw = String(formData.get("at") ?? "");
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? { now: d, at: raw } : { now: undefined, at: null };
}

/** URL ของมุมมองปฏิทินที่ผู้ใช้อยู่ (ค่าจากฟอร์มผ่านรูปแบบที่อนุญาตเท่านั้น) */
function viewUrl(unitSlug: string, formData: FormData, extra: Record<string, string>, at: string | null): string {
  const q = new URLSearchParams();
  const v = (k: string) => String(formData.get(k) ?? "");
  if (DATE.test(v("viewDate"))) q.set("date", v("viewDate"));
  if (v("viewRange") === "week") q.set("range", "week");
  if (v("viewBy") === "resource") q.set("by", "resource");
  if (ID.test(v("viewWho"))) q.set("who", v("viewWho"));
  for (const [k, x] of Object.entries(extra)) q.set(k, x);
  if (at) q.set("at", at);
  return `/app/u/${unitSlug}/booking/calendar${q.size ? `?${q.toString()}` : ""}`;
}

function done(unitSlug: string): void {
  scheduleDrain();
  revalidatePath(`/app/u/${unitSlug}/booking`);
  revalidatePath(`/app/u/${unitSlug}/booking/calendar`);
  revalidatePath(`/app/u/${unitSlug}/booking/mine`);
}

const MoveForm = z.object({
  appointmentId: z.string().min(1).max(64),
  dateStr: z.string().regex(DATE),
  startMin: z.coerce.number().int().min(0).max(1439),
  staffId: z.string().max(64).optional(),
  resourceId: z.string().max(64).optional(),
  expectStartAt: z.string().min(1).max(64),
  expectStaffId: z.string().min(1).max(64),
});

/** ลากย้าย / ฟอร์ม "ย้ายหมอ·ห้อง" / "เลื่อนนัด" — ตัวเดียวกัน (rescheduleByShop ผ่าน moveAppointment) */
export async function moveAppointmentAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingActionAllowed(memberOf(auth), unit.id, "moveAppointmentAction");
  const qc = qcAtOf(formData);
  const opt = (k: string) => {
    const x = String(formData.get(k) ?? "").trim();
    return x ? x : undefined;
  };
  const p = MoveForm.safeParse({
    appointmentId: String(formData.get("appointmentId") ?? ""),
    dateStr: String(formData.get("dateStr") ?? ""),
    startMin: String(formData.get("startMin") ?? ""),
    staffId: opt("staffId"),
    resourceId: opt("resourceId"),
    expectStartAt: String(formData.get("expectStartAt") ?? ""),
    expectStaffId: String(formData.get("expectStaffId") ?? ""),
  });
  if (!p.success) redirect(viewUrl(unitSlug, formData, { err: "ข้อมูลการย้ายไม่ครบหรือไม่ถูกต้อง กรุณาลองใหม่" }, qc.at));
  const f = p.data;
  const r = await moveAppointment(
    actorOf(auth),
    { tenantId: auth.active.tenantId, unitId: unit.id },
    f.appointmentId,
    { dateStr: f.dateStr, startMin: f.startMin, ...(f.staffId ? { staffId: f.staffId } : {}), ...(f.resourceId ? { resourceId: f.resourceId } : {}) },
    { expect: { startAt: f.expectStartAt, staffId: f.expectStaffId }, now: qc.now },
  );
  if (!r.ok) redirect(viewUrl(unitSlug, formData, { err: (r.reason || "ย้ายนัดไม่สำเร็จ").slice(0, 300), appt: f.appointmentId }, qc.at));
  done(unitSlug);
  redirect(viewUrl(unitSlug, formData, { appt: f.appointmentId }, qc.at));
}

const BookForm = z.object({
  serviceId: z.string().min(1).max(64),
  staffId: z.string().max(64).optional(),
  dateStr: z.string().regex(DATE),
  startMin: z.coerce.number().int().min(0).max(1439),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(1).max(40),
  note: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(80),
});

/** คลิกช่องว่าง / "+ จองให้ลูกค้า" — bookAppointment ช่อง STAFF (ผ่าน bookForCustomer) */
export async function bookForCustomerAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingActionAllowed(memberOf(auth), unit.id, "bookForCustomerAction");
  const qc = qcAtOf(formData);
  const s = (k: string) => String(formData.get(k) ?? "");
  const p = BookForm.safeParse({
    serviceId: s("serviceId"),
    staffId: s("staffId").trim() || undefined,
    dateStr: s("dateStr"),
    startMin: s("startMin"),
    customerName: s("customerName"),
    customerPhone: s("customerPhone"),
    note: s("note").trim() || undefined,
    idempotencyKey: s("idempotencyKey"),
  });
  if (!p.success) redirect(viewUrl(unitSlug, formData, { err: "กรอกบริการ เวลา ชื่อ และเบอร์ลูกค้าให้ครบ" }, qc.at));
  const f = p.data;
  const r = await bookForCustomer(actorOf(auth), { tenantId: auth.active.tenantId, unitId: unit.id }, {
    serviceId: f.serviceId,
    staffId: f.staffId ?? null,
    dateStr: f.dateStr,
    startMin: f.startMin,
    customerName: f.customerName,
    customerPhone: f.customerPhone,
    ...(f.note ? { note: f.note } : {}),
    idempotencyKey: f.idempotencyKey,
  });
  if (!r.ok) redirect(viewUrl(unitSlug, formData, { err: (r.reason || "จองไม่สำเร็จ").slice(0, 300) }, qc.at));
  done(unitSlug);
  redirect(viewUrl(unitSlug, formData, { appt: r.id }, qc.at));
}
