// _page.ts — ตัวช่วยของหน้าในพอร์ทัล `/b/[slug]/*` (ใบ C3.5) — ไฟล์ฝั่งเซิร์ฟเวอร์ธรรมดา (ไม่ใช่ route · ไม่ใช่ "use server")
// 🔴 ทุกหน้าที่ต้องล็อกอินยังต้องเรียก `portal.requirePortal(slug)` เองที่หัวหน้า (ด่านเห็นได้ในไฟล์ของหน้าเอง — ข้อสอบ C3.5-S7.2)
// 🔴 บริการตอบ NOT_FOUND (id ของบริษัทอื่น/ร้านอื่น) ⇒ `notFound()` · session ตายระหว่างทาง ⇒ ไปหน้าเข้าสู่ระบบ
import { notFound, redirect } from "next/navigation";
import { portalPath } from "@/lib/modules/crm";

/** แปลง error ของบริการพอร์ทัลเป็นพฤติกรรมของหน้า */
export async function orPage<T>(slug: string, p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    const code = (e as { code?: unknown })?.code;
    if (code === "NOT_FOUND") notFound();
    if (code === "UNAUTHORIZED") redirect(portalPath(slug, "login"));
    throw e;
  }
}
