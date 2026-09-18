// ที่อยู่ของวัตถุบนที่เก็บ — ตัวตรวจ **ชุดเดียว** ของทั้งระบบ (ใบ CRM v2 C0.4 · รอบแก้ความปลอดภัย)
//
// ═══════════════════════════════════════════════════════════════════════════
// ทำไมไฟล์นี้ถึงมี — บทเรียน 3 ข้อจากการตรวจความปลอดภัย 18 ก.ย.
//
// 1) 🔴 **บัญชีดำ `..` ไม่พอ** — ตัวแยก URL ตามมาตรฐาน WHATWG (ตัวเดียวกับที่ `fetch()` ใช้)
//    คลาย `%2e%2e` ให้เป็น `..` **หลังจาก**ที่เราตรวจไปแล้ว:
//      new URL(".../zone1/t/A/private/%2e%2e/%2e%2e/%2e%2e/t/B/private/secret.mp3").pathname
//        → "/zone1/t/B/private/secret.mp3"
//    และใส่อีกชั้นเดียวก็ออกนอก storage zone ไปเลย (`/zone2/t/B/x.pdf`)
//    ขณะที่ `"…%2e%2e…".includes("..")` เป็น **false**
//    (`.%2e` · `%2E%2E` ก็เหมือนกัน · ขึ้นบรรทัดใหม่ดิบ ๆ ถูกตัวแยกลบทิ้งเงียบ ๆ)
//    ⇒ ที่นี่เป็น **บัญชีขาว**: อะไรที่ไม่ตรงรูปที่ประกาศไว้เป๊ะ = ปฏิเสธ · ห้ามมี `%` เด็ดขาด
//
// 2) 🔴 **path ไม่เคยถูกผูกกับร้านเจ้าของแถว** — `FileAsset.path` ไม่ได้ถูกสร้างโดยเซิร์ฟเวอร์เสมอ:
//    `modules/kanban/links.ts:373` เขียน `path: (f.storageKey ?? "").trim() || url` ตรง ๆ จาก body
//    ของ chat API v1 ⇒ พนักงานร้าน A ปลูกแถวในร้าน A ที่ path ชี้เข้าไปในร้าน B ได้
//    ⇒ `storagePathForTenant(path, tenantId)` คือด่านที่ผูกสองอย่างนี้เข้าด้วยกัน และเป็นด่าน
//    **เดียว** ที่ผู้เรียกทั้งอ่านและลบต้องผ่าน
//
// 3) 🔴 ผลของ (2) ที่ **เกิดได้จริงวันนี้**: ตัวลบเดิมรับ `^t/<อะไรก็ได้>/` แล้วใช้ `tenantId`
//    แค่ในบรรทัด log ⇒ ร้าน A เอา URL โลโก้ของร้าน B (ที่พิมพ์อยู่บนหน้าร้านสาธารณะ) มาแปะเป็น
//    ไฟล์แนบในแชท พอ retention sweep ทำงาน วัตถุของร้าน B ก็หายจากที่เก็บ — ไม่ต้องใช้ `..` เลย
// ═══════════════════════════════════════════════════════════════════════════

/** ชื่อโฟลเดอร์ที่แปลว่า "ไฟล์ส่วนตัว" */
export const STORAGE_PRIVATE_FOLDER = "private";

