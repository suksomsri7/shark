// config.ts — ระบบสมาชิกต่อเข้าแกน REST ของกลางอย่างไร (M1.11)
//
// แกนกลาง (`src/lib/api/*`) ไม่รู้จักระบบสมาชิกเลย — ทุกอย่างที่เป็น "ของโมดูลนี้" อยู่ในไฟล์เดียวนี้:
// ชนิดของระบบที่คีย์ผูกได้ · namespace ของถังเพดานอัตรา · วิธีแปลง scope เป็น actor · ข้อความไทย
import type { ApiModuleConfig } from "@/lib/api/require";
import { memberApiKeyActor } from "./actor";
import { memberCustomerAuth } from "./customer-lane";
import { MEMBER_RATE_LIMITS } from "./rate";

export { MEMBER_RATE_LIMITS } from "./rate";

export const MEMBER_API_CONFIG: ApiModuleConfig = {
  module: "member",
  systemType: "MEMBER",
  scopePrefix: "member.",
  // 🔴 ถังแยกจากบัญชี (`acct`) และบอร์ดงาน (`kb`) — คีย์ใบเดียวที่ยิงโมดูลอื่นรัว ๆ ต้องไม่กินโควตาที่นี่
  rateNs: "mbr",
  rateLimits: MEMBER_RATE_LIMITS,
  makeActor: memberApiKeyActor,
  // 🔴 เลนที่สองของโมดูลนี้ (M2.10): `Authorization: Bearer cs_…` = ลูกค้าเข้ามาเอง ไม่ใช่คีย์ของร้าน
  altAuth: memberCustomerAuth,
  messages: {
    keyExpiredTh: "คีย์ API หมดอายุแล้ว — กรุณาหมุนคีย์ใหม่ที่หน้าสมาชิก › ตั้งค่า › API",
    keyExpiredEn: "This API key has expired. Rotate it from the member settings page.",
    systemMismatchTh: "ระบบสมาชิกที่ระบุใช้กับคีย์นี้ไม่ได้",
    systemMismatchEn: "The requested member system is not available to this API key.",
    systemRequiredTh: "คีย์นี้ไม่ได้ผูกระบบสมาชิก — ต้องส่งส่วนหัว X-Shark-System บอกว่าจะทำงานกับระบบไหน",
    systemRequiredEn: "This key is not bound to a member system. Send the X-Shark-System header with the AppSystem id.",
    scopeMissingTh: "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้ในระบบสมาชิก",
    scopeMissingEn: "This API key does not have the scope required for this operation.",
    notFoundTh: "ไม่พบปลายทางนี้ใน API ระบบสมาชิก",
    notFoundEn: "No API operation matches this path.",
  },
};
