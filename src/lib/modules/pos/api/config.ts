// config.ts — ระบบขายหน้าร้าน (POS) ต่อเข้าแกน REST ของกลางอย่างไร (ใบ P2.13 · brief §2.2 · มติ 3)
//
// แกนกลาง (`src/lib/api/*`) ไม่รู้จัก POS — ทุกอย่างที่เป็น "ของโมดูลนี้" อยู่ในไฟล์เดียวนี้:
// ชนิดของระบบที่คีย์ผูกได้ (POS) · namespace ของถังเพดานอัตรา (`pos` — แยกจาก acct/kb/mb/crm) · วิธีแปลง scope เป็น actor · ข้อความไทย
// เพดานอัตรา = ค่ากลางของแกน (read 300 · write 60 · report 30 ต่อคีย์ต่อนาที)
import type { ApiModuleConfig } from "@/lib/api/require";
import { posApiKeyActor } from "./actor";

export const POS_API_CONFIG: ApiModuleConfig = {
  module: "pos",
  systemType: "POS",
  scopePrefix: "pos.",
  // 🔴 ถังแยกจากโมดูลอื่น — คีย์ที่ยิงบัญชี/บอร์ดงานรัว ๆ ต้องไม่กินโควตาของหน้าขาย (และกลับกัน)
  rateNs: "pos",
  makeActor: posApiKeyActor,
  messages: {
    keyExpiredTh: "คีย์ API หมดอายุแล้ว — ออกคีย์ใหม่ที่หน้าขาย › ตั้งค่า › การเชื่อมต่อระบบ SHARK › คีย์ API",
    keyExpiredEn: "This API key has expired. Create a new one in POS settings > SHARK connections > API keys.",
    systemMismatchTh: "ระบบขายหน้าร้านที่ระบุใช้กับคีย์นี้ไม่ได้",
    systemMismatchEn: "The requested POS system is not available to this API key.",
    systemRequiredTh: "คีย์นี้ไม่ได้ผูกระบบขายหน้าร้าน — ต้องส่งส่วนหัว X-Shark-System บอกว่าจะทำงานกับระบบไหน",
    systemRequiredEn: "This key is not bound to a POS system. Send the X-Shark-System header with the AppSystem id.",
    scopeMissingTh: "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้ในระบบขายหน้าร้าน",
    scopeMissingEn: "This API key does not have the scope required for this operation.",
    notFoundTh: "ไม่พบปลายทางนี้ใน API ระบบขายหน้าร้าน",
    notFoundEn: "No API operation matches this path.",
  },
};
