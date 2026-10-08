"use server";

// ส่งข้อมูลฟอร์มสาธารณะ (ใบ C2.6 · มติ C24) — ผ่านด่านกันสแปมของโมดูลฟอร์มเท่านั้น
//
// 🔴 ตัวนับ "ในหน่วยความจำ" ตัวเดิม (`checkRateLimit`) ถูกถอดออกแล้ว: บน Vercel มีหลาย instance ⇒ บอตยิงผ่านได้สบาย
//    ตอนนี้เพดานความถี่อยู่บนฐาน (กุญแจขึ้นต้น `form:` · ไม่มี IP ดิบในกุญแจ) พร้อม honeypot + เวลากรอกขั้นต่ำ
// 🔴 ไม่ redirect แล้ว: คำตอบกลับไปเป็นผลลัพธ์ให้หน้าจอแสดง **inline ภาษาไทย** (ห้าม alert · ห้ามหน้าเปล่า)
// 🔴 AUDIT-CLASS X8: IP ถูกแปลงเป็นค่าแฮชในบริการก่อนเก็บ (ไม่มี IP ดิบลงฐาน) · ไม่ log คำตอบของลูกค้า
// 🔴 (รีวิวรอบ 2 · S1) **รหัสผู้เข้าชมมาจากคุกกี้ `sd_vid` ที่เซิร์ฟเวอร์อ่านเองเท่านั้น** — ค่าที่ผู้เรียกแนบมาใน
//    คำขอถูกทิ้งทั้งหมด (ไม่มี lane ที่ไม่ได้ลงนาม): ของเดิมใครก็ส่งรหัสผู้เข้าชมของคนอื่นมาแล้วประวัติการเข้าชม
//    ย้อนหลัง 180 วันของคนนั้นจะถูกผูกเข้ากับ lead ของตัวเอง (ทางที่ "ลงนามแล้ว" มีอยู่แล้วคือตั๋ว `sd_ct` ของอีเมล
//    ซึ่งเซิร์ฟเวอร์เป็นคนตรวจ) ◂

import { headers } from "next/headers";
import { submitPublicFormGuarded } from "@/lib/modules/forms/service";
// CRM C3.9 ▸ ชนิดผลลัพธ์ย้ายไป `./actions-shared` (ไฟล์ "use server" export ได้เฉพาะ async function — X8.2) ◂
import type { PublicFormActionResult } from "./actions-shared";

/** รหัสผู้เข้าชมของคำขอนี้ — อ่านจากคุกกี้ first-party `sd_vid` ของคำขอเท่านั้น (ไม่รับค่าจากผู้เรียก) */
function visitorFromCookie(cookie: string | null): string | null {
  const m = /(?:^|;\s*)sd_vid=([^;]+)/.exec(String(cookie ?? ""));
  if (!m) return null;
  const v = decodeURIComponent(m[1] ?? "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

export async function submitFormAction(
  token: string,
  input: {
    answers: Record<string, string>;
    hp?: string;
    st?: string;
    pageUrl?: string | null;
    referrer?: string | null;
    utm?: Record<string, string> | null;
    turnstileToken?: string | null;
    /** CRM C4.4-fix3 ▸ ตั๋วผู้เข้าชมที่ผนึกโดยเซิร์ฟเวอร์ (มาจากสคริปต์ติดตามของเว็บที่ฝังฟอร์ม) — ไม่ใช่รหัสผู้เข้าชม ◂ */
    vt?: string | null;
  },
): Promise<PublicFormActionResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  const r = await submitPublicFormGuarded(
    String(token ?? ""),
    {
      answers: input?.answers ?? {},
      hp: String(input?.hp ?? ""),
      st: String(input?.st ?? ""),
      ...(input?.turnstileToken ? { turnstileToken: String(input.turnstileToken) } : {}),
    },
    {
      ip,
      userAgent: h.get("user-agent"),
      pageUrl: input?.pageUrl ?? null,
      referrer: input?.referrer ?? null,
      utm: input?.utm ?? null,
      visitorId: visitorFromCookie(h.get("cookie")),
      // CRM C4.4-fix3 ▸ (J3) ตั๋วทึบแสงที่เซิร์ฟเวอร์เป็นคนผนึก/ตรวจ/เผา (`tracking.redeemVisitorTicket`) — ค่าที่ไม่ได้ผนึก (เช่น
      //   รหัสผู้เข้าชมดิบ) ผ่านไม่ได้ ⇒ กติกา "ไม่รับรหัสผู้เข้าชมจากผู้เรียก" (S1 · C2.6-S9.2) ยังอยู่ครบ · ใช้เมื่อทางคุกกี้ไม่ให้ผลเท่านั้น ◂
      visitorTicket: typeof input?.vt === "string" ? input.vt.slice(0, 2048) : null,
    },
  );
  // honeypot ⇒ `{ ok: true, id: null }` (หน้าจอขึ้น "ขอบคุณ" เหมือนกัน — ไม่บอกบอตว่าโดนจับ)
  if (r.ok) return { ok: true };
  return { ok: false, message: r.message };
}
