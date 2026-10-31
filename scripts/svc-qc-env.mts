// svc-qc-env.mts — ตัวโหลด env + ด่าน host ของ RUN SVC (จองคิว/หอ/โรงแรม V2 · ใบ R0.1)
//
// ใช้คู่กับ `scripts/qc-svc.sh` (ฐาน `wo-svc-qc` · host ep-mute-scene) · ข้อสอบ `scripts/qc-svc-*.mts` · seed/visual ของ SVC
// แบบอย่าง: `loadPosQcEnv` ใน `scripts/pos-qc-env.mts` — ต่างกันที่ **ไม่มีทางปลด** ใด ๆ:
//   ยอมเฉพาะ host qc-svc (ep-mute-scene) · production / QC ของ RUN อื่น / host อื่น ⇒ exit 4 เสมอ
//
// 🔴 ไฟล์นี้ไม่ import prisma และไม่ import `@/…` — import ได้จาก fitness/ที่ไม่มี env
// 🔴 พิมพ์เฉพาะ host — ห้ามพิมพ์ URL เต็ม/รหัสผ่าน

import { isProdDbUrl, PROD_HOST_MARK } from "./qc-env-guard.mjs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";

/** host ของฐาน QC ของ RUN SVC (`wo-svc-qc`) */
export const SVC_QC_HOST_MARK: string = svcQcHostMark(); // ผู้คุม 31 ต.ค. · ฐานต่อเลน (เดิม "ep-mute-scene")
/** host ของฐาน QC ที่ RUN อื่นถืออยู่ — SVC ห้ามแตะ (QC1–QC3 ของ CRM · QC4/QC5 ของ POS) */
export const OTHER_RUN_QC_HOST_MARKS = ["ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"] as const;

/** hostname ของ URL (ตัวเล็ก) — parse ไม่ได้/ว่าง ⇒ "" (ผู้เรียก exit 4) */
function parseHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function loadSvcQcEnv(label: string): { host: string; envFile: string } {
  const envFile = process.env.QC_ENV_FILE || ".env.qc-svc";
  if (envFile === ".env") {
    console.error(`🔴 ${label}: QC_ENV_FILE=.env คือ production — ห้าม (ใช้ .env.qc-svc ผ่าน scripts/qc-svc.sh)`);
    process.exit(4);
  }
  const preDb = process.env.DATABASE_URL ?? "";
  const preDirect = process.env.DIRECT_URL ?? "";
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* ไม่มีไฟล์ — ต้อง export DATABASE_URL/DIRECT_URL มาแล้ว (ตรวจด้านล่าง) */
  }
  // env ที่ export มาก่อนชนะไฟล์ — คืนทั้งคู่ (คืนตัวเดียว = อ่าน QC แต่ DIRECT ชี้ที่อื่น)
  if (preDb) process.env.DATABASE_URL = preDb;
  if (preDirect) process.env.DIRECT_URL = preDirect;
  const db = process.env.DATABASE_URL ?? "";
  const direct = process.env.DIRECT_URL ?? "";
  if (!db) {
    console.error(`❌ ${label}: ไม่มี DATABASE_URL (ไฟล์ ${envFile} ไม่มี และไม่ได้ export มา) — รันผ่าน: bash scripts/iso.sh bash scripts/qc-svc.sh …`);
    process.exit(4);
  }
  // ด่าน host ทั้งสอง URL (ไม่มีทางปลด) — ตัดสินจาก hostname จริง ไม่ใช่ substring ทั้งเส้น
  //   ว่าง/parse ไม่ได้ → production → QC ของ RUN อื่น → hostname ไม่ขึ้นต้นด้วย qc-svc ⇒ exit 4
  for (const [name, url] of [["DATABASE_URL", db], ["DIRECT_URL", direct]] as const) {
    if (!url) {
      console.error(`🔴 หยุด! ${label}: ไม่มี ${name} — รันผ่าน: bash scripts/iso.sh bash scripts/qc-svc.sh …`);
      process.exit(4);
    }
    const hostname = parseHostname(url);
    if (!hostname) {
      console.error(`🔴 หยุด! ${label}: ${name} อ่าน host ไม่ได้ — หยุด`);
      process.exit(4);
    }
    // ชั้นเสริม: substring ของ prod ทั้งเส้น (กันกรณี host ซ่อนใน query/option)
    if (isProdDbUrl(url) || hostname.includes(PROD_HOST_MARK)) {
      console.error(`🔴 หยุด! ${label}: ${name} ชี้ production (${PROD_HOST_MARK}…) — ชุด QC ของ SVC ห้ามแตะ prod`);
      process.exit(4);
    }
    const other = OTHER_RUN_QC_HOST_MARKS.find((m) => hostname.includes(m));
    if (other) {
      console.error(`🔴 หยุด! ${label}: ${name} ชี้ฐาน QC ของ RUN อื่น (${other}) — SVC ใช้ qc-svc (${SVC_QC_HOST_MARK}) เท่านั้น`);
      process.exit(4);
    }
    if (!hostname.startsWith(SVC_QC_HOST_MARK)) {
      console.error(`🔴 หยุด! ${label}: ${name} host ${hostname} ไม่ใช่ qc-svc (${SVC_QC_HOST_MARK}) — รันผ่าน scripts/qc-svc.sh`);
      process.exit(4);
    }
  }
  if (process.env.APP_ENV === "production") {
    console.error(`🔴 หยุด! ${label}: APP_ENV=production`);
    process.exit(4);
  }
  process.env.APP_ENV ??= "development";
  const host = parseHostname(db);
  console.log(`[env] ${label} · ไฟล์ ${envFile} · DB ${host} (qc-svc)`);
  return { host, envFile };
}
