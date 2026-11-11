// not-found.tsx — 404 ของ /r/<token> (P1.11U · มติข้อ 1): ใบเสร็จออนไลน์ POS ที่โทเคนไม่พบ → notFound() ในหน้า dispatcher
// หน้าบัญชี (โทเคน 24 ตัว) ไม่เรียก notFound() — ยังแสดงการ์ด "ลิงก์ไม่ถูกต้อง" ของตัวเองเหมือนเดิม
// not-found ไม่ได้รับ searchParams ⇒ ภาษาจากคุกกี้ "lang" (ค่าปริยาย th) เหมือนหน้าบัญชี
import { cookies } from "next/headers";
import { getLocaleFromCookie } from "@/lib/i18n";
import { PosReceiptNotFound } from "./pos/PosPublicReceipt";

export default async function PosReceiptNotFoundPage() {
  const locale = getLocaleFromCookie((await cookies()).get("lang")?.value);
  return <PosReceiptNotFound locale={locale} />;
}
