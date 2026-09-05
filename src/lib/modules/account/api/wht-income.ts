// wht-income.ts — ประเภทเงินได้ ม.40 ที่ผู้เรียก REST ส่งมาได้ (WO C2)
//
// ปัญหา: ค่าจริงในฐานข้อมูลคือ `M40_1`…`M40_8` ซึ่งเป็นศัพท์ของแบบฟอร์มสรรพากรไทย —
// ผู้เชื่อมต่อ (และ agent ที่อ่านคู่มืออังกฤษ) ไม่มีทางเดาได้ว่า "ค่าบริการ" คือ `M40_8`
// ⇒ REST รับ **ชื่อที่อ่านออก** เป็นหลัก และยังรับรหัสดิบไว้ด้วยสำหรับคนที่รู้อยู่แล้ว
//    (ตารางนี้เป็นแหล่งเดียว — C2 กับ D1 `POST /wht/certs` ใช้ร่วมกัน ไม่ก็อปไปวางซ้ำ)

import type { AccountWhtIncomeType } from "@prisma/client";
import { z } from "zod";

/** ชื่อที่ผู้เรียกส่งมาได้ → ค่าจริงในฐานข้อมูล (รหัสดิบส่งมาก็ได้ ให้ผลเดียวกัน) */
export const WHT_INCOME_TYPE_ALIASES: Record<string, AccountWhtIncomeType> = {
  SALARY: "M40_1",
  COMMISSION: "M40_2",
  ROYALTY: "M40_3",
  INTEREST: "M40_4",
  DIVIDEND: "M40_4",
  RENT: "M40_5",
  PROFESSIONAL: "M40_6",
  CONTRACTOR: "M40_7",
  SERVICE: "M40_8",
  M40_1: "M40_1",
  M40_2: "M40_2",
  M40_3: "M40_3",
  M40_4: "M40_4",
  M40_5: "M40_5",
  M40_6: "M40_6",
  M40_7: "M40_7",
  M40_8: "M40_8",
};

const NAMES = Object.keys(WHT_INCOME_TYPE_ALIASES) as [string, ...string[]];

/** ช่อง `whtIncomeType` ของทุก endpoint ที่หักภาษี ณ ที่จ่าย */
export const whtIncomeTypeField = z
  .enum(NAMES)
  .describe(
    "Type of income under section 40 of the Thai Revenue Code, used on the withholding tax certificate. " +
      "Readable names: SALARY 40(1), COMMISSION 40(2), ROYALTY 40(3), INTEREST or DIVIDEND 40(4), RENT 40(5), " +
      "PROFESSIONAL 40(6), CONTRACTOR 40(7), SERVICE 40(8). The raw codes M40_1 to M40_8 are accepted too.",
  );

/** ชื่อที่ผ่านสคีมาแล้ว → ค่าจริง (ไม่มีทางเป็น undefined เพราะ enum มาจากคีย์ของตารางเดียวกัน) */
export function toWhtIncomeType(v: string): AccountWhtIncomeType {
  return WHT_INCOME_TYPE_ALIASES[v] as AccountWhtIncomeType;
}
