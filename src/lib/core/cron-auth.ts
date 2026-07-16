// Cron auth helper (WO-0043) — รวมมาตรฐาน auth ของ cron endpoint ทั้งแพลตฟอร์ม
// รับได้ทั้ง `Authorization: Bearer <secret>` (Vercel Cron ใหม่) และ `X-Cron-Secret: <secret>`
// (RemoteTrigger เดิม) — เทียบแบบ constant-time กัน timing attack
//
// secret หลัก = SHARK_CRON_SECRET (ตกไป CRON_SECRET ถ้าไม่ตั้ง) ตามสัญญา
// เพื่อรักษาพฤติกรรมเดิมของทั้งคู่ (Vercel ยิง SHARK_CRON_SECRET · RemoteTrigger เดิมยิง CRON_SECRET)
// จึงยอมรับค่าที่ตรงกับ SHARK_CRON_SECRET *หรือ* CRON_SECRET (ถ้ามีตั้งไว้) — คนละ header มาตรฐานได้

import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false; // timingSafeEqual โยนถ้าความยาวต่าง
  return timingSafeEqual(ab, bb);
}

// ดึง secret จาก header — Bearer ก่อน แล้วค่อย X-Cron-Secret
function extractSecret(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const v = auth.slice("Bearer ".length).trim();
    if (v) return v;
  }
  const xcron = req.headers.get("x-cron-secret");
  if (xcron && xcron.trim()) return xcron.trim();
  return null;
}

/** true = คำขอ cron ได้รับอนุญาต · ไม่มี header / ค่าผิด / ไม่ตั้ง secret → false */
export function isCronAuthorized(req: Request): boolean {
  const provided = extractSecret(req);
  if (!provided) return false;
  const shark = process.env.SHARK_CRON_SECRET;
  const legacy = process.env.CRON_SECRET;
  if (shark && safeEqual(provided, shark)) return true;
  if (legacy && safeEqual(provided, legacy)) return true;
  return false;
}
