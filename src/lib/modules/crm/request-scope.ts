// request-scope.ts — memo "ต่อ 1 คำขอ" ของด่านที่ทุกบริการ CRM ถามซ้ำ (ระบบ CRM · ทีม/policy ของผู้ดู) — ใบ C5.1-fix
//
// ปัญหาเดิม (วัดบนร้าน 200k ผู้ติดต่อ · ledger/wo-notes/crm-C5.1.md "Guards everywhere"): ทุกฟังก์ชันบริการอ่าน AppSystem ซ้ำ
//   และผู้ดูที่ไม่ใช่เจ้าของร้านสร้างภาพการมองเห็นใหม่ (TeamMember ×2 · CrmVisibilityPolicy · AppSystem) **ต่อการเรียก 1 ครั้ง**
//   ⇒ หน้าที่เรียก 6–8 บริการพร้อมกันจ่ายด่านซ้ำ 6–8 ชุด (หน้า /crm/deals = 48 คำสั่ง · กระดานของ STAFF = 33)
//
// กติกา (🔴 AUDIT-CLASS X1 "ไม่มีแคชข้ามคำขอ" ยังเป็นจริงทุกข้อ):
//   • ที่เก็บ memo มีสองแบบเท่านั้น — (1) `cache()` ของ React = อายุเท่า 1 คำขอของหน้า (RSC) ตามนิยามของ React เอง
//     (แบบเดียวกับ getAuth / attachment.ts) · (2) `crmScope(fn)` = อายุเท่าการเรียก fn ครั้งนั้น (AsyncLocalStorage)
//     นอกสองแบบนี้ (server action · route handler · สคริปต์ QC ที่ไม่ได้ครอบ) ไม่มี memo เลย = อ่านจากฐานทุกครั้งเหมือนเดิม
//   • ไม่มี Map ระดับโมดูล · ไม่มี unstable_cache · ไม่มี TTL ⇒ ย้ายคนออกจากทีมมีผลตั้งแต่คำขอถัดไปเหมือนเดิม
//   • กุญแจ memo มี tenantId + systemId + userId ของผู้ดูเสมอ ⇒ ผลของผู้ดู/ร้าน/ระบบหนึ่งไม่มีทางถูกหยิบไปใช้กับอีกคน
//     (สิ่งที่ขึ้นกับ role/unitAccess/permissions ของ actor ไม่ถูก memo — คำนวณจากแถวดิบใหม่ทุกครั้ง)
//   • memo เฉพาะการอ่านผ่าน client หลัก — ผู้เรียกที่ส่ง `db: tx` (ถือล็อก/อยู่กลาง transaction ที่อาจเพิ่งแก้ทีม) อ่านสดเสมอ
//   • เก็บ "สัญญา" (Promise) ก่อน await ⇒ บริการที่วิ่งพร้อมกันใน Promise.all เดียวกันเกาะคำถามเดียว · ล้มแล้วลบทิ้ง (ไม่จำความล้มเหลว)

import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { prisma } from "./db";

type Store = Map<string, Promise<unknown>>;

const als = new AsyncLocalStorage<Store>();
/** RSC: Map เดียวต่อ 1 คำขอ · นอก RSC: React คืน Map ใหม่ทุกครั้ง (= ไม่มี memo) */
const requestStore = cache((): Store => new Map());

function reactStore(): Store {
  try {
    return requestStore();
  } catch {
    return new Map();
  }
}

/**
 * ครอบการเรียกบริการ 1 ครั้งให้มีขอบเขต memo — ในหน้า (RSC) ใช้ Map ของคำขอนั้น · นอกหน้า = Map ใหม่ของการเรียกนี้
 * ซ้อนกันได้ (ตัวในใช้ขอบเขตของตัวนอก) · 🔴 ใช้กับทางอ่านเท่านั้น — ทางเขียนที่แก้ทีม/policy แล้วอ่านต่อห้ามครอบ
 */
export function crmScope<T>(fn: () => Promise<T>): Promise<T> {
  if (als.getStore()) return fn();
  return als.run(reactStore(), fn);
}

/** memo ต่อคำขอ/ขอบเขต (ดูกติกาหัวไฟล์) — `db` ไม่ใช่ client หลัก = ไม่ memo */
export function requestMemo<T>(key: string, db: unknown, load: () => Promise<T>): Promise<T> {
  if (db !== prisma) return load();
  const store = als.getStore() ?? reactStore();
  const hit = store.get(key);
  if (hit) return hit as Promise<T>;
  const p = load();
  store.set(key, p);
  p.catch(() => {
    if (store.get(key) === p) store.delete(key);
  });
  return p;
}
