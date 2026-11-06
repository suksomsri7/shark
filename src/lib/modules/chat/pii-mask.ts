// pii-mask.ts — ปิดข้อมูลติดต่อในข้อความแชทก่อนส่งเข้าโมเดล (SEC S3a.1-S2 R-Z24 · ใช้ร่วม ai-suggest + translate S3a.6)
//   อีเมล ⇒ •••@โดเมน · เบอร์ไทย · ตัวเลขยาว ≥ 9 หลัก (บัตร/บัญชี) ⇒ เหลือ 2 ตัวท้าย · pure
import { replaceEmailsInText } from "@/lib/core/linear-text";

const TH_PHONE = /(?<![\w+])(?:\+66[\s-]?|0)\d(?:[\s.-]?\d){7,8}(?!\w)/g;
const LONG_DIGITS = /\d(?:[\s-]?\d){8,}/g;
const keepTail = (m: string) => {
  const d = m.replace(/\D/g, "");
  return `${"•".repeat(Math.max(0, d.length - 2))}${d.slice(-2)}`;
};

export function maskChatText(text: string): string {
  return replaceEmailsInText(text, (e) => `•••@${e.split("@")[1] ?? ""}`).replace(TH_PHONE, keepTail).replace(LONG_DIGITS, keepTail);
}
