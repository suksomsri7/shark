// sec-qc-env.mts — ด่าน host ของ RUN "เลขา AI" (ใบ S0.3) · ใช้คู่กับ `scripts/qc-sec.sh` (ฐาน `wo-sec-qc`)
//
// แบบอย่าง: `loadSvcQcEnv` ใน `scripts/svc-qc-env.mts` — ต่างกันที่:
//   • ยอมเฉพาะ hostname ที่ขึ้นต้นด้วย ep-calm-flower-aosbmxhm (ฐาน QC ของเลขา) ทั้ง DATABASE_URL และ DIRECT_URL
//   • ต้องมี SEC_QC_HOST ที่ qc-sec.sh ตั้งให้หลังตรวจ host แล้ว (= ต้องรันผ่านตัวครอบ ไม่ใช่ export URL เอง)
//   • ไม่โหลดไฟล์ env เอง — qc-sec.sh ส่ง DATABASE_URL/DIRECT_URL มาให้แล้ว (สคริปต์นี้ไม่เปิดไฟล์ความลับใด ๆ)
//   production / QC ของ RUN อื่น / host อื่น / ไม่มี env / QC_ENV_FILE=.env ⇒ exit 4 เสมอ (ไม่มีทางปลด)
//
// 🔴 ไฟล์นี้ไม่ import ไลบรารีฐานข้อมูลและไม่ import `@/…` — ผู้เรียกต้องเรียก loadSecQcEnv ก่อน import ตัวต่อฐาน (dynamic import)
// 🔴 พิมพ์เฉพาะ hostname — ห้ามพิมพ์ URL เต็ม/รหัสผ่าน

/** host ของฐาน QC ของ RUN เลขา (`wo-sec-qc`) — ตรงกับรายการอนุญาตใน scripts/qc-sec.sh */
export const SEC_QC_HOST_MARK = "ep-calm-flower-aosbmxhm";
/** production (Neon หลัก) */
export const SEC_PROD_HOST_MARK = "ep-royal-night";
/** ฐาน QC ที่ RUN อื่นถืออยู่ — เลขาห้ามแตะ (CRM QC1–QC3 · POS QC4/QC5 · SVC + ฐานต่อเลน) */
export const SEC_OTHER_RUN_HOST_MARKS = [
  "ep-plain-art",
  "ep-cool-shadow",
  "ep-weathered-river",
  "ep-frosty-lab",
  "ep-fragrant-thunder",
  "ep-mute-scene",
  "ep-royal-lake",
  "ep-weathered-mode",
  "ep-royal-bar",
] as const;

/** hostname ของ URL (ตัวเล็ก) — parse ไม่ได้/ว่าง ⇒ "" (ผู้เรียก exit 4) */
function parseHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function stop(label: string, why: string): never {
  console.error(`🔴 หยุด! ${label}: ${why} — รันผ่าน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/<ไฟล์>.mts`);
  process.exit(4);
}

/** ตรวจว่า env ชี้ฐาน QC ของเลขาเท่านั้น · ผ่าน = คืน host · ไม่ผ่าน = exit(4) ก่อนแตะฐาน */
export function loadSecQcEnv(label: string): { host: string } {
  if ((process.env.QC_ENV_FILE ?? "") === ".env") stop(label, "QC_ENV_FILE=.env คือ production");
  if (process.env.APP_ENV === "production") stop(label, "APP_ENV=production");
  const mark = process.env.SEC_QC_HOST ?? "";
  if (mark !== SEC_QC_HOST_MARK) stop(label, `SEC_QC_HOST ไม่ใช่ ${SEC_QC_HOST_MARK} (ได้ "${mark || "-"}")`);
  const db = process.env.DATABASE_URL ?? "";
  const direct = process.env.DIRECT_URL ?? "";
  for (const [name, url] of [["DATABASE_URL", db], ["DIRECT_URL", direct]] as const) {
    if (!url) stop(label, `ไม่มี ${name}`);
    const hostname = parseHostname(url);
    if (!hostname) stop(label, `${name} อ่าน host ไม่ได้`);
    // ชั้นเสริม: substring ของ prod ทั้งเส้น (กันกรณี host ซ่อนใน query/option)
    if (url.toLowerCase().includes(SEC_PROD_HOST_MARK) || hostname.includes(SEC_PROD_HOST_MARK)) stop(label, `${name} ชี้ production`);
    const other = SEC_OTHER_RUN_HOST_MARKS.find((m) => hostname.includes(m));
    if (other) stop(label, `${name} ชี้ฐาน QC ของ RUN อื่น (${other})`);
    if (!hostname.startsWith(SEC_QC_HOST_MARK)) stop(label, `${name} host ${hostname} ไม่ใช่ฐาน QC ของเลขา (${SEC_QC_HOST_MARK})`);
  }
  process.env.APP_ENV ??= "development";
  const host = parseHostname(db);
  console.log(`[env] ${label} · DB ${host} (qc-sec)`);
  return { host };
}
