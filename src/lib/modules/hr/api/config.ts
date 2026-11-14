// config.ts — ระบบงานบุคคล (HR) ต่อเข้าแกน REST ของกลางอย่างไร (ใบ H4.8 · brief D2 · แบบ pos/api/config.ts)
//
// แกนกลาง (`src/lib/api/*`) ไม่รู้จัก HR — ของที่เป็น "ของโมดูลนี้" อยู่ที่นี่: ชนิดระบบที่คีย์ผูกได้ (HR) ·
// namespace ถังเพดานอัตรา (`hr` — แยกจาก pos/acct/kb/mb/crm) · ข้อความไทย
// 🔴 makeActor ตัวปริยาย = "คีย์ไม่ผูกระบบนี้" (ทำอะไรไม่ได้เลย) — ตัวจริงที่รู้ว่าคีย์ผูกระบบ HR นี้หรือไม่ ประกอบใน dispatch.ts ต่อคำขอ
//    (มติ 14 พ.ย. ข้อ 4: op ของ HR รับเฉพาะคีย์ที่ผูกระบบ HR นั้น — คีย์กลาง/คีย์ของระบบอื่นที่ถือ hr.* ทำอะไรไม่ได้)
// เพดานอัตรา = ค่ากลางของแกน (read 300 · write 60 · report 30 ต่อคีย์ต่อนาที) · สลิป/รายงานเงินเดือนอยู่ถัง report (มติ Q7)
import type { ApiModuleConfig } from "@/lib/api/require";
import { hrApiKeyActor } from "./actor";

export const HR_API_CONFIG: ApiModuleConfig = {
  module: "hr",
  systemType: "HR",
  scopePrefix: "hr.",
  rateNs: "hr",
  makeActor: (input) => hrApiKeyActor({ ...input, bound: false }),
  messages: {
    keyExpiredTh: "คีย์ API หมดอายุแล้ว — ให้เจ้าของร้านออกคีย์ใหม่ที่ งานบุคคล › ตั้งค่า › คีย์ API",
    keyExpiredEn: "This API key has expired. Ask the shop owner for a new one (HR > Settings > API keys).",
    systemMismatchTh: "ระบบงานบุคคลที่ระบุใช้กับคีย์นี้ไม่ได้",
    systemMismatchEn: "The requested HR system is not available to this API key.",
    systemRequiredTh: "คีย์นี้ไม่ได้ผูกระบบงานบุคคล — ใช้คีย์ที่ออกจากหน้าตั้งค่าของระบบงานบุคคล",
    systemRequiredEn: "This key is not bound to an HR system. Use a key issued from the HR settings page.",
    scopeMissingTh: "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้ในระบบงานบุคคล",
    scopeMissingEn: "This API key does not have the scope required for this operation.",
    notFoundTh: "ไม่พบปลายทางนี้ใน API ระบบงานบุคคล",
    notFoundEn: "No API operation matches this path.",
  },
};
