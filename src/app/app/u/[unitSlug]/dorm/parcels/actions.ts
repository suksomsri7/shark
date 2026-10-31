"use server";
// SVC D.18 ▸ action จอพัสดุ — ร้าน/ผู้กระทำมาจาก session เท่านั้น (requireUnit → auth.active) · ไม่รับรหัสร้าน/หน่วย/ผู้ใช้จากฟอร์ม
//   สิทธิ์ dorm.parcel.manage + ขอบเขตอาคารตรวจสดใน facade ทุกครั้ง — ไม่ผ่าน ⇒ NOT_FOUND · ไม่ throw ให้ผู้ใช้เห็น stack
import { revalidatePath } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import { pickupParcel, receiveParcel, returnParcel } from "@/lib/modules/dorm";

const refuse = (code: string, reason: string) => ({ ok: false as const, code, reason });
const NO_ACCESS = refuse("NOT_FOUND", "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการพัสดุ");
const BAD_INPUT = refuse("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
const MAX_BYTES = 10 * 1024 * 1024;

const text = (fd: FormData, k: string): string => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
async function fileFrom(fd: FormData, k: string): Promise<{ data: Uint8Array; contentType: string } | undefined> {
  const v = fd.get(k);
  if (!v || typeof v === "string" || v.size === 0 || v.size > MAX_BYTES) return undefined;
  return { data: new Uint8Array(await v.arrayBuffer()), contentType: v.type || "application/octet-stream" };
}

async function gate(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") return null;
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, unitId: unit.id };
}
const refresh = (unitSlug: string) => revalidatePath(`/app/u/${unitSlug}/dorm/parcels`);

export async function receiveParcelAction(unitSlug: string, prev: unknown, formData: FormData) {
  void prev;
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!(formData instanceof FormData)) return BAD_INPUT;
  const r = await receiveParcel(g.ctx, {
    unitId: g.unitId,
    roomId: text(formData, "roomId"),
    carrier: text(formData, "carrier") || null,
    trackingNo: text(formData, "trackingNo") || null,
    photo: await fileFrom(formData, "photo"),
    idempotencyKey: text(formData, "idempotencyKey"),
  });
  refresh(unitSlug);
  return r;
}

export async function pickupParcelAction(unitSlug: string, prev: unknown, formData: FormData) {
  void prev;
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!(formData instanceof FormData)) return BAD_INPUT;
  const token = text(formData, "token");
  const parcelId = text(formData, "parcelId") || null;
  const r = token
    ? await pickupParcel(g.ctx, { unitId: g.unitId, parcelId, proof: { kind: "SCAN", token } })
    : await (async () => {
        const file = await fileFrom(formData, "signature");
        if (!file) return refuse("INVALID_FILE", "ต้องเซ็นชื่อผู้รับก่อนบันทึก");
        return pickupParcel(g.ctx, { unitId: g.unitId, parcelId, proof: { kind: "SIGNATURE", file } });
      })();
  refresh(unitSlug);
  return r;
}

export async function returnParcelAction(unitSlug: string, prev: unknown, formData: FormData) {
  void prev;
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  if (!(formData instanceof FormData)) return BAD_INPUT;
  const r = await returnParcel(g.ctx, { unitId: g.unitId, parcelId: text(formData, "parcelId"), reason: text(formData, "reason") });
  refresh(unitSlug);
  return r;
}