/** รูปของ tenantId (cuid) — ใช้ทั้งกับส่วนใน path และกับค่าที่ผู้เรียกยื่นมา */
const TENANT_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** โฟลเดอร์ชั้นเดียว: `logo` · `attachment` · `private` · `chat` (ของเดิมจาก API v1) */
const FOLDER_RE = /^[a-z0-9_-]{1,32}$/;
/** ชื่อไฟล์: ต้องเริ่มด้วยตัวอักษร/ตัวเลขเสมอ ⇒ เป็น `.` หรือ `..` ไม่ได้ตั้งแต่ต้น */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
/** อักขระที่ห้ามมีใน path **ทั้งเส้น** ไม่ว่าอยู่ตรงไหน */
function hasHostileChar(path: string): boolean {
  // `%` = ปิดประตู percent-encoding ทุกรูปแบบในคราวเดียว (`%2e` `%2f` `%5c` `%00` ...)
  // `\\` = ตัวแยก path ของอีกโลกหนึ่ง (WHATWG แปลงเป็น `/` ให้)
  if (path.includes("%") || path.includes("\\")) return true;
  // อักขระควบคุม + ช่องว่าง: ถูกตัวแยก URL ลบทิ้งเงียบ ๆ แล้วได้ path คนละเส้นกับที่เราตรวจ
  // 🔴 ตรวจด้วยรหัสอักขระ ไม่ใช่ regex ที่ฝังอักขระควบคุมดิบไว้ในซอร์ส —
  //    ซอร์สที่มีไบต์ 0x00 อยู่จริงคือไฟล์ที่ grep มองว่าเป็น binary และ editor ตัวถัดไปอาจกลืนหายไป
  for (let i = 0; i < path.length; i += 1) {
    const code = path.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** ชื่อไฟล์ส่วนตัวสั้นกว่านี้ = เดาได้ (ของจริงคือ 40 hex) */
const PRIVATE_MIN_NAME_LEN = 8;
/** เพดานความยาวทั้งเส้น — กันสตริงยาวผิดปกติมาถล่มตัวตรวจ */
const MAX_PATH_LEN = 300;

export type ParsedStoragePath = {
  tenantId: string;
  folder: string;
  name: string;
  isPrivate: boolean;
  /** เส้นทางที่ประกอบใหม่จากส่วนที่ตรวจแล้ว — ใช้ตัวนี้เท่านั้น ห้ามใช้สตริงดิบของผู้เรียก */
  path: string;
};

/**
 * แยก path ตามรูปที่อนุญาต — ไม่ตรงแม้แต่ข้อเดียว = `null` (ไม่มี "เกือบถูก")
 * รูปเดียวที่มีในระบบ: `t/<tenantId>/<folder>/<filename>` — สี่ส่วนพอดี ไม่มากไม่น้อย
 */
export function parseStoragePath(raw: string | null | undefined): ParsedStoragePath | null {
  const path = typeof raw === "string" ? raw : "";
  if (!path || path.length > MAX_PATH_LEN) return null;
  if (hasHostileChar(path)) return null;

  const seg = path.split("/");
  if (seg.length !== 4) return null; // `..` ที่เป็นส่วนของตัวเองจะทำให้จำนวนส่วนไม่ใช่ 4 เสมอ
  const [root, tenantId, folder, name] = seg as [string, string, string, string];
  if (root !== "t") return null;
  if (!TENANT_RE.test(tenantId)) return null;
  if (!FOLDER_RE.test(folder)) return null;
  if (!NAME_RE.test(name)) return null;
  if (name.includes("..")) return null; // กันชั้นที่สองของชื่อไฟล์ (เช่น `a..b`)

  const isPrivate = folder === STORAGE_PRIVATE_FOLDER;
  if (isPrivate && name.length < PRIVATE_MIN_NAME_LEN) return null;

  return { tenantId, folder, name, isPrivate, path: `t/${tenantId}/${folder}/${name}` };
}

/**
 * 🔴 ด่านหลักของทั้งงาน: path นี้ถูกรูป **และ** เป็นของร้านนี้จริงไหม
 *
 * คืนเส้นทางที่ประกอบใหม่ (ไม่ใช่สตริงดิบ) เมื่อผ่าน · `null` เมื่อไม่ผ่าน
 * ผู้เรียกที่ไม่รู้ว่าไฟล์เป็นของร้านไหน = ไม่มีสิทธิ์แตะไฟล์นั้น ⇒ ต้องส่ง `tenantId` เสมอ
 */
export function storagePathForTenant(
  raw: string | null | undefined,
  tenantId: string | null | undefined,
): string | null {
  const t = typeof tenantId === "string" ? tenantId.trim() : "";
  if (!TENANT_RE.test(t)) return null; // ไม่รู้เจ้าของ = fail-closed
  const parsed = parseStoragePath(raw);
  if (!parsed) return null;
  if (parsed.tenantId !== t) return null; // ← ช่องโหว่ข้ามร้านปิดตรงบรรทัดนี้
  return parsed.path;
}

/**
 * ตัวอ้างอิงสำหรับเขียน log — ไฟล์ส่วนตัวตัดชื่อไฟล์ทิ้ง
 *
 * 🔴 pull zone ของ Bunny ยังเสิร์ฟทั้งโซน ⇒ ชื่อไฟล์สุ่ม 160 บิตนั้น **คือเกราะทั้งหมด**
 *    ของไฟล์ส่วนตัว · เขียนลง OpsEvent = แจกกุญแจถาวรที่ไม่ผูกกับใครและไม่มีวันหมดอายุ
 *    ให้ทุกคนที่เปิดหน้า ops อ่านได้
 */
export function storageLogRef(parsed: ParsedStoragePath): string {
  return parsed.isPrivate ? `t/${parsed.tenantId}/${parsed.folder}/…` : parsed.path;
}
