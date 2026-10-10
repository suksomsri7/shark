// contact-data.ts — "ข้อความนี้มีข้อมูลติดต่อของคนไหม" (CRM C5.5-G3 · ด่านของความจำร้าน + คลังความรู้ที่ผู้ช่วย AI เขียนเอง)
//
// จับ 3 ชนิด: เบอร์โทร (ไทย มือถือ/บ้าน · สากล +xx / 00xx / 66xx) · อีเมล · เลขบัตรประชาชน 13 หลัก (ผ่าน checksum)
//   - ตัวเลขไทย ๐–๙ · ตัวเลขเต็มความกว้าง ０–９ · ตัวเลขอารบิก ٠–٩ นับเป็นตัวเลข
//   - ระหว่างกลุ่มตัวเลขคั่นได้ไม่เกิน 2 ตัวด้วย: ช่องว่าง (รวม nbsp / thin space / ช่องว่างเต็มความกว้าง) - . ( ) /
//     ขีดแบบอื่น U+2010–U+2015 (‐ ‑ ‒ – — ―) · เครื่องหมายลบ U+2212 − · ขีด/จุด/วงเล็บ/ทับเต็มความกว้าง  (089-900-0102 · (02) 123 4567 · 089–900–0102 · 089/900/0102)
//     รอบ 2 (รีวิว RV-1): `/` ไม่ทำให้วันที่ (1/10/2026 · 02/10/2026 = 7–8 หลัก ไม่ขึ้นต้นด้วยรูปเบอร์) หรือรายการราคา (100/150/200) กลายเป็นเบอร์ — ข้อสอบ M1.5
//   - รอบ 3 (รีวิว RV-9): `_` และ `·` (U+00B7) เป็นตัวคั่นด้วย · อักขระจัดรูปที่มองไม่เห็น (zero-width / joiner / word joiner / BOM /
//     soft hyphen / ตัวกำกับทิศทาง) ถูกตัดทิ้งก่อนสแกนทั้งเบอร์และอีเมล · `,` และ `:` ไม่ใช่ตัวคั่น (ราคา · เวลา)
//   - กลุ่มตัวเลขที่ติดกัน (เช่นสองเบอร์ในบรรทัดเดียว) ตรวจทุกช่วงต่อเนื่องของกลุ่ม ยาวไม่เกิน 15 หลัก ⇒ ช่วงละคงที่ = เชิงเส้น
//   - รอบ 3 (รีวิว RV-8) รูปของเบอร์ที่ต่อจากหลายกลุ่ม: **ทุกกลุ่มหลังกลุ่มแรกต้องยาว ≥ 3 หลัก** (089-900-0102 · 08-9900-0102 ·
//     (02) 123 4567 · 053-123-456 · 0-2123-4567) — หรือทุกกลุ่มยาว 1 หลัก (พิมพ์ทีละตัว 0 8 9 9 …) · ยกเว้นเบอร์สากล `+`/`00`
//     (+66 89 900 0102 มีกลุ่ม 2 หลักเป็นปกติ) ⇒ วันที่/เวลาที่เป็นกลุ่ม 2 หลัก (09/10/2026-08/11/2026 · 08.30-17.30 09.00-18.00) ไม่กลายเป็นเบอร์
//     ไม่จับโดยตั้งใจ: เบอร์ไทยที่เขียนเป็นคู่ "02 123 45 67" / "089 900 01 02" (ไม่ใช่รูปแบบที่ใช้ในไทย และเป็นรูปเดียวกับวันที่/เวลา)
//     เลขบัตรประชาชนไม่ใช้กฎนี้ (รูปมาตรฐาน 1-2345-67890-12-3 มีกลุ่ม 2 และ 1 หลัก — checksum กันผิดอยู่แล้ว)
//   - เบอร์บ้าน 9 หลัก: 02 + 7 หลัก หรือรหัสพื้นที่ 03x/04x/05x/07x ที่หลักที่ 3 เป็น 2–9 (ไม่มีรหัส 030/040/050/070 · 06 เป็นมือถือ) ⇒ 050/060/070 ไม่ใช่เบอร์
//   - ไม่จับ: วันที่ (2026-10-02 · 02/10/2026) · เวลา 09:00 · ราคา 1,250.50 · เลขที่เอกสาร SO-2026-0001 / INV-20261002-0042
// 🔴 เชิงเส้นพิสูจน์ได้: เดินสตริงรอบเดียว ไม่มี regex ย้อนรอย (fitness F16 / บทเรียน fix5) — อีเมลใช้ตัวเชิงเส้นของ core/linear-text
// 🔴 ไฟล์บริสุทธิ์ (import แค่ core/linear-text) — ทะเบียน AI โหลดได้ในโหมดไร้ env

