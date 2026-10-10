// handover-shared.ts — กติกา "หน้าที่ฝังฟอร์มอยู่บนเว็บของร้านไหม" ฝั่งเบราว์เซอร์ของหน้า `/f/<token>` (CRM C4.4-fix3 r2 ▸ review N6)
//
// 🔴 ไฟล์บริสุทธิ์ (client-safe): ห้าม import prisma / `@/lib/core/db` / `next/*` / server-only — หน้า 'use client' ใช้
// 🔴 ทำไมไม่ import `originAllowed` ของ CRM: ด่าน fitness F2.3 ให้โค้ดนอกโมดูล CRM แตะได้เฉพาะ facade/`crm/ui` (ห้ามขยายข้อยกเว้น)
//    และ facade ลาก prisma เข้าบันเดิลฝั่งเบราว์เซอร์ไม่ได้ ⇒ กติกาเดียวกันเขียนซ้ำที่นี่ **และข้อสอบ probe-j3 (J3-r4) เทียบผลกับ
//    `originAllowed` ของ CRM ทีละกรณี** (https เท่านั้น · host ตรงตัวหรือโดเมนย่อยจริง · `evil-shop.x.attacker` / `xshop.x` ไม่ผ่าน ·
//    พอร์ตไม่มีผล) — ถ้าวันหนึ่งกติกาของ CRM เปลี่ยน ข้อสอบแดงทันที ไม่ใช่เพี้ยนเงียบ ๆ ◂

/** origin ของหน้าที่ฝังฟอร์ม (MessageEvent.origin) อยู่ในโดเมนติดตามของร้านไหม — https เท่านั้น · host ตรงตัว หรือเป็นโดเมนย่อยจริง ๆ */
export function parentOriginAllowed(origin: unknown, hosts: readonly string[]): boolean {
  const s = typeof origin === "string" ? origin.trim() : "";
  if (!s || !Array.isArray(hosts) || hosts.length === 0) return false;
  let host: string;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return hosts.some((d) => {
    const dom = typeof d === "string" ? d.trim().toLowerCase() : "";
    return !!dom && (host === dom || host.endsWith(`.${dom}`));
  });
}
