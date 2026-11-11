"use server";
// SVC D.5 ▸ action ผู้เช่า/สัญญา — ร้าน/ผู้กระทำมาจาก session เท่านั้น (ไม่รับรหัสร้าน/ผู้ใช้จากอินพุต) · ด่าน requireUnit + หน่วย DORM + leaseAccess(...).manage
//   ไม่ throw ให้ผู้ใช้เห็น stack: ไม่มีสิทธิ์/ข้อมูลผิด ⇒ { ok:false, code, reason (ไทย) }
//   ไฟล์รับ base64 / dataURL หรือ File จากฟอร์ม (≤ 10 MB ต่อไฟล์ — ด่านชนิด/ขนาดจริงอยู่ใน facade)
//   *FormAction = ตัวห่อสำหรับ <form action> ของหน้าทำสัญญาใหม่ (ไม่ใช้ JS ฝั่งเครื่อง) — ทำแล้ว redirect กลับพร้อมผลใน query
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { addLeaseFiles, cancelLease, createLease, findTenantCandidates, leaseAccess, moveIn, receiveBookingFee, signLease, updateLeaseOccupants } from "@/lib/modules/dorm";

const FILE_MAX_BYTES = 10 * 1024 * 1024;
const DATA_URL = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i;
type Rec = Record<string, unknown>;
type InFile = { data: Uint8Array; contentType: string };

const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof FormData);
const refuse = (code: string, reason: string) => ({ ok: false as const, code, reason });
const NO_ACCESS = refuse("NOT_FOUND", "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์จัดการผู้เช่าและสัญญา");
const BAD_INPUT = refuse("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
const BAD_FILE = refuse("INVALID_FILE", "ไฟล์ไม่ถูกต้องหรือใหญ่เกิน 10 MB");

async function gate(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (unit.type !== "DORM" || !leaseAccess(m, unit.id).manage) return null;
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, unitId: unit.id };
}

/** FormData ⇒ object ธรรมดา (ค่าเดียวต่อคีย์ · File คงไว้) */
function recOf(input: unknown): Rec | null {
  if (input instanceof FormData) {
    const o: Rec = {};
    for (const [k, v] of input.entries()) {
      if (k.startsWith("$ACTION")) continue;
      if (o[k] === undefined) o[k] = v;
      else o[k] = Array.isArray(o[k]) ? [...(o[k] as unknown[]), v] : [o[k], v];
    }
    return o;
  }
  return isRec(input) ? input : null;
}
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return undefined;
};
/** บาท (ข้อความจากฟอร์ม) ⇒ สตางค์ · สตางค์ (ตัวเลขจาก JS) คงเดิม */
const satangOf = (o: Rec, satangKey: string, bahtKey: string): number | undefined => {
  if (typeof o[satangKey] === "number") return o[satangKey] as number;
  const b = num(o[bahtKey]);
  return b === undefined ? undefined : Math.round(b * 100);
};

async function fileOf(v: unknown): Promise<InFile | null> {
  if (typeof File !== "undefined" && v instanceof File) {
    if (v.size === 0 || v.size > FILE_MAX_BYTES) return null;
    return { data: new Uint8Array(await v.arrayBuffer()), contentType: v.type };
  }
  const raw = isRec(v) ? (typeof v.dataUrl === "string" ? v.dataUrl : typeof v.base64 === "string" ? `data:${String(v.contentType ?? "")};base64,${v.base64}` : null) : typeof v === "string" ? v : null;
  if (!raw) return null;
  const m = DATA_URL.exec(raw);
  if (!m) return null;
  const bytes = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  if (bytes.length === 0 || bytes.length > FILE_MAX_BYTES) return null;
  return { data: new Uint8Array(bytes), contentType: m[1].toLowerCase() };
}
async function filesOf(v: unknown): Promise<InFile[] | null> {
  const arr = Array.isArray(v) ? v : v === undefined ? [] : [v];
  const out: InFile[] = [];
  for (const x of arr) {
    if (typeof File !== "undefined" && x instanceof File && x.size === 0) continue; // ช่องไฟล์ว่างของฟอร์ม
    const f = await fileOf(x);
    if (!f) return null;
    out.push(f);
  }
  return out;
}
const paidAtOf = (v: unknown): Date | undefined => {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v.trim());
    return Number.isNaN(d.getTime()) ? new Date(NaN) : d;
  }
  return undefined;
};
const channelOf = (v: unknown) => (v === "CASH" || v === "TRANSFER" || v === "PROMPTPAY" ? v : undefined);
const peopleOf = (v: unknown): { name: string; phone?: string | null }[] | undefined =>
  Array.isArray(v) ? (v as { name: string; phone?: string | null }[]) : typeof v === "string" && v.trim() ? v.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ name: l })) : undefined;
