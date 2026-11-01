"use server";

// SVC D.15-K2 ▸ action ของจอ "อาคาร · ชั้น · ห้อง · ประเภทห้อง" (/dorm/settings/rooms)
//   ร้าน/ผู้กระทำมาจาก session เท่านั้น (requireUnit) · ด่านสิทธิ์ + ขอบเขตอาคารตรวจซ้ำสดใน facade หอ (setup.ts) · ไม่ผ่าน ⇒ ข้อความเดียว
// 🔴 ไฟล์ "use server": export async function เท่านั้น
import { refresh } from "next/cache";
import { requireUnit } from "@/lib/core/context";
import {
  DORM_SETUP_NF_REASON,
  archiveDormRoom,
  archiveDormRoomType,
  removeDormBuilding,
  saveDormBuilding,
  saveDormRoom,
  saveDormRoomType,
  type DormSetupResult,
} from "@/lib/modules/dorm";

type Out = { ok: true } | { ok: false; reason: string };

async function ctxOf(unitSlug: unknown) {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  if (unit.type !== "DORM") return null;
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, unitId: unit.id };
}
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null);
/** "4,500.50" / "4500" → สตางค์ · ไม่ใช่ตัวเลข ⇒ NaN (facade ปฏิเสธ) */
const bahtToSatang = (v: unknown): number => {
  const s = typeof v === "string" ? v.replace(/,/g, "").trim() : typeof v === "number" ? String(v) : "";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  const [b, d = ""] = s.split(".");
  return Number(b) * 100 + Number(d.padEnd(2, "0"));
};
/** ช่องว่าง ⇒ undefined (ค่าเริ่ม 0) · ตัวเลขล้วน ⇒ จำนวน · อื่น ⇒ NaN (facade ปฏิเสธ) */
const optInt = (v: unknown): number | undefined => {
  const t = typeof v === "string" ? v.replace(/,/g, "").trim() : "";
  if (!t) return undefined;
  return /^\d{1,10}$/.test(t) ? Number(t) : Number.NaN;
};
const int = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && /^\d{1,3}$/.test(v.trim()) ? Number(v.trim()) : Number.NaN);
function done(r: DormSetupResult): Out {
  if (r.ok) {
    refresh();
    return { ok: true };
  }
  return { ok: false, reason: r.reason };
}
const NF: Out = { ok: false, reason: DORM_SETUP_NF_REASON };

export async function saveDormBuildingAction(unitSlug: string, input: unknown): Promise<Out> {
  const c = await ctxOf(unitSlug);
  if (!c) return NF;
  const i = rec(input);
  return done(await saveDormBuilding(c.ctx, { unitId: c.unitId, buildingId: str(i.buildingId), name: i.name, floors: int(i.floors) }));
}

export async function removeDormBuildingAction(unitSlug: string, input: unknown): Promise<Out> {
  const c = await ctxOf(unitSlug);
  if (!c) return NF;
  return done(await removeDormBuilding(c.ctx, { unitId: c.unitId, buildingId: str(rec(input).buildingId) ?? "" }));
}

export async function saveDormRoomTypeAction(unitSlug: string, input: unknown): Promise<Out> {
  const c = await ctxOf(unitSlug);
  if (!c) return NF;
  const i = rec(input);
  return done(await saveDormRoomType(c.ctx, { unitId: c.unitId, roomTypeId: str(i.roomTypeId), name: i.name, monthlyRateSatang: bahtToSatang(i.rentBaht) }));
}

export async function archiveDormRoomTypeAction(unitSlug: string, input: unknown): Promise<Out> {
  const c = await ctxOf(unitSlug);
  if (!c) return NF;
  return done(await archiveDormRoomType(c.ctx, { unitId: c.unitId, roomTypeId: str(rec(input).roomTypeId) ?? "" }));
}

export async function saveDormRoomAction(unitSlug: string, input: unknown): Promise<Out> {
  const c = await ctxOf(unitSlug);
  if (!c) return NF;
  const i = rec(input);
  return done(
    await saveDormRoom(c.ctx, { unitId: c.unitId, roomId: str(i.roomId), number: i.number, buildingId: str(i.buildingId), floorNo: int(i.floorNo), roomTypeId: str(i.roomTypeId), elecStart: optInt(i.elecStart), waterStart: optInt(i.waterStart) }),
  );
}

export async function archiveDormRoomAction(unitSlug: string, input: unknown): Promise<Out> {
  const c = await ctxOf(unitSlug);
  if (!c) return NF;
  return done(await archiveDormRoom(c.ctx, { unitId: c.unitId, roomId: str(rec(input).roomId) ?? "" }));
}
