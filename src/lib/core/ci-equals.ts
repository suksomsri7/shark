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

// CRM C5.5-fix8 ▸ การค้นหา "มีคำนี้อยู่" ก็รั่วแบบเดียวกัน: Prisma แปล `{ contains: q }` เป็น `LIKE $1` (และ `mode: "insensitive"` เป็น
//   `ILIKE $1`) โดยส่งพารามิเตอร์ `%<q>%` **ไม่ escape** ⇒ คำค้น `%` คืนทุกแถว · `a_b` เจอ `a.b` · `\` กินตัวถัดไป (พิสูจน์บน QC3:
//   scripts/pending/cf4/probe-cf4-contains.mts · scripts/pending/cf11/probe-cf11-contains.mts C0) — escape ด้วยตัวเดียวกับ ciEquals
//   แล้ว Prisma ห่อ `%…%` ให้เอง ⇒ "มีข้อความนี้อยู่ทุกตัวอักษร" · ตัวพิมพ์ใหญ่/เล็กตามเดิมของแต่ละจุด (ci = ไม่สน · like = สน)
// 🔴 คำค้นของผู้ใช้ใน account/** ห้ามเขียน `contains:` / `startsWith:` / `endsWith:` เอง — fitness F15.4 จับ ◂

/** ตัวกรอง Prisma: ค่าในคอลัมน์ "มี" `value` อยู่ (ไม่สนตัวพิมพ์) — `%` `_` `\` เป็นตัวอักษรธรรมดา */
export function ciContains(value: string): { contains: string; mode: "insensitive" } {
  return { contains: likeEscape(value), mode: "insensitive" };
}

/** ตัวกรอง Prisma: ค่าในคอลัมน์ "มี" `value` อยู่ (สนตัวพิมพ์ — เหมือน `{ contains }` เดิม) — `%` `_` `\` เป็นตัวอักษรธรรมดา */
export function likeContains(value: string): { contains: string } {
  return { contains: likeEscape(value) };
}

/** ตัวกรอง Prisma: ค่าในคอลัมน์ "ขึ้นต้นด้วย" `value` (สนตัวพิมพ์) — `%` `_` `\` เป็นตัวอักษรธรรมดา */
export function likeStartsWith(value: string): { startsWith: string } {
  return { startsWith: likeEscape(value) };
}
