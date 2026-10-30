"use server";

// SVC B.7 — server actions สาธารณะของหน้าจัดการนัด (/bq/m/<token>) · ใบสั่ง §5
//   ไม่มี session — token ลิงก์จัดการนัด (อาร์กิวเมนต์แรกที่ bind จากหน้า) คือสิทธิ์ · ด่านจริงอยู่ใน facade online.ts (token · rate limit · กติกา)
//   สำเร็จ ⇒ redirect /bq/m/<token> · ล้ม ⇒ ?err=<รหัส> (หน้าแปลเป็นข้อความเอง · บทเรียน K2) · IP จาก x-forwarded-for ตัวแรก
//   🔴 นาฬิกา QC: ฟิลด์ `at` ใช้เฉพาะเมื่อ process.env.SVC_QC_CLOCK === "1" (prod ไม่ตั้ง ⇒ นาฬิกาจริงเสมอ)
//   🔴 ไฟล์ "use server": export async function เท่านั้น
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { cancelOnline, rescheduleOnline } from "@/lib/modules/booking/online";
import { submitDepositSlip } from "@/lib/modules/booking/deposit"; // SVC B.8

function qcOf(formData: FormData): { now?: Date; at: string | null } {
  if (process.env.SVC_QC_CLOCK !== "1") return { at: null };
  const raw = String(formData.get("at") ?? "");
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? { now: d, at: raw } : { at: null };
}
async function ipOf(): Promise<string> {
  return ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}
function back(token: string, at: string | null, err?: string): never {
  const q = new URLSearchParams();
  if (err && /^[A-Z_]{1,40}$/.test(err)) q.set("err", err);
  if (at) q.set("at", at);
  const qs = q.toString();
  redirect(`/bq/m/${encodeURIComponent(token)}${qs ? `?${qs}` : ""}`);
}

export async function cancelBookingAction(token: string, formData: FormData): Promise<void> {
  const qc = qcOf(formData);
  const r = await cancelOnline(token, { ip: await ipOf(), ...(qc.now ? { now: qc.now } : {}) });
  if (r.ok) scheduleDrain();
  back(token, qc.at, r.ok ? undefined : r.code);
}

export async function rescheduleBookingAction(token: string, formData: FormData): Promise<void> {
  const qc = qcOf(formData);
  const date = String(formData.get("date") ?? "").slice(0, 10);
  const startMin = Number(String(formData.get("startMin") ?? ""));
  const staff = String(formData.get("staffId") ?? "").trim().slice(0, 100);
  const r = await rescheduleOnline(
    token,
    { dateStr: date, startMin: Number.isFinite(startMin) ? startMin : -1, staffId: staff || null },
    { ip: await ipOf(), ...(qc.now ? { now: qc.now } : {}) },
  );
  if (r.ok) scheduleDrain();
  back(token, qc.at, r.ok ? undefined : r.code);
}

// SVC B.8 ▸ แนบสลิปมัดจำ (ไฟล์ `slip` ≤ 5MB · `idempotencyKey`) — ยอดคาด/นโยบายตรวจมาจากฝั่งเซิร์ฟเวอร์ทั้งหมด (ไม่ส่งค่าอื่นจากฟอร์ม) ◂
export async function submitDepositSlipAction(token: string, formData: FormData): Promise<void> {
  const qc = qcOf(formData);
  const f = formData.get("slip");
  const key = String(formData.get("idempotencyKey") ?? "").slice(0, 100);
  const qr = formData.get("qrPayload");
  if (!(f instanceof File) || f.size <= 0 || f.size > 5 * 1024 * 1024) back(token, qc.at, "BAD_INPUT");
  const data = new Uint8Array(await (f as File).arrayBuffer());
  const r = await submitDepositSlip(
    token,
    { file: { data, contentType: (f as File).type }, idempotencyKey: key, ...(typeof qr === "string" && qr ? { qrPayload: qr.slice(0, 4096) } : {}) },
    { ip: await ipOf(), ...(qc.now ? { now: qc.now } : {}) },
  );
  if (r.ok) scheduleDrain();
  back(token, qc.at, r.ok ? undefined : r.code);
}

// SVC B.8 ▸ ยกเลิกช้า (ลูกค้ายอมให้ร้านเก็บมัดจำ) — ต้องมี acceptForfeit = "1" จากฟอร์มที่แสดงยอดแล้ว ◂
export async function lateCancelBookingAction(token: string, formData: FormData): Promise<void> {
  const qc = qcOf(formData);
  const accept = String(formData.get("acceptForfeit") ?? "") === "1";
  // V3: ยอดที่ลูกค้าเห็นและกดยอมรับ (ตัวเลขจากฟอร์มที่หน้าแสดง) — ยอดจริงสูงกว่า ⇒ ถามใหม่
  const accRaw = Number(String(formData.get("acceptForfeitSatang") ?? ""));
  const acceptForfeitSatang = Number.isSafeInteger(accRaw) && accRaw >= 0 ? accRaw : 0;
  const r = await cancelOnline(token, { acceptForfeit: accept, acceptForfeitSatang, ip: await ipOf(), ...(qc.now ? { now: qc.now } : {}) });
  if (r.ok) scheduleDrain();
  back(token, qc.at, r.ok ? undefined : r.code);
}
