// ที่อยู่/แผนที่ของสาขา (WO-CV14 ข · ปิดหนี้ D14)
//
// ทำไมถึงอยู่ใน `BusinessUnit.settings` ไม่ใช่คอลัมน์ของตัวเอง: สคีมาตั้งใจให้ `settings`
// เป็นที่เก็บ "ค่าประจำสาขา" อยู่แล้ว (timezone/openHours/account…) และปุ่ม "แผนที่ร้าน"
// ในกล่องแชท (`chat/room-actions.ts:shopLocationAction`) อ่านจากที่นั่นมาตั้งแต่รอบ V2
// ⇒ หน้าตั้งค่านี้คือ "ฝั่งกรอก" ของข้อมูลชุดเดิม ไม่ใช่ที่เก็บที่สอง (และไม่ต้องมี migration)
//
// 🔴 `settings` เป็น Json **ก้อนเดียว** ของทั้งสาขา ⇒ ต้อง read-modify-write เสมอ
//    เขียนทับทั้งก้อน = ตั้งค่าภาษี/เวลาทำการของสาขานั้นหายไปเงียบ ๆ (กู้ไม่ได้ ไม่มีใครรู้ตัว)
// 🔴 `mapUrl` รับเฉพาะ `https://` — ค่านี้ถูกส่งให้ **ลูกค้า** กดต่อ ⇒ `javascript:`/`data:`
//    คือช่องยิงสคริปต์ผ่านห้องแชท และ `http://` คือลิงก์ที่มือถือสมัยนี้เตือนว่าไม่ปลอดภัย

import { tenantDb } from "@/lib/core/db";
import {
  readUnitLocation,
  parseUnitLocationInput,
  settingsObject,
  type UnitLocation,
  type UnitLocationInput,
} from "./location-fields";

// ส่วนที่ไม่แตะ DB อยู่ที่ `location-fields.ts` (ฟอร์มฝั่ง client ใช้ได้) — ส่งต่อออกไปจากที่นี่ด้วย
// เพื่อให้ฝั่งเซิร์ฟเวอร์ import จุดเดียวจบ ไม่ต้องจำว่าอะไรอยู่ไฟล์ไหน
export * from "./location-fields";

type Ctx = { tenantId: string };

export type UnitLocationView = { id: string; name: string; location: UnitLocation };

/** อ่านสาขาของร้านนี้ (ร้านอื่น/ไม่มีจริง = `null`) — ใช้ทั้งหน้าตั้งค่าและที่อื่นที่ต้องการ */
export async function getUnitLocation(ctx: Ctx, unitId: string): Promise<UnitLocationView | null> {
  if (!unitId) return null;
  const unit = await tenantDb(ctx).businessUnit.findFirst({
    where: { id: unitId, tenantId: ctx.tenantId },
    select: { id: true, name: true, settings: true },
  });
  if (!unit) return null;
  return { id: unit.id, name: unit.name, location: readUnitLocation(unit.settings) };
}

/**
 * บันทึกที่อยู่/แผนที่ของสาขา
 *
 * 🔴 ระบุ `tenantId` ใน where เอง ไม่พึ่ง guard ของ `tenantDb` อย่างเดียว — ด่านสองชั้น
 *    (guard พังเมื่อไหร่ ที่นี่ยังกันการแก้สาขาของร้านอื่นได้อยู่)
 * 🔴 validate ให้จบก่อน แล้วค่อยแตะ DB — ค่าไม่ผ่าน = ต้องไม่มีการเขียนใด ๆ เกิดขึ้นเลย
 */
export async function saveUnitLocation(
  ctx: Ctx,
  unitId: string,
  input: UnitLocationInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parseUnitLocationInput(input);
  if (!parsed.ok) return parsed;

  const db = tenantDb(ctx);
  const unit = await db.businessUnit.findFirst({
    where: { id: unitId, tenantId: ctx.tenantId },
    select: { id: true, settings: true },
  });
  if (!unit) {
    return { ok: false, error: "ไม่พบสาขานี้ในกิจการของคุณ — กลับไปเลือกสาขาจากหน้าจัดการระบบอีกครั้งได้เลย" };
  }

  // read-modify-write: หยิบก้อนเดิมมาทั้งก้อน แล้วแก้เฉพาะ 4 คีย์นี้
  // ค่าว่าง = ลบคีย์ทิ้ง (ไม่ทิ้ง "" / null ค้างไว้ให้คนอ่านทีหลังเข้าใจผิดว่าตั้งไว้แล้ว)
  const settings = settingsObject(unit.settings);
  const { address, mapUrl, lat, lng } = parsed.value;
  const put = (key: string, value: string | number | null) => {
    if (value === null || value === "") delete settings[key];
    else settings[key] = value;
  };
  put("address", address);
  put("mapUrl", mapUrl);
  put("lat", lat);
  put("lng", lng);

  await db.businessUnit.update({ where: { id: unit.id }, data: { settings } });
  return { ok: true };
}
