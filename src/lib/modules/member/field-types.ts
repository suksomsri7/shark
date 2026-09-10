// field-types.ts — ทะเบียนชนิดฟิลด์ของ "ตัวออกแบบฟิลด์สมาชิก" (M1.3 · พิมพ์เขียว §5.3 §11.2)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่แตะ prisma ไม่แตะ next — ใช้ได้ทั้ง server (page.tsx) และ client (FieldDesigner.tsx)
//    ชนิด `MemberFieldType`/`MemberLookupTarget` import แบบ type-only จาก @prisma/client (ถูกลบตอน compile
//    จึงไม่ทำให้ไฟล์นี้ผูกกับ runtime ของ prisma — เหมือน `templates/index.ts` ที่ import type จาก fields.ts)
//
// palette ซ้ายของ `FieldDesigner.tsx` วนจาก `FIELD_TYPE_ORDER` ที่นี่ — ห้ามพิมพ์ลิสต์ 11 ชนิดซ้ำที่ไหนอีก

import type { MemberFieldType, MemberLookupTarget } from "@prisma/client";

/** ลำดับที่แสดงใน palette ซ้าย — ตรงกับภาพ 03 (ข้อความสั้น→ยาว→ตัวเลข→เงิน→วันที่→วันที่-เวลา→ตัวเลือกเดียว→หลายตัวเลือก→ใช่/ไม่ใช่→ไฟล์→อ้างอิง) */
export const FIELD_TYPE_ORDER: readonly MemberFieldType[] = [
  "TEXT",
  "LONG_TEXT",
  "NUMBER",
  "MONEY",
  "DATE",
  "DATETIME",
  "SELECT",
  "MULTI_SELECT",
  "BOOLEAN",
  "FILE",
  "LOOKUP",
];

/** ป้ายไทยของแต่ละชนิด — หน้าจอทุกจุดอ่านจากที่นี่ที่เดียว */
export const FIELD_TYPE_LABELS: Record<MemberFieldType, string> = {
  TEXT: "ข้อความสั้น",
  LONG_TEXT: "ข้อความยาว",
  NUMBER: "ตัวเลข",
  MONEY: "จำนวนเงิน",
  DATE: "วันที่",
  DATETIME: "วันที่และเวลา",
  SELECT: "ตัวเลือกเดียว",
  MULTI_SELECT: "หลายตัวเลือก",
  BOOLEAN: "ใช่ / ไม่ใช่",
  FILE: "ไฟล์แนบ",
  LOOKUP: "อ้างอิงข้อมูลอื่น",
};

/** คำอธิบายสั้น ๆ ใต้ป้ายใน palette (ช่วยคนที่ไม่คุ้นชนิดฟิลด์ตัดสินใจว่าจะเลือกอันไหน) */
export const FIELD_TYPE_HINTS: Record<MemberFieldType, string> = {
  TEXT: "ข้อความบรรทัดเดียว เช่น รหัสสมาชิก เบอร์โทร",
  LONG_TEXT: "ข้อความหลายบรรทัด เช่น โน้ต ประวัติ",
  NUMBER: "จำนวนล้วน เช่น จำนวนครั้ง อายุ",
  MONEY: "จำนวนเงิน (ทศนิยม 2 ตำแหน่ง)",
  DATE: "เลือกวันที่จากปฏิทิน",
  DATETIME: "เลือกวันที่พร้อมเวลา",
  SELECT: "เลือกได้ 1 ตัวเลือกจากรายการที่ตั้งไว้",
  MULTI_SELECT: "เลือกได้หลายตัวเลือกพร้อมกัน",
  BOOLEAN: "สลับใช่ / ไม่ใช่",
  FILE: "แนบไฟล์หรือรูปภาพ",
  LOOKUP: "เชื่อมกับข้อมูลอื่นในร้าน (สินค้า/บริการ/พนักงาน/สาขา/สมาชิก)",
};

/** ไอคอนของแต่ละชนิด — คีย์ตรงกับ `<MemberIcon name=… />` */
export const FIELD_TYPE_ICONS: Record<MemberFieldType, string> = {
  TEXT: "text",
  LONG_TEXT: "longText",
  NUMBER: "number",
  MONEY: "money",
  DATE: "date",
  DATETIME: "datetime",
  SELECT: "select",
  MULTI_SELECT: "multiSelect",
  BOOLEAN: "boolean",
  FILE: "file",
  LOOKUP: "lookup",
};

/** ปลายทางของฟิลด์ชนิด LOOKUP (§4.2 `MemberLookupTarget`) — dropdown ในแผงคุณสมบัติวนจากที่นี่ */
export const LOOKUP_TARGET_LABELS: Record<MemberLookupTarget, string> = {
  PRODUCT: "สินค้า",
  SERVICE: "บริการ",
  EMPLOYEE: "พนักงาน",
  UNIT: "สาขา",
  CUSTOMER: "สมาชิกอื่น",
};

export const LOOKUP_TARGET_ORDER: readonly MemberLookupTarget[] = ["PRODUCT", "SERVICE", "EMPLOYEE", "UNIT", "CUSTOMER"];
