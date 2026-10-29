"use server";
// SVC D.6 ▸ action หน้าจดมิเตอร์ — ร้าน/ผู้กระทำมาจาก session เท่านั้น (ไม่รับ tenantId/userId จาก input) · ด่าน requireUnit + dormAccess(...).meter
//   ไม่ throw ให้ผู้ใช้เห็น stack: ไม่มีสิทธิ์/ข้อมูลผิด ⇒ { ok:false, code, reason (ไทย) } · รูปรับเป็น dataURL (≤ 5 MB หลังถอดรหัส)
import { revalidatePath } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { confirmReading, dormAccess, replaceMeter, submitReadings } from "@/lib/modules/dorm";

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/=]+)$/;

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const refuse = (code: string, reason: string) => ({ ok: false as const, code, reason });

async function gate(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (unit.type !== "DORM" || !dormAccess(m, unit.id).meter) return null;
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, unitId: unit.id };
}

const NO_ACCESS = refuse("FORBIDDEN", "ไม่มีสิทธิ์จดมิเตอร์ของหอนี้");
const BAD_INPUT = refuse("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");

function photoOf(v: unknown): { data: Uint8Array; contentType: string } | null {
  if (!isRec(v) || typeof v.dataUrl !== "string") return null;
  const m = DATA_URL.exec(v.dataUrl);
  if (!m) return null;
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length === 0 || bytes.length > PHOTO_MAX_BYTES) return null;
  return { data: new Uint8Array(bytes), contentType: m[1] };
}

export async function submitMeterReadingsAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || typeof input.periodKey !== "string" || !Array.isArray(input.items)) return BAD_INPUT;
  const items: { meterId: string; value: number; readAt?: string; clientKey?: string; photo?: { data: Uint8Array; contentType: string } | null }[] = [];
  for (const it of input.items) {
    if (!isRec(it) || typeof it.meterId !== "string" || typeof it.value !== "number") return BAD_INPUT;
    items.push({
      meterId: it.meterId,
      value: it.value,
      ...(typeof it.readAt === "string" ? { readAt: it.readAt } : {}),
      ...(typeof it.clientKey === "string" ? { clientKey: it.clientKey.slice(0, 80) } : {}),
      photo: photoOf(it.photo),
    });
  }
  const res = await submitReadings(g.ctx, { unitId: g.unitId, periodKey: input.periodKey, items });
  if (res.ok) revalidatePath(`/app/u/${unitSlug}/dorm/meter`);
  return res;
}

export async function confirmMeterReadingAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || typeof input.readingId !== "string" || (input.action !== "ACCEPT" && input.action !== "REREAD")) return BAD_INPUT;
  const res = await confirmReading(g.ctx, {
    unitId: g.unitId,
    readingId: input.readingId,
    action: input.action,
    ...(typeof input.value === "number" ? { value: input.value } : {}),
    note: typeof input.note === "string" ? input.note : null,
  });
  if (res.ok) revalidatePath(`/app/u/${unitSlug}/dorm/meter`);
  return res;
}

export async function replaceMeterAction(unitSlug: string, input: unknown) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!isRec(input) || typeof input.meterId !== "string" || typeof input.oldFinalReading !== "number" || typeof input.newStartReading !== "number") return BAD_INPUT;
  const res = await replaceMeter(g.ctx, {
    unitId: g.unitId,
    meterId: input.meterId,
    oldFinalReading: input.oldFinalReading,
    newStartReading: input.newStartReading,
    readingId: typeof input.readingId === "string" ? input.readingId : null,
  });
  if (res.ok) revalidatePath(`/app/u/${unitSlug}/dorm/meter`);
  return res;
}
