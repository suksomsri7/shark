// ci-equals.ts — "เท่ากันแบบไม่สนตัวพิมพ์" ที่ปลอดภัยจาก wildcard (CRM C5.5-fix2 · hunter 2a-5/2a-6)
//
// 🔴 Prisma บน Postgres แปล `{ equals: x, mode: "insensitive" }` เป็น `ILIKE $1` **โดยไม่ escape** ⇒ `_` (ตัวใดก็ได้ 1 ตัว) ·
//    `%` (อะไรก็ได้) · `\` (ตัว escape) ในค่าที่ผู้ใช้/คนนอกส่งมา ถูกตีความเป็นรูปแบบ (ผู้คุมงานยืนยันบน QC 1 ต.ค.:
//    `email equals "%@<โดเมน>"` คืนผู้ติดต่อคนอื่น) — `somchai_k@` จึง "เท่ากับ" `somchai.k@` ⇒ OTP ของกล่องจดหมาย
//    ที่หน้าตาคล้ายกันเคยออก session พอร์ทัลของเหยื่อได้ (2a-6)
// ✅ ทางแก้ชุดเดียวของทั้งระบบ: escape `\` `%` `_` ด้วย `\` (ตัว escape ปริยายของ LIKE/ILIKE ใน Postgres — ค่าถูกส่งเป็น
//    พารามิเตอร์ จึงไม่ผ่านการตีความ string literal ซ้ำ) แล้วค่อยให้ Prisma ทำ ILIKE ⇒ ผลลัพธ์ = "เท่ากันทุกตัวอักษร
//    ไม่สนตัวพิมพ์" เหมือนเดิมทุกกรณีที่ถูกต้อง (ข้อสอบ `scripts/pending/cf2/probe-cf2.mts` A0 พิสูจน์บนฐานจริง
//    ทั้งฝั่งปฏิเสธ `_`/`%`/`\` และฝั่งยอมรับตัวพิมพ์ต่าง · ไทย/Unicode · ชื่อที่มี `%_\` จริง ๆ)
// 🔴 ห้ามเขียน `{ equals: …, mode: "insensitive" }` เองอีก — ใช้ `ciEquals()` (fitness F15 จับ)
// 🔴 ไฟล์บริสุทธิ์: ไม่ import อะไร (ใช้ได้ทั้ง server/โมดูลใดก็ได้)

/** escape ตัวพิเศษของ LIKE/ILIKE (`\` ก่อน แล้ว `%` `_`) — ตัว escape = `\` (ค่าปริยายของ Postgres) */
export function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** ตัวกรอง Prisma: ค่าในคอลัมน์ "เท่ากับ" `value` ทุกตัวอักษร โดยไม่สนตัวพิมพ์ — ไม่มี wildcard รั่ว */
export function ciEquals(value: string): { equals: string; mode: "insensitive" } {
  return { equals: likeEscape(value), mode: "insensitive" };
}
