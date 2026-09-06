// config.ts — บอร์ดงานต่อเข้าแกน REST ของกลางอย่างไร (K1.15)
//
// แกนกลาง (`src/lib/api/*`) ไม่รู้จักบอร์ดงานเลย — ทุกอย่างที่เป็น "ของโมดูลนี้" อยู่ในไฟล์เดียวนี้:
// ชนิดของระบบที่คีย์ผูกได้ · namespace ของถังเพดานอัตรา · วิธีแปลง scope เป็น actor · ข้อความไทย
import type { ApiModuleConfig } from "@/lib/api/require";
import { kanbanApiKeyActor } from "./actor";

export const KANBAN_API_CONFIG: ApiModuleConfig = {
  module: "kanban",
  systemType: "KANBAN",
  scopePrefix: "kanban.",
  // 🔴 ถังแยกจากบัญชี (`acct`) — คีย์ที่ยิงบัญชีรัว ๆ ต้องไม่กินโควตาของบอร์ดงานในคีย์เดียวกัน
  rateNs: "kb",
  makeActor: kanbanApiKeyActor,
  messages: {
    keyExpiredTh: "คีย์ API หมดอายุแล้ว — กรุณาหมุนคีย์ใหม่ที่หน้าบอร์ดงาน › ตั้งค่า › API",
    keyExpiredEn: "This API key has expired. Rotate it from the task board settings page.",
    systemMismatchTh: "ระบบบอร์ดงานที่ระบุใช้กับคีย์นี้ไม่ได้",
    systemMismatchEn: "The requested task board system is not available to this API key.",
    systemRequiredTh: "คีย์นี้ไม่ได้ผูกระบบบอร์ดงาน — ต้องส่งส่วนหัว X-Shark-System บอกว่าจะทำงานกับระบบไหน",
    systemRequiredEn: "This key is not bound to a task board system. Send the X-Shark-System header with the AppSystem id.",
    scopeMissingTh: "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้",
    scopeMissingEn: "This API key does not have the scope required for this operation.",
    notFoundTh: "ไม่พบปลายทางนี้ใน API บอร์ดงาน",
    notFoundEn: "No API operation matches this path.",
  },
};
