// index.ts — ชั้นกลาง realtime ของทั้งระบบ (WO-CV9 · มติ V4 "ใช้บริการสำเร็จรูป")
//
// ═══ สัญญาของชั้นนี้ (ผู้เรียกทุกคนพึ่งได้) ═══
//  1. `realtimeMode()` บอกโหมดปัจจุบัน · `publish()` ส่งสัญญาณ "มีของใหม่"
//  2. 🔴 **ไม่มีกุญแจ = ยังใช้งานได้เหมือนเดิม** — คืนโหมด `polling` · `publish()` คืนทันที
//     ไม่ยิงเน็ต ไม่ throw · หน้าจอยัง poll ทุก 5 วิ เท่าเดิม
//  3. 🔴 **realtime ห้ามเป็นเงื่อนไขของความถูกต้อง** — มันคือ "ตัวเร่ง" ไม่ใช่ "ทางเดียว"
//     ผู้ให้บริการล่ม/โควตาหมดกลางวัน ต้องไม่มีใครสังเกตเห็นนอกจากข้อความเด้งช้าลง
//  4. 🔴 **ห้ามส่งเนื้อความลูกค้าออกไปนอกบ้าน** — `publish()` กรอง payload ด้วยบัญชีขาว
//     (`sanitizeSignal` ใน `events.ts`) ที่ **ขอบ** เสมอ ต่อให้ผู้เรียกเผลอยัดเนื้อความมา
//     ผู้ให้บริการรู้ได้แค่ "ร้านไหน ห้องไหน มีของใหม่เมื่อไหร่" · เนื้อความดึงจากเซิร์ฟเวอร์เราเสมอ
//
// ═══ 🔴 ทำไมต้องตัดสินโหมด "ตอนถูกเรียก" ไม่ใช่ตอน import ═══
//  บน Vercel ตัวแปรถูกฉีดตอนรัน และเจ้าของจะตั้ง `ABLY_API_KEY` ทีหลัง (§8 ของแผน)
//  ถ้าอ่าน env ตอน import แล้วเก็บใส่ค่าคงที่ ⇒ ตั้งกุญแจแล้วต้อง redeploy ถึงจะมีผล
//  และ instance ที่อุ่นอยู่จะยังคิดว่าไม่มีกุญแจต่อไปอีกนาน ⇒ อ่านใหม่ทุกครั้งที่เรียก
//
// เปลี่ยนผู้ให้บริการ = แก้ `ably.ts` ไฟล์เดียว · ไฟล์นี้และ callsite ทุกจุดไม่ต้องรู้ว่าเป็นเจ้าไหน

import { ablyConfigured, ablyPublish } from "./ably";
import { chatChannel, sanitizeSignal } from "./events";

export {
  chatChannel,
  sanitizeSignal,
  SAFE_KEYS,
  EV_CHAT_NEW,
  EV_CHAT_TYPING,
  EV_CHAT_READ,
  TYPING_TTL_MS,
  TYPING_PING_MS,
  type Signal,
} from "./events";

export type RealtimeMode = "polling" | "realtime";

/**
 * โหมดปัจจุบัน — `"realtime"` เมื่อเจ้าของตั้งกุญแจไว้แล้วเท่านั้น
 * ไม่มีกุญแจ = `"polling"` ซึ่งเป็นสภาพปกติของระบบวันนี้ (ไม่ใช่สถานะผิดพลาด)
 */
export function realtimeMode(): RealtimeMode {
  return ablyConfigured() ? "realtime" : "polling";
}

/**
 * ส่งสัญญาณขึ้นช่อง — **ห้าม throw ไม่ว่ากรณีใด**
 *
 * 🔴 ทุก callsite ของฟังก์ชันนี้อยู่ "หลังบันทึกข้อมูลสำเร็จแล้ว" ทั้งหมด
 *    ถ้าตัวนี้โยน error ขึ้นไป = ข้อความที่บันทึกไปแล้วจะถูกรายงานกลับว่า "ส่งไม่สำเร็จ"
 *    แล้วผู้ใช้กดส่งซ้ำ ⇒ ข้อความซ้ำ (บั๊กแบบเดียวกับ redirect ใน `sendReplyAction` 1 ก.ย.)
 *    ⇒ กลืน error **ทุกชนิด** ที่นี่ รวมถึงตอน import adapter พังหรือ payload แปลก ๆ
 */
export async function publish(
  channel: string,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    if (realtimeMode() !== "realtime") return;
    const ch = String(channel ?? "").trim();
    const ev = String(event ?? "").trim();
    if (!ch || !ev) return;
    // 🔴 กรองที่ขอบเสมอ — ดูเหตุผลใน events.ts (ผู้เรียกมี 7 จุด ถูกทุกจุดตลอดไปเป็นไปไม่ได้)
    await ablyPublish(ch, ev, { ...sanitizeSignal(payload) });
  } catch {
    // ผู้ให้บริการล่ม · โควตาหมด · เน็ตขาด · timeout — เงียบทั้งหมด
    // (ข้อมูลจริงถูกบันทึกไปแล้วก่อนถึงบรรทัดนี้ · จอยังเห็นของใหม่จากรอบ poll เดิมอยู่ดี)
  }
}

/**
 * ทางลัดของโมดูลแชท — ประกอบชื่อช่องจาก tenant+system ให้ ผู้เรียกจะได้ไม่พิมพ์รูปช่องซ้ำ
 * (ชื่อช่องที่พิมพ์ซ้ำหลายที่ = วันหนึ่งฝั่งส่งกับฝั่งฟังอยู่คนละช่องแบบเงียบ ๆ)
 */
export async function publishChat(
  tenantId: string,
  systemId: string,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (!tenantId || !systemId) return;
  await publish(chatChannel(tenantId, systemId), event, payload);
}