const vehiclesOf = (v: unknown): { plate: string; kind: "CAR" | "MOTORBIKE" | "OTHER"; note?: string | null }[] | undefined =>
  Array.isArray(v) ? (v as { plate: string; kind: "CAR" | "MOTORBIKE" | "OTHER"; note?: string | null }[]) : typeof v === "string" && v.trim() ? v.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ plate: l, kind: "OTHER" as const })) : undefined;

function revalidate(unitSlug: string) {
  revalidatePath(`/app/u/${unitSlug}/dorm/tenants`);
  revalidatePath(`/app/u/${unitSlug}/dorm`);
}

export async function createLeaseAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const o = recOf(input);
  if (!o || !str(o.roomId) || !str(o.startDate)) return BAD_INPUT;
  const months = num(o.months);
  if (months === undefined) return BAD_INPUT;
  const tenant = str(o.partyId)
    ? { partyId: str(o.partyId)! }
    : {
        name: str(o.name) ?? "",
        phone: str(o.phone) ?? null,
        idCardNo: str(o.idCardNo) ?? null,
        email: str(o.email) ?? null,
        confirmPartyId: str(o.confirmPartyId) ?? null,
        createNewParty: o.createNewParty === true || o.createNewParty === "on" || o.createNewParty === "1",
      };
  const reason = str(o.legalAckReason);
  const res = await createLease(g.ctx, {
    unitId: g.unitId,
    roomId: str(o.roomId)!,
    startDate: str(o.startDate)!,
    months,
    tenant,
    rentSatang: satangOf(o, "rentSatang", "rentBaht"),
    commonFeeSatang: satangOf(o, "commonFeeSatang", "commonFeeBaht"),
    depositSatang: satangOf(o, "depositSatang", "depositBaht"),
    advanceRentSatang: satangOf(o, "advanceRentSatang", "advanceRentBaht"),
    bookingFeeSatang: satangOf(o, "bookingFeeSatang", "bookingFeeBaht"),
    occupants: peopleOf(o.occupants),
    vehicles: vehiclesOf(o.vehicles),
    legalAck: reason ? { reason } : null,
    note: str(o.note) ?? null,
  });
  if (res.ok) revalidate(unitSlug);
  return res;
}

export async function receiveBookingFeeAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const o = recOf(input);
  if (!o || !str(o.leaseId)) return BAD_INPUT;
  const res = await receiveBookingFee(g.ctx, { unitId: g.unitId, leaseId: str(o.leaseId)!, paidAt: paidAtOf(o.paidAt), channel: channelOf(o.channel), financeAccountId: str(o.financeAccountId) ?? null });
  if (res.ok) revalidate(unitSlug);
  return res;
}

export async function addLeaseFilesAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const o = recOf(input);
  if (!o || !str(o.leaseId)) return BAD_INPUT;
  const kind = o.kind === "ROOM_PHOTO" || o.kind === "ID_CARD" || o.kind === "DOCUMENT" ? o.kind : null;
  if (!kind) return BAD_INPUT;
  const files = await filesOf(o.files);
  if (!files) return BAD_FILE;
  const res = await addLeaseFiles(g.ctx, { unitId: g.unitId, leaseId: str(o.leaseId)!, kind, files });
  if (res.ok) revalidate(unitSlug);
  return res;
}

export async function signLeaseAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const o = recOf(input);
  if (!o || !str(o.leaseId)) return BAD_INPUT;
  const file = await fileOf(o.file);
  if (!file) return BAD_FILE;
  const method = o.method === "ON_SCREEN" || o.method === "PAPER" ? o.method : undefined;
  const res = await signLease(g.ctx, { unitId: g.unitId, leaseId: str(o.leaseId)!, method, file });
  if (res.ok) revalidate(unitSlug);
  return res;
}

export async function moveInAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const o = recOf(input);
  if (!o || !str(o.leaseId)) return BAD_INPUT;
  let meterReadings: { meterId: string; value: number }[] | undefined;
  if (Array.isArray(o.meterReadings)) meterReadings = o.meterReadings as { meterId: string; value: number }[];
  const res = await moveIn(g.ctx, { unitId: g.unitId, leaseId: str(o.leaseId)!, paidAt: paidAtOf(o.paidAt), channel: channelOf(o.channel), financeAccountId: str(o.financeAccountId) ?? null, meterReadings });
  if (res.ok) revalidate(unitSlug);
  return res;
}

