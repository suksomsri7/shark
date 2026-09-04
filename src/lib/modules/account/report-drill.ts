// report-drill.ts — drill-down ของรายงาน (WO 6.2 · DESIGN-SPEC-V2 §11.3)
//
// เส้นทาง 3 ชั้นตามสเปค:
//   ① ตัวเลขในรายงาน  → ② บัญชีแยกประเภท (/account/ledger?code=…&from=…&to=…)
//                      → ③ ใบสำคัญ (/account/journal/<entryId>)  → ④ เอกสารต้นทาง
//
// 🔴 ตรรกะบริสุทธิ์ทั้งไฟล์ (ไม่แตะ DB) — ข้อสอบเรียกตรงได้ · ยอดของแต่ละชั้นพิสูจน์ด้วย
//    `coa.ledgerRunning` (ชั้น ②) และ `journal-v2.journalEntryDetail` (ชั้น ③) ซึ่งอ่านจากสมุดรายวันชุดเดียวกัน
//
// ⚠️ รายงานพูดภาษา "periodKey" (YYYY-MM) แต่หน้าแยกประเภทพูดภาษา "วันที่" (YYYY-MM-DD)
//    แปลงที่นี่ที่เดียว — ถ้าแต่ละหน้าแปลงเอง ยอดชั้น ① กับ ② จะเพี้ยนกันตรงวันสุดท้ายของเดือน

/** วันแรกของงวด "YYYY-MM" → "YYYY-MM-01" */
export function periodFirstDay(periodKey: string): string {
  return `${periodKey}-01`;
}

/** วันสุดท้ายของงวด "YYYY-MM" → "YYYY-MM-DD" (คิดจากวันที่ 0 ของเดือนถัดไป — ครอบคลุมปีอธิกสุรทิน) */
export function periodLastDay(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${periodKey}-${String(last).padStart(2, "0")}`;
}

/** เลื่อน periodKey ไป n เดือน (ลบได้) */
export function shiftPeriod(periodKey: string, n: number): string {
  const [y, m] = periodKey.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/**
 * ช่วง "งวดก่อน" ที่ยาวเท่ากับช่วงปัจจุบัน (คอลัมน์ "เทียบงวดก่อน" ของ §11.3)
 * กติกาเดียวกับที่ `reports.profitLoss({compare:true})` ใช้อยู่แล้ว — ห้ามคิดคนละแบบ
 */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const span = idx(to) - idx(from); // จำนวนเดือน − 1
  const prevTo = shiftPeriod(from, -1);
  return { from: shiftPeriod(prevTo, -span), to: prevTo };
}

function idx(periodKey: string): number {
  const [y, m] = periodKey.split("-").map(Number);
  return y * 12 + (m - 1);
}

/**
 * ลิงก์ drill-down ชั้นที่ ② — ตัวเลขในรายงาน → บัญชีแยกประเภทของบัญชีนั้น ในช่วงเดียวกับรายงาน
 * ใช้ `code` ไม่ใช่ `accountId` เพราะแถวของ reports.ts มีแต่รหัสบัญชี (ไม่ fork ตรรกะรายงานเพื่อยัด id เพิ่ม)
 */
export function ledgerDrillHref(base: string, code: string, from: string, to: string): string {
  return `${base}/ledger?code=${encodeURIComponent(code)}&from=${periodFirstDay(from)}&to=${periodLastDay(to)}`;
}

/** ผลต่างงวดนี้เทียบงวดก่อน (สตางค์) + ร้อยละ (null = งวดก่อนเป็น 0 หารไม่ได้) */
export function deltaOf(current: number, previous: number): { diff: number; pct: number | null } {
  const diff = current - previous;
  return { diff, pct: previous === 0 ? null : Math.round((diff / Math.abs(previous)) * 1000) / 10 };
}
