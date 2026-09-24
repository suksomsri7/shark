// transcriber.ts — อะแดปเตอร์ "ถอดเสียงสายโทร" ของ CRM (ใบ C2.4 · พิมพ์เขียว §5.5 · RESOLUTIONS R-B)
//
// 🔴 RUN นี้ **ไม่มีผู้ให้บริการ STT** (ไล่ทั้ง repo แล้ว มีแต่ worker ffmpeg แปลงไฟล์บน VPS) ⇒ ทะเบียนนี้ว่างโดยเจตนา:
//    `getCrmTranscriber()` คืน `null` ⇒ ปุ่ม "ถอดเสียง" แสดงสถานะสงบ "ยังไม่ได้เชื่อมบริการถอดเสียง" (ไม่ใช่ error)
// 🔴 ทำไมเป็น "ทะเบียนบนโพรเซส" ไม่ใช่ env: ตัวถอดเสียงตัวจริงจะมาพร้อมใบที่เชื่อมผู้ให้บริการ (ยังไม่มีใบ) และข้อสอบต้อง
//    ฉีดตัวปลอมเข้ามาได้ทาง `deps.transcriber` โดยไม่แตะทะเบียนจริง ⇒ ทะเบียนเก็บบน globalThis (โมดูลถูกโหลดซ้ำได้)
// 🔴 ไฟล์นี้ต้องไม่ลากอะไรหนัก (ไม่มี prisma/next) — `calls.ts` import ที่หัวไฟล์ และหน้าจอ import แค่ชนิด

/**
 * ผลของการถอดเสียง 1 ไฟล์ — `text` คือข้อความล้วน (ยังไม่ผ่านการปิดเบอร์/อีเมล · `calls.ts` ทำก่อนส่งเข้าโมเดล X8)
 * 🔴 ค่าใช้จ่ายของผู้ให้บริการ STT (ใบ C2.4 รอบ 2 · ข้อ F7): ผู้ให้บริการถอดเสียงคิดเงินตาม **นาทีเสียง** ไม่ใช่ token
 *    ⇒ อะแดปเตอร์รายงานมาเป็น `costMicroUsd` (ไมโครดอลลาร์) และ/หรือ `tokensIn/tokensOut` ถ้าผู้ให้บริการคิดเป็น token
 *    `calls.ts` รวมค่านี้เข้ากับค่าโมเดลสรุปเป็น **แถวเดียว** (`AiCreditTxn` ใบเดียวต่อการถอดเสียงหนึ่งครั้ง) ⇒ บิลของร้าน
 *    ไม่มีค่าที่ "ฟรีโดยไม่ได้ตั้งใจ" และไม่มีสองแถวให้ร้านงงว่าถูกคิดซ้ำ · ไม่รายงานมา = 0 (เท่าพฤติกรรมเดิม)
 */
export type CrmTranscribeResult = {
  text: string;
  language?: string;
  model?: string;
  /** ค่าถอดเสียงที่ผู้ให้บริการคิด (ไมโครดอลลาร์ · จำนวนเต็ม ≥ 0) */
  costMicroUsd?: number;
  /** token ที่ผู้ให้บริการรายงาน (ถ้ามี) — ถูกบวกเข้ากับ token ของโมเดลสรุปในแถวเดียวกัน */
  tokensIn?: number;
  tokensOut?: number;
};

export type CrmTranscribeInput = {
  tenantId: string;
  activityId: string;
  /** `FileAsset.id` ของเสียง — อะแดปเตอร์ไม่ต้องรู้ที่อยู่ไฟล์ */
  fileId: string;
  mime: string;
  /** อ่านไบต์ของไฟล์เมื่อต้องใช้ (คืน null = อ่านไม่ได้) — ผู้เรียกเปิดผ่าน storage ให้ ไม่มี URL หลุดออกมา */
  open: () => Promise<Uint8Array | null>;
};

export interface CrmTranscriber {
  /** ชื่อผู้ให้บริการ (ลงใน `AiCreditTxn.model` ไม่ได้ — ที่นั่นเก็บชื่อโมเดล AI · ใช้กับ log/หน้าตั้งค่า) */
  key: string;
  transcribe(input: CrmTranscribeInput): Promise<CrmTranscribeResult>;
}

const REGISTRY_KEY = Symbol.for("shark.crm.transcriber");
type Holder = Record<symbol, CrmTranscriber | null | undefined>;
const holder = globalThis as unknown as Holder;

/** ตั้ง/ถอดตัวถอดเสียงของโพรเซสนี้ (`null` = ถอด) — ใบที่เชื่อมผู้ให้บริการจริงเรียกตัวนี้ตอนบูต */
export function registerCrmTranscriber(t: CrmTranscriber | null): void {
  holder[REGISTRY_KEY] = t;
}

/** ตัวถอดเสียงที่ใช้ได้ตอนนี้ — ค่าเริ่มต้น `null` (R-B: ยังไม่มีผู้ให้บริการใน RUN นี้) */
export function getCrmTranscriber(): CrmTranscriber | null {
  return holder[REGISTRY_KEY] ?? null;
}