export async function cancelLeaseAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const o = recOf(input);
  if (!o || !str(o.leaseId)) return BAD_INPUT;
  const res = await cancelLease(g.ctx, { unitId: g.unitId, leaseId: str(o.leaseId)!, reason: str(o.reason) ?? "" });
  if (res.ok) revalidate(unitSlug);
  return res;
}

export async function updateLeaseOccupantsAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const o = recOf(input);
  if (!o || !str(o.leaseId)) return BAD_INPUT;
  const res = await updateLeaseOccupants(g.ctx, { unitId: g.unitId, leaseId: str(o.leaseId)!, occupants: peopleOf(o.occupants) ?? [], vehicles: vehiclesOf(o.vehicles) ?? [] });
  if (res.ok) revalidate(unitSlug);
  return res;
}

// ── ตัวห่อฟอร์ม (หน้าทำสัญญาใหม่) — ผลส่งกลับทาง query (?lease=&done=|err=&msg=) ──
type StepResult = { ok: true; leaseId?: string } | { ok: false; code: string; reason: string };
function back(unitSlug: string, leaseId: string | undefined, step: string, res: StepResult): never {
  const p = new URLSearchParams();
  const id = (res.ok && res.leaseId) || leaseId;
  if (id) p.set("lease", id);
  if (res.ok) p.set("done", step);
  else {
    p.set("err", res.code);
    p.set("msg", res.reason.slice(0, 300));
  }
  redirect(`/app/u/${unitSlug}/dorm/tenants/new?${p.toString()}`);
}

export async function createLeaseFormAction(unitSlug: string, formData: FormData): Promise<void> {
  const res = await createLeaseAction(unitSlug, formData);
  back(unitSlug, undefined, "create", res.ok ? { ok: true, leaseId: res.leaseId } : res);
}
export async function receiveBookingFeeFormAction(unitSlug: string, formData: FormData): Promise<void> {
  const res = await receiveBookingFeeAction(unitSlug, formData);
  back(unitSlug, str(formData.get("leaseId")), "booking", res.ok ? { ok: true } : res);
}
export async function addLeaseFilesFormAction(unitSlug: string, formData: FormData): Promise<void> {
  const res = await addLeaseFilesAction(unitSlug, formData);
  back(unitSlug, str(formData.get("leaseId")), "files", res.ok ? { ok: true } : res);
}
export async function signLeaseFormAction(unitSlug: string, formData: FormData): Promise<void> {
  const res = await signLeaseAction(unitSlug, formData);
  back(unitSlug, str(formData.get("leaseId")), "sign", res.ok ? { ok: true } : res);
}
export async function moveInFormAction(unitSlug: string, formData: FormData): Promise<void> {
  const res = await moveInAction(unitSlug, formData);
  back(unitSlug, str(formData.get("leaseId")), "movein", res.ok ? { ok: true } : res);
}
export async function cancelLeaseFormAction(unitSlug: string, formData: FormData): Promise<void> {
  const res = await cancelLeaseAction(unitSlug, formData);
  back(unitSlug, str(formData.get("leaseId")), "cancel", res.ok ? { ok: true } : res);
}

// K4 ▸ ค้นผู้เช่าเดิมด้วยเบอร์/เลขบัตรผ่าน POST (ไม่อยู่ใน URL/ประวัติเบราว์เซอร์/log) — ใช้กับ useActionState ของหน้าทำสัญญาใหม่
//   คืนเฉพาะชื่อ + เบอร์ปิด 4 ตัวท้าย + ชนิดที่ตรง (ไม่มีเลขบัตร/เบอร์เต็ม) · ไม่ log ค่าที่ค้น
export async function findTenantCandidatesAction(
  unitSlug: string,
  _prev: unknown,
  formData: FormData,
): Promise<{ ok: true; searched: boolean; candidates: { partyId: string; name: string; phoneMasked: string | null; matchedBy: "ID_CARD" | "PHONE"; activeLeases: number }[] } | { ok: false; code: string; reason: string }> {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const phone = str(formData.get("findPhone"))?.slice(0, 30) ?? null;
  const idCardNo = str(formData.get("findId"))?.slice(0, 20) ?? null;
  if (!phone && !idCardNo) return { ok: true, searched: false, candidates: [] };
  const candidates = await findTenantCandidates(g.ctx, { unitId: g.unitId, phone, idCardNo });
  return { ok: true, searched: true, candidates };
}