import { replaceEmailsInText } from "@/lib/core/linear-text";

export type ContactKind = "phone" | "email" | "thai_id";

const MAX_DIGITS = 15;

function digitOf(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 0x0e50 && code <= 0x0e59) return code - 0x0e50; // ๐–๙
  if (code >= 0xff10 && code <= 0xff19) return code - 0xff10; // ０–９ (เต็มความกว้าง)
  if (code >= 0x0660 && code <= 0x0669) return code - 0x0660; // ٠–٩ (อารบิก-อินดิก)
  return -1;
}
function isSep(code: number): boolean {
  switch (code) {
    case 32: // ␠
    case 45: // -
    case 46: // .
    case 40: // (
    case 41: // )
    case 47: // /
    case 95: // _
    case 0xb7: // · middle dot
    case 0xa0: // nbsp
    case 0x2009: // thin space
    case 0x202f: // narrow nbsp
    case 0x3000: // ช่องว่างเต็มความกว้าง
    case 0x2212: // − เครื่องหมายลบ
    case 0xff0d: // － 
    case 0xff0e: // ．
    case 0xff08: // （
    case 0xff09: // ）
    case 0xff0f: // ／
      return true;
    default:
      return code >= 0x2010 && code <= 0x2015; // ‐ ‑ ‒ – — ―
  }
}
const isPlus = (code: number) => code === 43 || code === 0xff0b; // + ＋

/** อักขระจัดรูปที่มองไม่เห็น (Unicode Cf ที่ปลอดภัยจะตัดทิ้ง) — ตัดก่อนสแกน */
function isInvisibleFormat(code: number): boolean {
  return (
    code === 0x00ad || // soft hyphen
    code === 0x061c || // arabic letter mark
    code === 0x180e || // mongolian vowel separator
    (code >= 0x200b && code <= 0x200f) || // zero-width space / non-joiner / joiner · LRM / RLM
    (code >= 0x202a && code <= 0x202e) || // bidi embeddings / overrides
    (code >= 0x2060 && code <= 0x2064) || // word joiner · invisible operators
    (code >= 0x2066 && code <= 0x2069) || // bidi isolates
    code === 0xfeff // BOM / zero-width no-break space
  );
}

