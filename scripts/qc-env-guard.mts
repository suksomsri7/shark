// qc-env-guard.mts — ตัวโหลด env ของ "ข้อสอบรุ่นเก่า" + ด่านกัน production (WO 9.2 ข้อ 18)
//
// 🔴 เหตุการณ์จริง 3 ก.ย. 2026 15:40 UTC: agent สั่ง `pnpm qc:account` โดยไม่ export env ของ `.env.qc`
//    → `qc-account-cpa.mts` เรียก `process.loadEnvFile(".env")` ตรง ๆ ⇒ ชี้ **DB production**
//    → สร้าง tenant ชั่วคราวบน prod แล้วล้มกลางทาง (ต้องตามลบเอง)
//    ข้อสอบชุด acc-v2 มี `scripts/acc-v2-env.mts` กันอยู่แล้ว แต่ชุดเก่ายังโหลด `.env` ดิบ ๆ
//
// ไฟล์นี้ให้ชุดเก่าได้พฤติกรรมเดียวกับชุด acc-v2:
//   1) env ที่ **export มาก่อน** ชนะไฟล์เสมอ (พฤติกรรมของ process.loadEnvFile — วัดจริงแล้ว)
//   2) เคารพ `QC_ENV_FILE` (ตั้ง `.env.qc` แล้วชุดเก่าจะไปที่ DB ของ QC)
//   3) host เป็น production branch → **ตายทันที** เว้นแต่ตั้ง `ALLOW_PROD_QC=1` มาโดยตั้งใจ
//
// ใช้: แทนบรรทัด `try { process.loadEnvFile(".env"); } catch {}` ที่หัวไฟล์ข้อสอบ
//   import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
//   loadLegacyQcEnv("qc-account-cpa");

/** host ของ Neon branch `production` — เก็บเป็นชิ้นส่วน ไม่ใช่ URL เต็ม (ไม่มีรหัสผ่านในรีโป) */
export const PROD_HOST_MARK = "ep-royal-night";

/** จริง = URL นี้ชี้ไปฐานข้อมูล production */
export function isProdDbUrl(url: string | undefined | null): boolean {
  return !!url && url.includes(PROD_HOST_MARK);
}

/**
 * โหลด env ให้ข้อสอบรุ่นเก่า + กัน prod
 * @param label ชื่อชุดข้อสอบ (ใช้ในข้อความ error ให้รู้ว่าใครหยุด)
 * @returns host ของ DB ที่จะใช้จริง (พิมพ์ให้เห็นก่อนเริ่มได้)
 */
export function loadLegacyQcEnv(label: string): { host: string; envFile: string; allowedProd: boolean } {
  const envFile = process.env.QC_ENV_FILE ?? ".env";
  // env ที่ export มาก่อนชนะไฟล์ — จำค่าไว้ก่อนโหลด เพื่อรายงานที่มาให้ถูก
  const preDb = process.env.DATABASE_URL ?? "";
  const preDirect = process.env.DIRECT_URL ?? "";
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* CI/เครื่องที่ไม่มีไฟล์ — env ต้องถูก export มาให้ครบแล้ว */
  }
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* ไม่มีก็ได้ */
  }
  // 🔴 ถ้ามีการ export DATABASE_URL/DIRECT_URL มาก่อน ให้ยึดของนั้น (loadEnvFile ไม่ทับของเดิมอยู่แล้ว
  //    แต่ `.env.local` เคยทับได้ในบางรุ่น — บังคับคืนค่าให้ชัด · **ต้องคืนทั้งคู่**
  //    ถ้าคืนแต่ DATABASE_URL จะได้สภาพ "อ่านจาก QC แต่ migrate/DIRECT ไป prod" ซึ่งอันตรายกว่าเดิม)
  if (preDb) process.env.DATABASE_URL = preDb;
  if (preDirect) process.env.DIRECT_URL = preDirect;

  const db = process.env.DATABASE_URL ?? "";
  const allowedProd = process.env.ALLOW_PROD_QC === "1";
  if (isProdDbUrl(db) || isProdDbUrl(process.env.DIRECT_URL)) {
    if (!allowedProd) {
      console.error(
        `\n🔴 หยุด! ${label}: DATABASE_URL/DIRECT_URL ชี้ไป production branch (${PROD_HOST_MARK}…)\n` +
          `   ข้อสอบชุดนี้ **สร้างและลบข้อมูลจริง** — ห้ามรันบน prod\n` +
          `   วิธีรันให้ถูก:\n` +
          `     export DATABASE_URL=$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2-)\n` +
          `     export DIRECT_URL=$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2-)\n` +
          `     pnpm exec tsx scripts/${label}.mts\n` +
          `   (หรือ QC_ENV_FILE=.env.qc)\n` +
          `   ถ้าจงใจจะรันบน prod จริง ๆ ต้องตั้ง ALLOW_PROD_QC=1 มาเอง\n`,
      );
      process.exit(1);
    }
    console.warn(`⚠️  ${label}: ALLOW_PROD_QC=1 — กำลังรันบน production ตามที่สั่ง`);
  }
  const host = db ? safeHost(db) : "(ไม่พบ DATABASE_URL)";
  console.log(`[env] ${label} · ไฟล์ ${envFile} · DB ${host}`);
  return { host, envFile, allowedProd };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^.*@/, "").split("/")[0] ?? "(อ่าน host ไม่ได้)";
  }
}
