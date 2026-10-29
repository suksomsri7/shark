"use server";

// SVC B.6 — server actions สาธารณะของตู้รับบัตร (/bq/kiosk) และหน้าบัตรลูกค้า (/bq/t) · ใบสั่ง §3.5
//   ไม่มี session/requireUnit — token ของอุปกรณ์/บัตร (อาร์กิวเมนต์แรกที่ bind จากหน้า) คือสิทธิ์ · ด่านจริงอยู่ใน facade public-line
//   ตู้: คืนผลของ facade ให้คอมโพเนนต์ client (useActionState) · หน้าบัตร: สำเร็จ ⇒ redirect /bq/t/<token> · ล้ม ⇒ ?err=<รหัส> (หน้าแปลเป็นข้อความเอง · มติผู้คุม K2)
//   🔴 นาฬิกา QC: ฟิลด์ `at` ใช้เฉพาะเมื่อ process.env.SVC_QC_CLOCK === "1" (prod ไม่ตั้ง ⇒ นาฬิกาจริงเสมอ)
//   🔴 ไฟล์ "use server": export async function เท่านั้น
import { redirect } from "next/navigation";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { cancelTicket, deferTicket, kioskCheckIn, kioskWalkIn } from "@/lib/modules/booking/public-line";

/** นาฬิกา QC จากฟอร์ม (เฉพาะ SVC_QC_CLOCK=1) */
function qcOf(formData: FormData): { now?: Date; at: string | null } {
  if (process.env.SVC_QC_CLOCK !== "1") return { at: null };
  const raw = String(formData.get("at") ?? "");
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? { now: d, at: raw } : { at: null };
}
const field = (fd: FormData, k: string): string => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, 2000) : "";
};
function backToTicket(token: string, at: string | null, err?: string): never {
  const q = new URLSearchParams();
  if (err && /^[A-Z_]{1,40}$/.test(err)) q.set("err", err);
  if (at) q.set("at", at);
  const qs = q.toString();
  redirect(`/bq/t/${encodeURIComponent(token)}${qs ? `?${qs}` : ""}`);
}

export async function kioskCheckInAction(deviceToken: string, _prev: unknown, formData: FormData) {
  void _prev;
  const qc = qcOf(formData);
  const qr = field(formData, "qr");
  const r = await kioskCheckIn(deviceToken, qr ? { qr } : { phone: field(formData, "phone") }, qc.now ? { now: qc.now } : undefined);
  if (r.ok) scheduleDrain();
  return r;
}

export async function kioskWalkInAction(deviceToken: string, _prev: unknown, formData: FormData) {
  void _prev;
  const qc = qcOf(formData);
  const staff = field(formData, "staffId");
  const phone = field(formData, "phone");
  const r = await kioskWalkIn(
    deviceToken,
    { serviceId: field(formData, "serviceId"), staffId: staff || null, ...(phone ? { phone } : {}) },
    qc.now ? { now: qc.now } : undefined,
  );
  if (r.ok) scheduleDrain();
  return r;
}

export async function deferTicketAction(ticketToken: string, formData: FormData): Promise<void> {
  const qc = qcOf(formData);
  const r = await deferTicket(ticketToken, qc.now ? { now: qc.now } : undefined);
  backToTicket(ticketToken, qc.at, r.ok ? undefined : r.code);
}

export async function cancelTicketAction(ticketToken: string, formData: FormData): Promise<void> {
  const qc = qcOf(formData);
  const r = await cancelTicket(ticketToken, qc.now ? { now: qc.now } : undefined);
  if (r.ok) scheduleDrain();
  backToTicket(ticketToken, qc.at, r.ok ? undefined : r.code);
}