function thaiIdValid(d: string): boolean {
  if (d.length !== 13 || d[0] === "0" || d[0] === "9") return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

/**
 * ลำดับตัวเลข (ต่อกันจากกลุ่มที่ติดกัน) เป็นข้อมูลติดต่อชนิดไหม — `plus` = มี + นำหน้ากลุ่มแรก ·
 * `shapeOk` = รูปกลุ่มเป็นรูปเบอร์ (กลุ่มเดียว · ทุกกลุ่มหลังกลุ่มแรก ≥ 3 หลัก · หรือทุกกลุ่ม 1 หลัก) — เลขบัตรไม่ใช้
 */
function classify(d: string, plus: boolean, shapeOk: boolean): ContactKind | null {
  const n = d.length;
  if (plus) return n >= 8 && n <= MAX_DIGITS ? "phone" : null;
  if (n === 13 && thaiIdValid(d)) return "thai_id";
  if (d[0] === "0") {
    if (d[1] === "0" && n >= 10 && n <= MAX_DIGITS) return "phone"; // 00 + รหัสประเทศ (กลุ่ม 2 หลักเป็นปกติ)
    if (!shapeOk) return null;
    if (n === 10 && d[1] >= "6" && d[1] <= "9") return "phone"; // มือถือ 06x/08x/09x (+07x VoIP)
    if (n === 9 && (d[1] === "2" || ((d[1] === "3" || d[1] === "4" || d[1] === "5" || d[1] === "7") && d[2] >= "2" && d[2] <= "9"))) return "phone"; // บ้าน
    return null;
  }
  if (shapeOk && d[0] === "6" && d[1] === "6" && (n === 10 || n === 11) && d[2] >= "2" && d[2] <= "9") return "phone"; // 66 + เบอร์ไม่มี 0
  return null;
}

/** ชนิดข้อมูลติดต่อทั้งหมดที่พบ (ว่าง = ไม่พบ) */
export function findContactData(text: string): ContactKind[] {
  const raw = String(text ?? "");
  // ตัดอักขระจัดรูปที่มองไม่เห็นทิ้งก่อน (รอบเดียว) — ทั้งตัวสแกนเบอร์และอีเมลเห็นข้อความเดียวกัน
  let s = "";
  let from = 0;
  for (let i = 0; i < raw.length; i++) {
    if (isInvisibleFormat(raw.charCodeAt(i))) {
      s += raw.slice(from, i);
      from = i + 1;
    }
  }
  s = from === 0 ? raw : s + raw.slice(from);
  const found = new Set<ContactKind>();
  replaceEmailsInText(s, (m) => {
    found.add("email");
    return m;
  });
  // กลุ่มตัวเลขของ "ช่วง" ปัจจุบัน (กลุ่มที่คั่นด้วยตัวคั่น ≤ 2 ตัว) — ตรวจเมื่อปิดกลุ่มแต่ละกลุ่ม
  let groups: string[] = [];
  let plusFirst = false;
  let cur = "";
  let sepRun = 0;
  const closeGroup = () => {
    if (!cur) return;
    groups.push(cur);
    cur = "";
    // ทุกช่วงต่อเนื่องที่จบที่กลุ่มนี้ (ย้อนได้ไม่เกิน MAX_DIGITS หลัก ⇒ ไม่เกิน 15 กลุ่ม)
    // รูปกลุ่ม: minLater = ความยาวน้อยสุดของกลุ่มหลังกลุ่ม k · allSingle = ทุกกลุ่มตั้งแต่ k ยาว 1 หลัก
    let acc = "";
    let minLater = Infinity;
    let allSingle = true;
    for (let k = groups.length - 1; k >= 0; k--) {
      const g = groups[k]!;
      acc = g + acc;
      if (acc.length > MAX_DIGITS) break;
      allSingle = allSingle && g.length === 1;
      const kind = classify(acc, k === 0 && plusFirst, minLater >= 3 || allSingle);
      if (kind) found.add(kind);
      minLater = Math.min(minLater, g.length);
    }
    if (groups.length > MAX_DIGITS) {
      groups = groups.slice(-MAX_DIGITS); // กลุ่มเก่ากว่านี้ไม่มีวันอยู่ในช่วง ≤ 15 หลักได้อีก
      plusFirst = false; // กลุ่มแรกที่มี + ถูกตัดออกไปแล้ว
    }
  };
  const endRun = () => {
    closeGroup();
    groups = [];
    plusFirst = false;
    sepRun = 0;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const dg = digitOf(c);
    if (dg >= 0) {
      if (sepRun > 0) closeGroup();
      sepRun = 0;
      cur += String(dg);
      continue;
    }
    if (isPlus(c)) {
      endRun();
      plusFirst = true;
      continue;
    }
    if (isSep(c) && (cur || groups.length > 0) && sepRun < 2) {
      sepRun++;
      continue;
    }
    if (isSep(c) && !cur && groups.length === 0) continue; // "(" ก่อนกลุ่มแรก
    endRun();
  }
  endRun();
  return [...found];
}

const LABEL: Record<ContactKind, string> = { phone: "เบอร์โทร", email: "อีเมล", thai_id: "เลขบัตรประชาชน" };

/** ข้อความไทยสั้น ๆ สำหรับตอบผู้ช่วย (ส่งต่อให้ผู้ใช้ได้) — `where` = เก็บไว้ที่ไหน */
export function contactDataRefusal(kinds: ContactKind[], where: string): string {
  const what = kinds.map((k) => LABEL[k]).join(" / ");
  return `บันทึก${where}ไม่ได้: ข้อความมีข้อมูลติดต่อของบุคคล (${what}) ซึ่งทุกคนในร้านจะเห็น — เก็บข้อมูลติดต่อลูกค้าในระบบสมาชิกหรือ CRM แทน แล้วจดเฉพาะส่วนที่ไม่มีข้อมูลติดต่อ`;
}
