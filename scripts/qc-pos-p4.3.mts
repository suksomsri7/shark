// QC — POS RUN ใบ P4.3 (oracle แดงก่อน): แก้ที่ walker phase A พบ (P1 กล้อง · P2 ลิงก์บัญชี · P3 = B7 โปรราคาผู้จัดการสาขาเดียว · P4 chat updatedAt ·
//   R10 แผ่น QR) + งานค้างจาก P3.12 (F-P3-16 วันครบกำหนด · F-P3-17/18/19 HR/แคตตาล็อก/TTL · F-P3-21 ลิงก์การ์ดบอร์ด · F-P3-22 route พิมพ์รายงาน · F-P3-10 ชิป #0)
//   brief = ledger/pos-briefs/pos-prompt-accountA-P4.3-ORACLE.md · triage = ledger/wo-notes/pos-P4.3-triage.md §3 P1–P4 + §1 R10 · โน้ต = ledger/wo-notes/pos-P4.3-oracle.md
//   มติผู้คุม CD-P43-1…6 (POS-RESUME 23 ต.ค. 23:1xZ) · มติของ oracle CD-P43-O1…O9 (ในโน้ต) — สัญญาของฟิลด์/ชื่อที่ product builder ต้องใช้อยู่ในโน้ต §2
//
// รัน (QC4 · ร้านชั่วคราว):
//   env -C <tree> ISO_MEM=3G bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p4.3.mts
//   --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต S1 S2 S5 S6 S7 S8 + probe N1–N10 (ไม่โหลด prisma) · --self-test = probe N1–N10 อย่างเดียว
// DB: QC4 เท่านั้น · ร้านชั่วคราว posqc-p43-<rand> (2 สาขา · POS · บัญชี · HR) สร้างผ่านตัวเขียนของโมดูล · ลบทั้งร้านใน finally (Z1 · รวม sequence เลขใบสำคัญ
//     ของระบบบัญชีชั่วคราวผ่าน account_jno_drop) · ร้าน QC coffee/resto อ่านลายนิ้วมืออย่างเดียว (Z2) · ไม่ reseed · fetch ออกนอก = ตัวกั้น 503
// ไม่มีด่านข้าม (ทุกข้อรันเสมอ — surface ที่ยังไม่มี = แดงพร้อมเหตุ "ไม่มี …") ⇒ แมนิเฟสต์ unforced (p2.14 G2)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SUITE = "qc-pos-p4.3";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const SELFTEST = process.argv.includes("--self-test");
/** ฐานของข้อสอบ (session/pos ตอนเขียน = dd2508d0) — ข้อสอบนี้ไม่มีข้อเทียบไฟล์กับหมุด (พิมพ์อย่างเดียว) */
const PIN = process.env.P43_PIN || "dd2508d0";
/** หมุดเลน (ไม่มีข้อเทียบหมุด — พิมพ์ไว้ให้ผู้คุม) */
const LANE_PIN = process.env.P43_LANE_PIN || PIN;

// ═════════════════════════ ทะเบียนข้อสอบ D(id · กลุ่ม · หัวข้อ · surface ที่ต้องแก้) ═════════════════════════
type Def = readonly [string, string, string, string];
const D = (id: string, x: string, title: string, ref: string): Def => [`P4.3-${id}`, x, title, ref] as const;
const CHECKS: readonly Def[] = [
  D("S1", "P1", "[static · CD-P43-1] Permissions-Policy ทุกจุดใน src อนุญาตกล้องเฉพาะ origin เดียวกัน camera=(self) · microphone=() geolocation=() คงปิด · ScanCameraDialog ยังใช้ getUserMedia({video})", "src/proxy.ts:54 · src/components/pos/register/ScanCameraDialog.tsx:82"),
  D("S2", "P2", "[static · CD-P43-2] ลิงก์บัญชีแสดงเฉพาะผู้มีสิทธิ์: หน้า /sales ส่งธงจาก account.doc.view ให้ BillsClient · ลิงก์ pos-settings-account-link อยู่ใต้เงื่อนไข + ข้อมูลตัดสินจาก account.settings.manage · ทะเบียน 2 แถว hiddenFor มี cashier (roles ไม่มี cashier)", "sales/page.tsx:68 · BillsClient.tsx:1657 · ReceiptSettings.tsx:670-676 · receipt-settings-actions.ts:113 · scripts/pos-ui-inventory.json"),
  D("S5", "R10", "[static] pos-tbl-qr-sheet-print: ตัวจัดการกดเรียก window.print() อย่างเดียว (ไม่มี fetch/action/await/router) — แถวทะเบียน tables#pos-tbl-qr-sheet-print อ้าง oracle P4.3-S5", "src/components/pos/tables/TableQr.tsx:149"),
  D("S6", "F-P3-17/18/19", "[static] 17C แท็บพนักงาน: ป้าย 'จาก HR' รายคน (settings-overview.ts → fromHr · StaffSettings ใช้) · การ์ดค่าคอมฯ อ่านแคตตาล็อกจาก posCommissionCatalogAction (ไม่ใช่ registerCatalogAction) · LockScreen ใช้ overrideTtlMin + lock.schedule.overrideBody {minutes}", "settings-overview.ts:127 · StaffSettings.tsx · StaffHrCards.tsx:17,273,300 · settings-actions.ts · LockScreen.tsx:486,657"),
  D("S7", "F-P3-21", "[static · CD-P38U-9] หน้าขาย / ออเดอร์ / บิล ลิงก์การ์ดบอร์ด 86/คืนเงิน: มีตัวอ่านการ์ดที่รับกุญแจ pos-86: + pos-refund: (posCardsForKeys) และทั้ง 3 ทรีจอใช้ตัวอ่านนั้น (import action หรือ page เรียก posCardsForKeys + posBoardKeys.soldOut/refund)", "src/lib/pos-board-ui-actions.ts:45 · RegisterScreen.tsx · OrdersScreen.tsx · BillsClient.tsx"),
  D("S8", "F-P3-10", "[static] ชิปการ์ดไม่แสดง '#0' เมื่อ cardNo เป็น null — ไม่มี `cardNo ?? 0` / `cardNo || 0` ในจอ POS", "reports/ReportsClient.tsx:255,259 · shifts/ShiftsClient.tsx:944"),
  D("D1", "P2", "[db · CD-P43-O1 ระดับด่าน] CASHIER: ด่านของหน้าที่ลิงก์ชี้ (requireAccountPage account.doc.view = /account/print · account.settings.manage = /account/settings) ปฏิเสธด้วย ForbiddenError · OWNER ผ่านทั้งคู่ (ตัวควบคุมบวก)", "src/lib/modules/account/guard.ts:15,26 (ไม่ต้องแก้ — ตาข่ายกันถอย)"),
  D("D2", "P3=B7", "[db · CD-P43-3] MANAGER[A1] savePriceRuleAction unitIds [] → ok + เก็บเป็น [A1] พอดี (ไม่ใช่ [] = ทุกสาขา) · สลับเปิด/ปิด + เก็บถาวรกติกานั้น → ok · ขยายไป [A2]/[A1,A2] → PERMISSION_DENIED · สลับกติกาทุกสาขาของ OWNER → ปฏิเสธ + แถวเดิม · OWNER [] → ok เก็บ []", "src/lib/modules/pos/price-rule.ts:90-94 (+ PriceRulesClient.tsx:46,493)"),
  D("D3", "P4", "[db · CD-P43-4] setPosChatSettings (OWNER · receiptAuto) → ok · settings.pos.chat เปลี่ยน · AppSystem.updatedAt ขยับ (ตัวเขียนพี่น้อง settings-general.ts:126 ทำแล้ว)", "src/lib/modules/pos/chat-link.ts:79-86"),
  D("D4", "F-P3-16", "[db · CD-P36U-7] บิลวางบิล ON_ACCOUNT ผ่าน submitRegisterSale: creditTerms.dueDate (= PosSale.creditTerms.dueDate) อยู่บน ผลส่งบิล · billDetail.bill · receiptForSale().payload · publicReceipt(/r).receipt", "register-shared.ts:508 · bills-shared.ts:101 · receipt-render.ts:83 · public-receipt.ts:57"),
  D("D5", "F-P3-17/18/19", "[db] posStaffOverview: พนักงานที่ผูก HR fromHr=true · ไม่ผูก fromHr=false · posCommissionCatalogAction: ผู้ดูเงินเดือน (STAFF hr.payroll.read ไม่มีสิทธิ์ขาย) เห็นหมวด/สินค้า/ตัวแปร/สินค้าสาขาอื่น · NOPERM ปฏิเสธ · listStaffForDevice คืน overrideTtlMin ตามค่าตั้ง", "settings-overview.ts:120-159 · settings-actions.ts · staff-pin.ts:588"),
  D("D6", "F-P3-22", "[db · RPT-6] route พิมพ์รายงาน text/html ใต้ /app/sys/[id]/pos/reports/** (route.ts GET): ANON → 401/ไป /login · STAFF ไม่มี pos.report.view → 403 · OWNER → 200 text/html มี <html + print(", "src/app/app/sys/[id]/pos/reports/print/html/route.ts (ใหม่ · CD-P43-O8)"),
  D("N1", "N", "[self-test] judgeS1: นโยบายปัจจุบัน/camera=*/ไมค์เปิด แดง · camera=(self) เขียว", "-"),
  D("N2", "N", "[self-test] judgeS2: ไม่มีธง/ลิงก์ไม่อยู่ใต้เงื่อนไข/แถวไม่มี hiddenFor แดง · ธง account.doc.view + เงื่อนไข + hiddenFor เขียว", "-"),
  D("N3", "N", "[self-test] judgeS5: window.print อย่างเดียวเขียว · มี fetch/Action/await แดง · ตัวจัดการชื่อฟังก์ชันตามไปอ่าน", "-"),
  D("N4", "N", "[self-test] judgeS6: ขาดแต่ละส่วน (fromHr · reader ใหม่ · overrideBody/TTL) แดงแยกกัน · ครบเขียว", "-"),
  D("N5", "N", "[self-test] judgeS7: reader รับแค่ pos-anomaly: แดง · รับ pos-86:/pos-refund: + 3 ทรีใช้ เขียว · ทรีหนึ่งไม่ใช้ แดง", "-"),
  D("N6", "N", "[self-test] judgeS8: `cardNo ?? 0` แดง · `cardNo ? … : …` เขียว", "-"),
  D("N7", "N", "[self-test] judgeD2: ผู้จัดการถูกปฏิเสธ (ฐาน) แดง · เก็บ [] (ขยายเป็นทุกสาขา) แดง · ทับกติกาทุกสาขา แดง · ถูกต้อง เขียว", "-"),
  D("N8", "N", "[self-test] judgeD3/D4: updatedAt เท่าเดิม แดง · ขยับ เขียว · dueDate ขาดที่ผิวใดผิวหนึ่ง/ค่าไม่ตรง แดง · ครบ เขียว", "-"),
  D("N9", "N", "[self-test] judgeD1/D6: CASHIER ผ่านด่าน/OWNER ถูกปฏิเสธ แดง · route ไม่มี/ANON 200/STAFF 200/OWNER ไม่ใช่ html แดง · ถูกต้อง เขียว", "-"),
  D("N10", "N", "[self-test] judgeD5: fromHr ไม่มี/ผิดคน แดง · reader ปฏิเสธผู้ดูเงินเดือน/ขาดตัวแปร แดง · TTL ไม่มี แดง · ครบ เขียว", "-"),
  D("Z1", "Z", "[db] ร้านชั่วคราว posqc-p43-*: 0 แถวทุกตารางที่มี tenantId · Tenant/User ลบ · sequence เลขใบสำคัญของระบบบัญชีชั่วคราว 0", "-"),
  D("Z2", "Z", "[db] ลายนิ้วมือร้าน QC coffee/resto (12 ตาราง) เท่าเดิม", "-"),
];
const PROBE_IDS = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10"].map((x) => `P4.3-${x}`);
const STATIC_IDS = new Set([...["S1", "S2", "S5", "S6", "S7", "S8"].map((x) => `P4.3-${x}`), ...PROBE_IDS]);
if (LIST) {
  for (const [id, x, title, ref] of CHECKS) console.log(`${id}\t${x}\t${STATIC_IDS.has(id) ? "static" : "db"}\t${title}\t← ${ref}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "list", total: CHECKS.length, passed: 0, static: STATIC_IDS.size, pin: PIN, lanePin: LANE_PIN })}`);
  process.exit(0);
}

// ═════════════════════════ ผลตรวจ ═════════════════════════
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: boolean, expected: string, actual: string): void {
  const full = id.startsWith("P4.3-") ? id : `P4.3-${id}`;
  results.set(full, { ok, expected, actual: actual.slice(0, 1400) });
  const title = CHECKS.find(([i]) => i === full)?.[2] ?? "";
  console.log(`  ${ok ? "✅" : "❌"} [${full}] ${title.slice(0, 120)}${ok ? ` — ${actual.slice(0, 300)}` : `\n       expected: ${expected}\n       actual:   ${actual.slice(0, 1400)}`}`);
}
const rd = (p: string): string => {
  try {
    return readFileSync(join(ROOT, p), "utf8");
  } catch {
    return "";
  }
};
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const code = (p: string) => stripComments(rd(p));
const joinP = (p: string[]) => (p.length ? p.join(" · ") : "ครบ");
/** ไฟล์ .ts/.tsx ทั้งหมดใต้ dir (relative ROOT) */
function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const go = (d: string) => {
    for (const n of readdirSync(d)) {
      const f = join(d, n);
      const st = statSync(f);
      if (st.isDirectory()) {
        if (n !== "node_modules" && !n.startsWith(".")) go(f);
      } else if (/\.(ts|tsx|mts)$/.test(n)) out.push(relative(ROOT, f));
    }
  };
  go(abs);
  return out.sort();
}

// ═════════════════════════ ไฟล์ของ surface ═════════════════════════
const POS_APP = "src/app/app/sys/[id]/pos";
const F = {
  proxy: "src/proxy.ts",
  scanCam: "src/components/pos/register/ScanCameraDialog.tsx",
  salesPage: `${POS_APP}/sales/page.tsx`,
  bills: `${POS_APP}/sales/BillsClient.tsx`,
  receiptSettings: `${POS_APP}/settings/ReceiptSettings.tsx`,
  settingsPage: `${POS_APP}/settings/page.tsx`,
  receiptSettingsActions: "src/lib/modules/pos/receipt-settings-actions.ts",
  registry: "scripts/pos-ui-inventory.json",
  tableQr: "src/components/pos/tables/TableQr.tsx",
  settingsOverview: "src/lib/modules/pos/settings-overview.ts",
  staffSettings: `${POS_APP}/settings/StaffSettings.tsx`,
  staffHrCards: `${POS_APP}/settings/StaffHrCards.tsx`,
  settingsActions: "src/lib/modules/pos/settings-actions.ts",
  lockScreen: "src/components/pos/register/LockScreen.tsx",
  reportsDir: `${POS_APP}/reports`,
} as const;
/** ทรีจอของ S7 (ข้อ F-P3-21 · CD-P38U-9) */
const S7_TREES: Record<string, string[]> = {
  register: ["src/components/pos/register", `${POS_APP}/register`],
  orders: ["src/components/pos/orders", `${POS_APP}/orders`],
  bills: [`${POS_APP}/sales`],
};
/** จอ POS ที่ห้ามมีชิป '#0' (S8) */
const S8_DIRS = [POS_APP, "src/components/pos"];

// ═════════════════════════ ตัวตัดสินแบบ pure (ใช้ทั้งข้อจริงและ probe N*) ═════════════════════════
/** S1 — ค่า Permissions-Policy ทุกจุด (โค้ดไม่มีคอมเมนต์) · ไฟล์สแกนกล้องยังเรียก getUserMedia */
function judgeS1(sources: { file: string; code: string }[], scanCode: string): string[] {
  const p: string[] = [];
  const vals: { file: string; v: string }[] = [];
  for (const s of sources) for (const m of s.code.matchAll(/["'`]Permissions-Policy["'`]\s*,\s*["'`]([^"'`]*)["'`]/g)) vals.push({ file: s.file, v: m[1]! });
  if (!vals.length) p.push("ไม่พบ Permissions-Policy ใน src");
  for (const { file, v } of vals) {
    const dir: Record<string, string> = {};
    for (const part of v.split(",")) {
      const m = /^\s*([a-z-]+)\s*=\s*(.*?)\s*$/.exec(part);
      if (m) dir[m[1]!] = m[2]!.replace(/\s+/g, " ");
    }
    if (dir.camera !== "(self)") p.push(`${file}: camera=${dir.camera ?? "ไม่ระบุ"} (คาด (self))`);
    if (dir.microphone !== "()") p.push(`${file}: microphone=${dir.microphone ?? "ไม่ระบุ"} (คาด ())`);
    if (dir.geolocation !== "()") p.push(`${file}: geolocation=${dir.geolocation ?? "ไม่ระบุ"} (คาด ())`);
  }
  if (!/getUserMedia\s*\(\s*\{[^}]*video/.test(scanCode)) p.push("ScanCameraDialog ไม่เรียก getUserMedia({video}) แล้ว (นโยบายกล้องไม่มีผล — แจ้งผู้คุม)");
  return p;
}

/** ข้อความของ element JSX <Tag … /> ตัวแรก (ถึง "/>" ที่ปิดบรรทัด) */
function jsxElement(src: string, tag: string): string {
  const i = src.indexOf(`<${tag}`);
  if (i < 0) return "";
  const rest = src.slice(i);
  const m = /\n\s*\/>|\/>\s*\n/.exec(rest);
  return m ? rest.slice(0, m.index + m[0].length) : rest.slice(0, 4000);
}
type RegRow = { page?: string; testid?: string; roles?: string[]; hiddenFor?: string[] };
/** S2 — ธงสิทธิ์บัญชี (หน้า /sales → BillsClient) · เงื่อนไขรอบลิงก์ตั้งค่า + ตัวตัดสินฝั่งข้อมูล · แถวทะเบียน */
function judgeS2(i: { salesPage: string; bills: string; receiptSettings: string; settingsData: string; rows: RegRow[] }): string[] {
  const p: string[] = [];
  // (A) หน้า /sales: ค่า/ธงที่ส่งให้ BillsClient มาจาก account.doc.view
  const el = jsxElement(i.salesPage, "BillsClient");
  if (!el) p.push("sales/page.tsx ไม่มี <BillsClient");
  else {
    const flags = [...i.salesPage.matchAll(/const\s+(\w+)\s*=\s*([^;]*?account\.doc\.view[^;]*);/gs)].map((m) => m[1]!);
    const refFlag = (s: string) => s.includes("account.doc.view") || flags.some((f) => new RegExp(`\\b${f}\\b`).test(s));
    const acc = /accountSystemId=\{([^}]*)\}/.exec(el)?.[1] ?? "";
    if (refFlag(acc)) {
      /* ทาง 1: ส่ง accountSystemId เฉพาะผู้มีสิทธิ์ */
    } else {
      const props = [...el.matchAll(/(\w+)=\{([^{}]*)\}/g)].filter((m) => refFlag(m[2]!)).map((m) => m[1]!);
      const at = i.bills.indexOf('data-testid="pos-bills-accounting-link"');
      const near = at < 0 ? "" : i.bills.slice(Math.max(0, at - 700), at);
      if (!props.length) p.push(`sales/page.tsx ส่ง accountSystemId={${acc.trim() || "?"}} ให้ BillsClient โดยไม่มีธงจาก account.doc.view`);
      else if (!props.some((x) => new RegExp(`\\b${x}\\b`).test(near))) p.push(`BillsClient ไม่ใช้ธง ${props.join("/")} ที่เงื่อนไขของ pos-bills-accounting-link`);
    }
  }
  // (B) ลิงก์ตั้งค่าบัญชี: อยู่ใต้เงื่อนไข + ข้อมูลตัดสินจาก account.settings.manage
  const at = i.receiptSettings.indexOf('data-testid="pos-settings-account-link"');
  if (at < 0) p.push("ReceiptSettings ไม่มี pos-settings-account-link");
  else {
    const open = i.receiptSettings.lastIndexOf("<Link", at);
    const before = open < 0 ? "" : i.receiptSettings.slice(Math.max(0, open - 240), open);
    if (!/(&&|\?)\s*\(?\s*$/.test(before)) p.push("ReceiptSettings: pos-settings-account-link ไม่อยู่ใต้เงื่อนไขสิทธิ์ (แสดงทุกคนที่เห็นสมุด)");
  }
  if (!i.settingsData.includes("account.settings.manage")) p.push("settings/page.tsx · receipt-settings-actions.ts ไม่ตัดสิน account.settings.manage");
  // (C) ทะเบียน
  for (const t of ["pos-bills-accounting-link", "pos-settings-account-link"]) {
    const r = i.rows.find((x) => x.testid === t);
    if (!r) p.push(`ทะเบียนไม่มีแถว ${t}`);
    else if (!(r.hiddenFor ?? []).includes("cashier") || (r.roles ?? []).includes("cashier")) p.push(`ทะเบียน ${t}: roles [${(r.roles ?? []).join(",")}] hiddenFor [${(r.hiddenFor ?? []).join(",")}] (คาด roles [owner,manager] hiddenFor [cashier])`);
  }
  return p;
}

/** ตัวฟังก์ชันในไฟล์ (const NAME = … / function NAME) — ประมาณถึงบรรทัดว่าง/ประกาศถัดไป */
function localFn(src: string, name: string): string {
  const m = new RegExp(`(?:const|let)\\s+${name}\\s*=|function\\s+${name}\\s*\\(`).exec(src);
  if (!m) return "";
  const rest = src.slice(m.index);
  const end = rest.slice(1).search(/\n\s*(?:const|let|function|return|export)\s/);
  return end < 0 ? rest.slice(0, 2000) : rest.slice(0, end + 1);
}
/** S5 — ตัวจัดการกดของปุ่ม testid เรียก window.print อย่างเดียว */
function judgeS5(src: string, testid: string): string[] {
  const at = src.indexOf(`data-testid="${testid}"`);
  if (at < 0) return [`ไม่พบปุ่ม ${testid}`];
  const s = src.lastIndexOf("<", at);
  const tag = src.slice(s, at + 1200);
  const m = /onClick=\{([\s\S]*?)\}\s*(?:>|\w+=)/.exec(tag);
  if (!m) return [`${testid} ไม่มี onClick`];
  let body = m[1]!.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(body)) body = localFn(src, body) || `ไม่พบฟังก์ชัน ${body}`;
  const p: string[] = [];
  if (!/window\.print\s*\(/.test(body)) p.push(`ไม่เรียก window.print (${body.replace(/\s+/g, " ").slice(0, 80)})`);
  const bad = [/\bfetch\s*\(/, /\w+Action\s*\(/, /\bawait\b/, /\.then\s*\(/, /sendBeacon/, /XMLHttpRequest/, /router\.(push|replace|refresh)/].filter((r) => r.test(body)).map((r) => r.source);
  if (bad.length) p.push(`ตัวจัดการทำอย่างอื่นด้วย: ${bad.join(", ")}`);
  return p;
}

/** S6 — F-P3-17 (fromHr) · F-P3-18 (posCommissionCatalogAction) · F-P3-19 (overrideTtlMin + overrideBody) */
function judgeS6(i: { overview: string; staffSettings: string; hrCards: string; settingsActions: string; lock: string }): string[] {
  const p: string[] = [];
  const ovBody = (() => {
    const at = i.overview.indexOf("function posStaffOverview");
    return at < 0 ? "" : i.overview.slice(at, at + 4000);
  })();
  if (!/\bfromHr\b/.test(ovBody)) p.push("F-P3-17: posStaffOverview ไม่คืน fromHr รายคน (settings-overview.ts:127 hr:false)");
  if (!/\bfromHr\b/.test(i.staffSettings)) p.push("F-P3-17: StaffSettings.tsx ไม่แสดงป้าย 'จาก HR' จาก fromHr");
  if (!/export\s+async\s+function\s+posCommissionCatalogAction\b/.test(i.settingsActions)) p.push("F-P3-18: settings-actions.ts ไม่มี posCommissionCatalogAction");
  if (/\bregisterCatalogAction\b/.test(i.hrCards)) p.push("F-P3-18: StaffHrCards.tsx ยังอ่านแคตตาล็อกจาก registerCatalogAction (ต้องมีสิทธิ์ขาย)");
  if (!/\bposCommissionCatalogAction\b/.test(i.hrCards)) p.push("F-P3-18: StaffHrCards.tsx ไม่ใช้ posCommissionCatalogAction");
  if (!/overrideBody["'`]\s*,\s*\{[^}]*\bminutes\b/.test(i.lock)) p.push("F-P3-19: LockScreen ไม่แสดง lock.schedule.overrideBody {minutes}");
  if (!/\boverrideTtlMin\b/.test(i.lock)) p.push("F-P3-19: LockScreen ไม่รู้ overrideTtlMin (ไม่มีในข้อมูลจากเซิร์ฟเวอร์)");
  return p;
}

/** S7 — ตัวอ่านการ์ดที่รับกุญแจ 86/คืนเงิน + ทรีจอใช้ */
const KEY86 = /["'`]pos-86:|posBoardKeys\.soldOut/;
const KEYREF = /["'`]pos-refund:|posBoardKeys\.refund/;
function judgeS7(actionFiles: { file: string; code: string }[], trees: Record<string, { file: string; code: string }[]>): string[] {
  const p: string[] = [];
  const readers = actionFiles.filter((f) => /["']use server["']/.test(f.code) && /\bposCardsForKeys\b/.test(f.code) && KEY86.test(f.code) && KEYREF.test(f.code));
  const names = readers.flatMap((f) => [...f.code.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]!));
  if (!readers.length) p.push("ไม่มีตัวอ่านการ์ด (\"use server\" + posCardsForKeys) ที่รับกุญแจ pos-86: และ pos-refund: — pos-board-ui-actions.ts:45 รับเฉพาะ pos-anomaly:");
  for (const [tree, files] of Object.entries(trees)) {
    const uses = files.some((f) => names.some((n) => new RegExp(`import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from`).test(f.code)) || (/\bposCardsForKeys\b/.test(f.code) && (KEY86.test(f.code) || KEYREF.test(f.code))));
    if (!uses) p.push(`จอ ${tree} ไม่อ่านการ์ดบอร์ด 86/คืนเงิน (ไม่มีลิงก์ไปการ์ด)`);
  }
  return p;
}

/** S8 — '#0' เมื่อ cardNo null */
function judgeS8(files: { file: string; code: string }[]): string[] {
  const p: string[] = [];
  for (const f of files) {
    const lines = f.code.split("\n");
    lines.forEach((l, n) => {
      if (/cardNo\s*(\?\?|\|\|)\s*0\b/.test(l)) p.push(`${f.file.split("/").slice(-2).join("/")}:${n + 1}`);
    });
  }
  return p.length ? [`cardNo ?? 0 → "#0": ${p.join(", ")}`] : [];
}

// ── D judges ──
type Outcome = { kind: "ok" | "refused" | "redirect" | "throw" | "timeout" | "missing" | "response"; code: string; text: string; status?: number; ctype?: string; location?: string };
type D2In = {
  ownerAll: { r: Any; stored: string[] | null };
  mgrCreate: { r: Any; stored: string[] | null };
  mgrToggle: { r: Any; active: boolean | null; stored: string[] | null; on: string };
  mgrArchive: { r: Any; archived: boolean; on: string };
  mgrWiden: Any[];
  mgrOverOwner: { r: Any; same: boolean };
  a1: string;
};
const sameSet = (a: string[] | null, b: string[]) => !!a && a.length === b.length && b.every((x) => a.includes(x));
const okR = (r: Any) => !!r && r.ok === true;
const codeR = (r: Any) => (r ? (r.ok === true ? "ok" : String(r.code ?? r.kind ?? "?")) : "-");
function judgeD2(x: D2In): string[] {
  const p: string[] = [];
  if (!okR(x.ownerAll.r) || !sameSet(x.ownerAll.stored, [])) p.push(`OWNER [] → ${codeR(x.ownerAll.r)} เก็บ ${JSON.stringify(x.ownerAll.stored)} (คาด ok เก็บ [])`);
  if (!okR(x.mgrCreate.r)) p.push(`MANAGER[A1] สร้าง unitIds [] → ${codeR(x.mgrCreate.r)} (คาด ok — B7)`);
  else if (!sameSet(x.mgrCreate.stored, [x.a1])) p.push(`MANAGER[A1] สร้าง [] → เก็บ ${JSON.stringify(x.mgrCreate.stored)} (คาด [A1] พอดี — [] = ทุกสาขา = ขยายสิทธิ์)`);
  if (!okR(x.mgrToggle.r) || x.mgrToggle.active !== false || (x.mgrToggle.stored && x.mgrToggle.stored.length !== 1)) p.push(`MANAGER สลับปิด (${x.mgrToggle.on}) → ${codeR(x.mgrToggle.r)} active ${x.mgrToggle.active} เก็บ ${JSON.stringify(x.mgrToggle.stored)}`);
  if (!okR(x.mgrArchive.r) || !x.mgrArchive.archived) p.push(`MANAGER เก็บถาวร (${x.mgrArchive.on}) → ${codeR(x.mgrArchive.r)} archived ${x.mgrArchive.archived}`);
  x.mgrWiden.forEach((r, n) => {
    if (okR(r) || String(r?.code ?? "") !== "PERMISSION_DENIED") p.push(`MANAGER[A1] ขยาย ${n === 0 ? "[A2]" : "[A1,A2]"} → ${codeR(r)} (คาด PERMISSION_DENIED)`);
  });
  if (okR(x.mgrOverOwner.r) || !x.mgrOverOwner.same) p.push(`MANAGER สลับกติกาทุกสาขาของ OWNER → ${codeR(x.mgrOverOwner.r)} แถวเดิม ${x.mgrOverOwner.same} (คาด ปฏิเสธ + แถวไม่เปลี่ยน)`);
  return p;
}
function judgeD3(r: Any, before: number, after: number, changed: boolean): string[] {
  const p: string[] = [];
  if (!okR(r)) p.push(`setPosChatSettings → ${codeR(r)}`);
  if (!changed) p.push("settings.pos.chat ไม่เปลี่ยน");
  if (!(after > before)) p.push(`AppSystem.updatedAt ไม่ขยับ (${new Date(before).toISOString()} → ${new Date(after).toISOString()})`);
  return p;
}
function judgeD4(due: string, surf: Record<string, Any>): string[] {
  const p: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}/.test(due)) return [`fixture: PosSale.creditTerms.dueDate = ${JSON.stringify(due)} (บิลวางบิลไม่ได้เกิด)`];
  for (const [name, obj] of Object.entries(surf)) {
    const v = obj?.creditTerms?.dueDate;
    if (v !== due) p.push(`${name}.creditTerms.dueDate = ${v === undefined ? "ไม่มี" : JSON.stringify(v)} (คาด ${due})`);
  }
  return p;
}
const isForbidden = (o: Outcome) => o.kind === "throw" && (/Forbidden/.test(o.code) || /ไม่มีสิทธิ์|HTTP_ERROR_FALLBACK;403/.test(o.text));
function judgeD1(x: { cashier: Record<string, Outcome>; owner: Record<string, Outcome> }): string[] {
  const p: string[] = [];
  for (const [k, o] of Object.entries(x.cashier)) if (!isForbidden(o)) p.push(`CASHIER ${k} → ${o.kind}/${o.code} ${o.text.slice(0, 60)} (คาด ForbiddenError)`);
  for (const [k, o] of Object.entries(x.owner)) if (o.kind !== "ok") p.push(`OWNER ${k} → ${o.kind}/${o.code} ${o.text.slice(0, 60)} (ตัวควบคุมบวก คาด ok)`);
  return p;
}
function judgeD6(route: string, x: { anon: Outcome; staff: Outcome; owner: Outcome; body: string }): string[] {
  if (!route) return ["ไม่มี route.ts ใต้ src/app/app/sys/[id]/pos/reports/** (route พิมพ์ text/html ยังไม่มี — หน้าพิมพ์ยังเป็น PrintFrame)"];
  const p: string[] = [];
  const a = x.anon;
  const anonOk = (a.kind === "response" && (a.status === 401 || (a.status! >= 300 && a.status! < 400 && /\/login/.test(a.location ?? "")))) || (a.kind === "redirect" && /\/login/.test(a.text));
  if (!anonOk) p.push(`ANON → ${a.kind}/${a.status ?? a.code} ${a.location ?? a.text.slice(0, 50)} (คาด 401 หรือไป /login)`);
  if (!(x.staff.kind === "response" && x.staff.status === 403)) p.push(`STAFF ไม่มี pos.report.view → ${x.staff.kind}/${x.staff.status ?? x.staff.code} (คาด 403)`);
  const o = x.owner;
  if (!(o.kind === "response" && o.status === 200 && /^text\/html/i.test(o.ctype ?? ""))) p.push(`OWNER → ${o.kind}/${o.status ?? o.code} ${o.ctype ?? ""} (คาด 200 text/html)`);
  else if (!/<html/i.test(x.body) || !/print\s*\(/.test(x.body)) p.push(`OWNER เนื้อหาไม่ใช่เอกสารพิมพ์ (<html ${/<html/i.test(x.body)} · print( ${/print\s*\(/.test(x.body)})`);
  return p;
}
function judgeD5(x: { cashierFromHr: unknown; ownerFromHr: unknown; overview: Any; payroll: Any; payrollText: string; ids: Record<string, string>; noperm: Any; owner: Any; list: Any; ttl: number }): string[] {
  const p: string[] = [];
  if (!okR(x.overview)) p.push(`posStaffOverview → ${codeR(x.overview)}`);
  else if (x.cashierFromHr !== true || x.ownerFromHr !== false) p.push(`F-P3-17 fromHr: ผูก HR (CASHIER) = ${JSON.stringify(x.cashierFromHr)} · ไม่ผูก (OWNER) = ${JSON.stringify(x.ownerFromHr)} (คาด true/false)`);
  if (!okR(x.payroll)) p.push(`F-P3-18 posCommissionCatalogAction (ผู้ดูเงินเดือน) → ${codeR(x.payroll)}`);
  else {
    const miss = Object.entries(x.ids).filter(([, id]) => !x.payrollText.includes(id)).map(([k]) => k);
    if (miss.length) p.push(`F-P3-18 ผลไม่มี ${miss.join(", ")}`);
  }
  if (okR(x.noperm)) p.push("F-P3-18 NOPERM ได้แคตตาล็อก (คาด ปฏิเสธ)");
  if (!okR(x.owner)) p.push(`F-P3-18 OWNER → ${codeR(x.owner)} (ตัวควบคุมบวก)`);
  if (!okR(x.list)) p.push(`F-P3-19 listStaffForDevice → ${codeR(x.list)}`);
  else if (x.list.overrideTtlMin !== x.ttl) p.push(`F-P3-19 listStaffForDevice.overrideTtlMin = ${JSON.stringify(x.list.overrideTtlMin)} (คาด ${x.ttl})`);
  return p;
}

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
function step(id: string, f: () => void): void {
  try {
    f();
  } catch (e) {
    chk(id, false, "ไม่โยน", `💥 ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
}
function runStatic(): void {
  console.log("\n── S ข้อสถิต ──");
  step("S1", () => {
    const srcs = walk("src").map((f) => ({ file: f, code: code(f) })).filter((s) => s.code.includes("Permissions-Policy"));
    const p = judgeS1(srcs, code(F.scanCam));
    chk("S1", p.length === 0, "camera=(self) · microphone=() · geolocation=() ทุกจุด · getUserMedia ยังใช้", joinP(p));
  });
  step("S2", () => {
    let rows: RegRow[] = [];
    try {
      rows = (JSON.parse(rd(F.registry)) as { rows: RegRow[] }).rows ?? [];
    } catch {
      rows = [];
    }
    const p = judgeS2({ salesPage: code(F.salesPage), bills: code(F.bills), receiptSettings: code(F.receiptSettings), settingsData: code(F.settingsPage) + code(F.receiptSettingsActions), rows });
    chk("S2", p.length === 0, "ธง account.doc.view → BillsClient · ลิงก์ตั้งค่าอยู่ใต้เงื่อนไข account.settings.manage · ทะเบียน hiddenFor cashier", joinP(p));
  });
  step("S5", () => {
    const p = judgeS5(code(F.tableQr), "pos-tbl-qr-sheet-print");
    chk("S5", p.length === 0, "onClick = window.print() อย่างเดียว", p.length ? p.join(" · ") : "onClick = () => window.print() (ไม่มีคำขอ/การเขียน)");
  });
  step("S6", () => {
    const p = judgeS6({ overview: code(F.settingsOverview), staffSettings: code(F.staffSettings), hrCards: code(F.staffHrCards), settingsActions: code(F.settingsActions), lock: code(F.lockScreen) });
    chk("S6", p.length === 0, "fromHr · posCommissionCatalogAction · overrideTtlMin + overrideBody", joinP(p));
  });
  step("S7", () => {
    const actionFiles = walk("src/lib").filter((f) => /actions?\.ts$/.test(f) || /-actions\.ts$/.test(f)).map((f) => ({ file: f, code: code(f) }));
    const trees = Object.fromEntries(Object.entries(S7_TREES).map(([k, dirs]) => [k, dirs.flatMap(walk).map((f) => ({ file: f, code: code(f) }))]));
    const p = judgeS7(actionFiles, trees);
    chk("S7", p.length === 0, "ตัวอ่านรับ pos-86:/pos-refund: · จอ register/orders/bills ใช้", joinP(p));
  });
  step("S8", () => {
    const files = [...new Set(S8_DIRS.flatMap(walk))].filter((f) => f.endsWith(".tsx")).map((f) => ({ file: f, code: rd(f) })); // ดิบ (เลขบรรทัดตรงไฟล์)
    const p = judgeS8(files);
    chk("S8", p.length === 0, "ไม่มี cardNo ?? 0 ในจอ POS", p.length ? p.join(" · ") : `ไม่มี (${files.length} ไฟล์)`);
  });
  runProbes();
}

/** probe กลับค่า N1–N10 — ตัวตัดสิน pure ต้องแดงได้จริง (--self-test รันเฉพาะส่วนนี้) */
function runProbes(): void {
  console.log("\n── N probe กลับค่า ──");
  step("N1", () => {
    const scan = "stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });";
    const pol = (v: string) => [{ file: "src/proxy.ts", code: `res.headers.set("Permissions-Policy", "${v}");` }];
    const a = judgeS1(pol("camera=(), microphone=(), geolocation=()"), scan).length > 0;
    const b = judgeS1(pol("camera=(self), microphone=(), geolocation=()"), scan).length === 0;
    const c = judgeS1(pol("camera=*, microphone=(), geolocation=()"), scan).length > 0;
    const d = judgeS1(pol("camera=(self), microphone=(self), geolocation=()"), scan).length > 0;
    const e = judgeS1([...pol("camera=(self), microphone=(), geolocation=()"), ...pol("camera=(), microphone=(), geolocation=()")], scan).length > 0;
    chk("N1", a && b && c && d && e, "ปัจจุบัน/*/ไมค์เปิด/จุดที่สองยังปิด แดง · (self) เขียว", `ปัจจุบัน→${a} (self)→${b} *→${c} ไมค์→${d} สองจุด→${e}`);
  });
  step("N2", () => {
    const bills = `{accountSystemId ? (\n<Link data-testid="pos-bills-accounting-link" href="x">`;
    const rowsBad: RegRow[] = [{ testid: "pos-bills-accounting-link", roles: ["owner", "manager", "cashier"], hiddenFor: [] }, { testid: "pos-settings-account-link", roles: ["owner", "manager", "cashier"], hiddenFor: [] }];
    const rowsOk: RegRow[] = [{ testid: "pos-bills-accounting-link", roles: ["owner", "manager"], hiddenFor: ["cashier"] }, { testid: "pos-settings-account-link", roles: ["owner", "manager"], hiddenFor: ["cashier"] }];
    const rsBad = `<div>\n  )}\n  <Link\n data-testid="pos-settings-account-link" href="y">`;
    const rsOk = `<div>\n  )}\n  {book.canOpenAccount && (\n  <Link\n data-testid="pos-settings-account-link" href="y">`;
    const pageBad = `const accountSystemId = await x();\n<BillsClient\n  accountSystemId={accountSystemId}\n/>\n`;
    const pageOk = `const canAcc = accountCan(auth, "account.doc.view");\n<BillsClient\n  accountSystemId={canAcc ? accountSystemId : null}\n/>\n`;
    const pageFlag = `const canAcc = accountCan(auth, "account.doc.view");\n<BillsClient\n  accountSystemId={accountSystemId}\n  canOpenAccounting={canAcc}\n/>\n`;
    const billsFlag = `{accountSystemId && canOpenAccounting ? (\n<Link data-testid="pos-bills-accounting-link" href="x">`;
    const data = `assertAccountCan(auth, "account.settings.manage")`;
    const tip = judgeS2({ salesPage: pageBad, bills, receiptSettings: rsBad, settingsData: "", rows: rowsBad }).length >= 4;
    const good = judgeS2({ salesPage: pageOk, bills, receiptSettings: rsOk, settingsData: data, rows: rowsOk }).length === 0;
    const flagOk = judgeS2({ salesPage: pageFlag, bills: billsFlag, receiptSettings: rsOk, settingsData: data, rows: rowsOk }).length === 0;
    const flagUnused = judgeS2({ salesPage: pageFlag, bills, receiptSettings: rsOk, settingsData: data, rows: rowsOk }).length === 1;
    const rowOnly = judgeS2({ salesPage: pageOk, bills, receiptSettings: rsOk, settingsData: data, rows: rowsBad }).length === 2;
    chk("N2", tip && good && flagOk && flagUnused && rowOnly, "ฐาน แดง ≥4 · ทาง 1/ทาง 2 เขียว · ธงไม่ถูกใช้ แดง · แถวทะเบียน แดง", `ฐาน→${tip} ทาง1→${good} ทาง2→${flagOk} ธงไม่ใช้→${flagUnused} แถว→${rowOnly}`);
  });
  step("N3", () => {
    const t = (h: string) => `<button data-testid="pos-tbl-qr-sheet-print" type="button" onClick={${h}}>\n`;
    const a = judgeS5(t("() => window.print()"), "pos-tbl-qr-sheet-print").length === 0;
    const b = judgeS5(t('() => { void fetch("/x"); window.print(); }'), "pos-tbl-qr-sheet-print").length > 0;
    const c = judgeS5(`const doPrint = async () => { await logPrintAction(); window.print(); };\n${t("doPrint")}`, "pos-tbl-qr-sheet-print").length > 0;
    const d = judgeS5(`const doPrint = () => window.print();\n${t("doPrint")}`, "pos-tbl-qr-sheet-print").length === 0;
    const e = judgeS5(t("() => setOpen(false)"), "pos-tbl-qr-sheet-print").length > 0;
    chk("N3", a && b && c && d && e, "print อย่างเดียว เขียว · fetch/Action+await แดง · ชื่อฟังก์ชันตามไปอ่าน · ไม่ print แดง", `print→${a} fetch→${b} action→${c} ชื่อ→${d} ไม่print→${e}`);
  });
  step("N4", () => {
    const ok = {
      overview: "export async function posStaffOverview(ctx) { const items = list.items.map((x) => ({ ...x, fromHr: linked.has(x.userId) })); }",
      staffSettings: "{s.fromHr ? <span>{t('fromHr')}</span> : null}",
      hrCards: 'import { posCommissionCatalogAction } from "@/lib/modules/pos/settings-actions";',
      settingsActions: "export async function posCommissionCatalogAction(args) {}",
      lock: 'const ttl = list.overrideTtlMin; t("lock.schedule.overrideBody", { minutes: ttl })',
    };
    const good = judgeS6(ok).length === 0;
    const tip = judgeS6({ ...ok, overview: "export async function posStaffOverview(ctx) { listStaffForDevice(a, b, undefined, { hr: false }) }", staffSettings: "", hrCards: 'import { registerCatalogAction } from "x";', settingsActions: "", lock: "" }).length === 7;
    const one17 = judgeS6({ ...ok, staffSettings: "" }).length === 1;
    const one18 = judgeS6({ ...ok, hrCards: 'import { posCommissionCatalogAction, registerCatalogAction } from "x";' }).length === 1;
    const one19 = judgeS6({ ...ok, lock: 't("lock.schedule.overrideBody", { minutes: 240 })' }).length === 1;
    chk("N4", good && tip && one17 && one18 && one19, "ครบ เขียว · ฐาน แดง 7 · ขาดทีละส่วน แดง 1", `ครบ→${good} ฐาน→${tip} 17→${one17} 18→${one18} 19→${one19}`);
  });
  step("N5", () => {
    const anomalyOnly = [{ file: "src/lib/pos-board-ui-actions.ts", code: '"use server";\nimport { posCardsForKeys } from "./pos-board-bridges";\nconst ANOMALY_PREFIX = "pos-anomaly:";\nexport async function posBoardCardsAction() {}' }];
    const wide = [{ file: "src/lib/pos-board-ui-actions.ts", code: '"use server";\nimport { posCardsForKeys } from "./pos-board-bridges";\nconst P = ["pos-anomaly:", "pos-86:", "pos-refund:"];\nexport async function posBoardCardsAction() {}' }];
    const use = (n: string) => [{ file: "x.tsx", code: `import { ${n} } from "@/lib/pos-board-ui-actions";` }];
    const pageUse = [{ file: "page.tsx", code: "const cards = await posCardsForKeys(t, ids.map((o) => posBoardKeys.refund(o)));" }];
    const allTrees = { register: use("posBoardCardsAction"), orders: use("posBoardCardsAction"), bills: pageUse };
    const tip = judgeS7(anomalyOnly, { register: [], orders: [], bills: [] }).length === 4;
    const good = judgeS7(wide, allTrees).length === 0;
    const oneMissing = judgeS7(wide, { ...allTrees, orders: [] }).length === 1;
    const readerMissing = judgeS7(anomalyOnly, allTrees).length === 3;
    chk("N5", tip && good && oneMissing && readerMissing, "ฐาน แดง 4 · ครบ เขียว · ขาดทรี แดง 1 · reader แคบ แดง", `ฐาน→${tip} ครบ→${good} ขาดทรี→${oneMissing} reader→${readerMissing}`);
  });
  step("N6", () => {
    const bad = judgeS8([{ file: "a/ReportsClient.tsx", code: "t('chip', { n: have.cardNo ?? 0 })" }]).length === 1;
    const bad2 = judgeS8([{ file: "a/ShiftsClient.tsx", code: "t('boardCard', { n: bc.cardNo || 0 })" }]).length === 1;
    const good = judgeS8([{ file: "a/ReportsClient.tsx", code: "have.cardNo ? t('chip', { n: have.cardNo }) : t('chipNoNumber')" }]).length === 0;
    chk("N6", bad && bad2 && good, "?? 0 / || 0 แดง · มีเงื่อนไข เขียว", `??0→${bad} ||0→${bad2} เงื่อนไข→${good}`);
  });
  step("N7", () => {
    const A1 = "unitA1";
    const base: D2In = {
      ownerAll: { r: { ok: true }, stored: [] },
      mgrCreate: { r: { ok: true }, stored: [A1] },
      mgrToggle: { r: { ok: true }, active: false, stored: [A1], on: "กติกาของผู้จัดการ" },
      mgrArchive: { r: { ok: true }, archived: true, on: "กติกาของผู้จัดการ" },
      mgrWiden: [{ ok: false, code: "PERMISSION_DENIED" }, { ok: false, code: "PERMISSION_DENIED" }],
      mgrOverOwner: { r: { ok: false, code: "PERMISSION_DENIED" }, same: true },
      a1: A1,
    };
    const good = judgeD2(base).length === 0;
    const tip = judgeD2({ ...base, mgrCreate: { r: { ok: false, code: "PERMISSION_DENIED" }, stored: null } }).length === 1;
    const widened = judgeD2({ ...base, mgrCreate: { r: { ok: true }, stored: [] } }).length === 1;
    const overwrote = judgeD2({ ...base, mgrOverOwner: { r: { ok: true }, same: false } }).length === 1;
    const widenOk = judgeD2({ ...base, mgrWiden: [{ ok: true }, { ok: false, code: "PERMISSION_DENIED" }] }).length === 1;
    chk("N7", good && tip && widened && overwrote && widenOk, "ถูกต้อง เขียว · ฐาน/เก็บ []/ทับของเจ้าของ/ขยายได้ แดงทีละข้อ", `ถูก→${good} ฐาน→${tip} เก็บ[]→${widened} ทับ→${overwrote} ขยาย→${widenOk}`);
  });
  step("N8", () => {
    const t0 = Date.parse("2026-10-23T00:00:00Z");
    const d3same = judgeD3({ ok: true }, t0, t0, true).length === 1;
    const d3ok = judgeD3({ ok: true }, t0, t0 + 5, true).length === 0;
    const due = "2026-11-22";
    const all = { submit: { creditTerms: { dueDate: due } }, detail: { creditTerms: { dueDate: due, termDays: 30 } }, payload: { creditTerms: { dueDate: due } }, publicReceipt: { creditTerms: { dueDate: due } } };
    const d4ok = judgeD4(due, all).length === 0;
    const d4tip = judgeD4(due, { submit: { ok: true }, detail: {}, payload: {}, publicReceipt: {} }).length === 4;
    const d4wrong = judgeD4(due, { ...all, payload: { creditTerms: { dueDate: "2026-11-21" } } }).length === 1;
    const d4fx = judgeD4("", all).length === 1;
    chk("N8", d3same && d3ok && d4ok && d4tip && d4wrong && d4fx, "D3 เท่าเดิม แดง/ขยับ เขียว · D4 ครบ เขียว/ฐาน แดง 4/ค่าผิด แดง/fixture แดง", `D3 เท่า→${d3same} ขยับ→${d3ok} · D4 ครบ→${d4ok} ฐาน→${d4tip} ผิด→${d4wrong} fx→${d4fx}`);
  });
  step("N9", () => {
    const fb: Outcome = { kind: "throw", code: "ForbiddenError", text: "ไม่มีสิทธิ์: account.doc.view" };
    const ok: Outcome = { kind: "ok", code: "OK", text: "" };
    const d1good = judgeD1({ cashier: { print: fb, settings: fb }, owner: { print: ok, settings: ok } }).length === 0;
    const d1leak = judgeD1({ cashier: { print: ok, settings: fb }, owner: { print: ok, settings: ok } }).length === 1;
    const d1nf = judgeD1({ cashier: { print: { kind: "throw", code: "Error", text: "NEXT_HTTP_ERROR_FALLBACK;404" }, settings: fb }, owner: { print: ok, settings: ok } }).length === 1;
    const d1pos = judgeD1({ cashier: { print: fb, settings: fb }, owner: { print: fb, settings: ok } }).length === 1;
    const r = (status: number, ctype = "text/html; charset=utf-8", location = ""): Outcome => ({ kind: "response", code: String(status), text: "", status, ctype, location });
    const html = "<!doctype html><html><body><script>window.print()</script></body></html>";
    const d6good = judgeD6("x/route.ts", { anon: r(401), staff: r(403), owner: r(200), body: html }).length === 0;
    const d6redir = judgeD6("x/route.ts", { anon: { kind: "redirect", code: "redirect", text: "NEXT_REDIRECT;replace;/login;307;" }, staff: r(403), owner: r(200), body: html }).length === 0;
    const d6none = judgeD6("", { anon: r(401), staff: r(403), owner: r(200), body: html }).length === 1;
    const d6anon = judgeD6("x/route.ts", { anon: r(200), staff: r(403), owner: r(200), body: html }).length === 1;
    const d6staff = judgeD6("x/route.ts", { anon: r(401), staff: r(200), owner: r(200), body: html }).length === 1;
    const d6json = judgeD6("x/route.ts", { anon: r(401), staff: r(403), owner: r(200, "application/json"), body: "{}" }).length === 1;
    const d6noprint = judgeD6("x/route.ts", { anon: r(401), staff: r(403), owner: r(200), body: "<html></html>" }).length === 1;
    chk("N9", d1good && d1leak && d1nf && d1pos && d6good && d6redir && d6none && d6anon && d6staff && d6json && d6noprint, "D1/D6 ถูกต้อง เขียว · รั่ว/404/ตัวควบคุม/ไม่มี route/ANON 200/STAFF 200/json/ไม่มี print แดงทีละข้อ", `D1 ถูก→${d1good} รั่ว→${d1leak} 404→${d1nf} บวก→${d1pos} · D6 ถูก→${d6good} login→${d6redir} ไม่มี→${d6none} anon→${d6anon} staff→${d6staff} json→${d6json} print→${d6noprint}`);
  });
  step("N10", () => {
    const ids = { C1: "cat1", P1: "prod1", V1: "var1", P2: "prodA2" };
    const base = { cashierFromHr: true, ownerFromHr: false, overview: { ok: true }, payroll: { ok: true }, payrollText: JSON.stringify(Object.values(ids)), ids, noperm: { ok: false, code: "PERMISSION_DENIED" }, owner: { ok: true }, list: { ok: true, overrideTtlMin: 75 }, ttl: 75 };
    const good = judgeD5(base).length === 0;
    const tip = judgeD5({ ...base, cashierFromHr: undefined, ownerFromHr: undefined, payroll: { ok: false, code: "MISSING" }, owner: { ok: false, code: "MISSING" }, noperm: { ok: false, code: "MISSING" }, list: { ok: true } }).length === 4;
    const swapped = judgeD5({ ...base, cashierFromHr: false, ownerFromHr: true }).length === 1;
    const noVar = judgeD5({ ...base, payrollText: JSON.stringify(["cat1", "prod1", "prodA2"]) }).length === 1;
    const leak = judgeD5({ ...base, noperm: { ok: true } }).length === 1;
    chk("N10", good && tip && swapped && noVar && leak, "ครบ เขียว · ฐาน แดง 4 · สลับคน/ขาดตัวแปร/NOPERM ได้ แดง", `ครบ→${good} ฐาน→${tip} สลับ→${swapped} ตัวแปร→${noVar} NOPERM→${leak}`);
  });
}

if (SELFTEST) {
  try {
    runProbes();
  } catch (e) {
    console.log(`💥 self-test: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  for (const id of PROBE_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
  const weak = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--self-test) ===== ผ่าน ${results.size - weak.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "self-test", total: results.size, passed: results.size - weak.length, failed: weak, skipped: false })}`);
  process.exit(weak.length ? 1 : 0);
}
if (NODB) {
  try {
    runStatic();
  } catch (e) {
    console.log(`💥 static: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
  const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failed.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failed.length, failed, registered: CHECKS.length, pin: PIN, lanePin: LANE_PIN })}`);
  process.exit(failed.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mts" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const PQC = envMod.PQC as Any;
const QC_TIDS = (envMod.PQC_TENANT_IDS as string[]) ?? [];
{
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: เขียนได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}
let bgErrors = 0;
process.on("unhandledRejection", (e) => {
  bgErrors++;
  if (bgErrors <= 5) console.log(`  (unhandledRejection: ${String((e as Error)?.message ?? e).slice(0, 140)})`);
});

// ── Next request scope (เทคนิคเดียวกับ qc-pos-p5.2 / qc-hf-o23) ──
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
const nextServer = (await import("next/server" as string).catch(() => null)) as Any;

const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 160)})`);
    return null;
  }
};
const sysSvc = await tryImport("@/lib/modules/system/service");
const coreHash = await tryImport("@/lib/core/hash");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const accGuard = await tryImport("@/lib/modules/account/guard");
const catalogMod = await tryImport("@/lib/modules/pos/catalog");
const chatLink = await tryImport("@/lib/modules/pos/chat-link");
const creditMod = await tryImport("@/lib/modules/pos/credit");
const devMod = await tryImport("@/lib/modules/pos/device");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const regFacade = await tryImport("@/lib/modules/pos/register");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const receiptMod = await tryImport("@/lib/modules/pos/receipt");
const tokenMod = await tryImport("@/lib/modules/pos/receipt-token");
const pubReceipt = await tryImport("@/lib/modules/pos/public-receipt");
const hrSvc = await tryImport("@/lib/modules/hr/service");
const overviewMod = await tryImport("@/lib/modules/pos/settings-overview");
const settingsGeneral = await tryImport("@/lib/modules/pos/settings-general");
const staffPin = await tryImport("@/lib/modules/pos/staff-pin");

// ── ตัวกั้นเครือข่าย ──
const realFetch = globalThis.fetch;
const guardHits: string[] = [];
globalThis.fetch = (async (input: Any) => {
  let host = "?";
  try {
    host = new URL(typeof input === "string" ? input : String(input?.url ?? input)).host;
  } catch {
    /* ไม่ใช่ URL */
  }
  guardHits.push(host);
  return new Response(JSON.stringify({ error: "qc-network-blocked" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (v: unknown, n = 90) => {
  try {
    return (typeof v === "string" ? v : JSON.stringify(v) ?? "").replace(/\s+/g, " ").slice(0, n);
  } catch {
    return String(v).slice(0, n);
  }
};

// ═════════════════════════ 3. ลายนิ้วมือร้าน QC ═════════════════════════
const QC_FP_TABLES: [string, string][] = [["PosSale", "updatedAt"], ["PosSaleLine", "id"], ["PosPayment", "id"], ["PosOrder", "updatedAt"], ["PosProduct", "updatedAt"], ["SalesChannel", "updatedAt"], ["PosDevice", "updatedAt"], ["AppSystem", "updatedAt"], ["RestaurantTable", "updatedAt"], ["PosShift", "updatedAt"], ["AuditLog", "id"], ["PosPriceRule", "updatedAt"]];
async function fpQc(tids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of QC_FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h FROM "${tb}" x WHERE x."tenantId" = ANY($1::text[])`, tids)) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 10)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 24)}`;
    }
  }
  return out;
}
const fpDiff = (a: Record<string, string>, b: Record<string, string>) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).map((k) => `${k}:${a[k] ?? "∅"}→${b[k] ?? "∅"}`);

// ═════════════════════════ 4. ร้านชั่วคราว ═════════════════════════
const RAND = randomBytes(4).toString("hex");
const SLUG = `posqc-p43-${RAND}`;
let T = "";
const X: Record<string, string> = {}; // ids
type Persona = { key: string; userId: string; cookie: string; role: string; unitAccess: string[]; perms: Record<string, boolean> };
const PER: Record<string, Persona> = {};
const DAY = 86_400_000;
let fx = ""; // fixture ล้ม (ขั้นแรก)
const fxNote = (s: string) => (fx ? `fixture:${fx} · ${s}` : s);
async function fxStep(label: string, f: () => Promise<void>): Promise<boolean> {
  try {
    await f();
    return true;
  } catch (e) {
    const m = `${label}: ${(e as Error)?.message?.slice(0, 200) ?? e}`;
    if (!fx) fx = m;
    console.log(`  ⚠️  fixture ${m}`);
    return false;
  }
}
const must = (label: string, r: Any): Any => {
  if (!r || r.ok === false) throw new Error(`${label} → ${codeR(r)} ${short(r?.message ?? "", 100)}`);
  return r;
};
const actorOf = (k: string): Any => ({ userId: PER[k]?.userId ?? `none-${k}`, role: PER[k]?.role ?? "STAFF", unitAccess: [...(PER[k]?.unitAccess ?? [])], permissions: { ...(PER[k]?.perms ?? {}) } });
async function svc(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: "MISSING", message: `ไม่มี ${name}` };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: "THROW", message: `${(e as Error)?.name ?? "Error"}: ${(e as Error)?.message?.slice(0, 160)}` };
  }
}
async function mkUser(key: string, role: string, unitAccess: string[], perms: Record<string, boolean>): Promise<void> {
  const u = await P.user.create({ data: { email: `${SLUG}-${key.toLowerCase()}@qc.invalid`, name: `QC P4.3 ${key} ${RAND}` } });
  await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess, permissions: perms, acceptedAt: new Date() } });
  const token = coreHash.randomToken(32) as string;
  await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
  PER[key] = { key, userId: u.id, cookie: `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${T}`, role, unitAccess, perms };
}

const REDIRECT = (e: Any) => typeof e?.digest === "string" && e.digest.startsWith("NEXT_REDIRECT");
function outcomeOf(r: unknown): Outcome {
  let text = "";
  try {
    text = typeof r === "string" ? r : JSON.stringify(r) ?? "";
  } catch {
    text = String(r);
  }
  const o = r as Any;
  if (o && typeof o === "object" && !Array.isArray(o) && o.ok === false) return { kind: "refused", code: String(o.code ?? "NO_CODE"), text };
  return { kind: "ok", code: "OK", text };
}
function outcomeOfErr(e: unknown): Outcome {
  if (REDIRECT(e)) return { kind: "redirect", code: "redirect", text: String((e as Any).digest) };
  if ((e as Any)?.qcTimeout) return { kind: "timeout", code: "TIMEOUT", text: "" };
  const err = e as Any;
  return { kind: "throw", code: String(err?.name ?? "Error"), text: String(err?.digest ?? err?.message ?? e).slice(0, 200) };
}
/** เรียก fn ใน request scope ของ Next (คุกกี้ของ persona) */
async function inScope<T2>(cookie: string, pathname: string, fn: () => Promise<T2>, timeoutMs = 30_000): Promise<T2> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("ไม่มี Next request scope");
  const req = new Request(`http://qc.local${pathname}`, { headers: { ...(cookie ? { cookie } : {}), "user-agent": SUITE, "x-forwarded-for": "203.0.113.43" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  let timer: NodeJS.Timeout | undefined;
  try {
    return (await Promise.race([
      nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn)),
      new Promise((_, rej) => (timer = setTimeout(() => rej(Object.assign(new Error("TIMEOUT"), { qcTimeout: true })), timeoutMs))),
    ])) as T2;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const modCache = new Map<string, Any>();
async function modOf(file: string): Promise<Any> {
  if (!modCache.has(file)) modCache.set(file, await tryImport(join(ROOT, file)));
  return modCache.get(file);
}
/** server action ใน scope (คุกกี้ persona) → {o, r} */
async function callAct(file: string, name: string, persona: Persona | null, args: unknown[]): Promise<{ o: Outcome; r: Any }> {
  const mod = await modOf(file);
  const fn = mod?.[name];
  if (typeof fn !== "function") return { o: { kind: "missing", code: "MISSING", text: `${file}#${name}` }, r: { ok: false, code: "MISSING" } };
  try {
    const r = await inScope(persona?.cookie ?? "", `/app/sys/${X.POS}/pos`, async () => fn(...args));
    return { o: outcomeOf(r), r };
  } catch (e) {
    const o = outcomeOfErr(e);
    return { o, r: { ok: false, code: `${o.kind}:${o.code}`, message: o.text } };
  }
}
const bkkToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const ctxU = (unitId: string, deviceId?: string): Any => ({ tenantId: T, systemId: X.POS, unitId, ...(deviceId ? { deviceId } : {}) });
const patchPos = async (fn: (pos: Record<string, Any>) => void) => {
  const s0 = (await P.appSystem.findUnique({ where: { id: X.POS }, select: { settings: true } }))?.settings ?? {};
  const s = s0 && typeof s0 === "object" && !Array.isArray(s0) ? JSON.parse(JSON.stringify(s0)) : {};
  const pos = s.pos && typeof s.pos === "object" ? s.pos : {};
  fn(pos);
  await P.appSystem.update({ where: { id: X.POS }, data: { settings: { ...s, pos } } });
};

async function setup(): Promise<void> {
  await fxStep("ร้าน/สาขา/ระบบ", async () => {
    T = (await P.tenant.create({ data: { name: `QC P4.3 ${RAND}`, slug: SLUG } })).id;
    X.A1 = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `P43 สาขา A1 ${RAND}`, slug: `p43-a1-${RAND}` } })).id;
    X.A2 = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `P43 สาขา A2 ${RAND}`, slug: `p43-a2-${RAND}` } })).id;
    X.POS = (await sysSvc.createSystem(T, "POS", `POS P4.3 ${RAND}`)).id;
    await patchPos((pos) => {
      pos.registerV2 = true;
      pos.shift = { ...(pos.shift ?? {}), required: { register: false, otherSources: false } };
    });
    await sysSvc.linkUnit(T, X.POS, X.A1);
    await sysSvc.linkUnit(T, X.POS, X.A2);
  });
  if (fx) return;
  await fxStep("ผู้ใช้", async () => {
    await mkUser("OWNER", "OWNER", ["*"], {});
    await mkUser("MANAGER", "MANAGER", [X.A1!], {});
    await mkUser("CASHIER", "STAFF", [X.A1!], { ...(PQC.cashierPermissions as Record<string, boolean>) });
    await mkUser("PAYROLL", "STAFF", [X.A1!], { "hr.payroll.read": true });
    await mkUser("NOPERM", "STAFF", [X.A1!], {});
  });
  if (fx) return;
  await fxStep("สมุดบัญชี", async () => {
    X.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี P4.3 ${RAND}`)).id;
    await accSvc.saveSettings(T, X.ACC, { orgName: `ร้านคิวซี P4.3 ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true, defaultDueDays: 45 });
    await glMod.ensureAccounting({ tenantId: T, systemId: X.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: X.ACC, linkedKind: "POS", linkedId: X.POS } });
  });
  console.log(`  ร้าน ${SLUG} (${T}) · A1 ${X.A1} · A2 ${X.A2} · POS ${X.POS} · บัญชี ${X.ACC ?? "-"}${fx ? ` · ⚠️ ${fx}` : ""}`);
}

// ═════════════════════════ 5. ข้อ DB ═════════════════════════
async function runD1(): Promise<void> {
  const call = async (k: string, action: string): Promise<Outcome> => {
    if (typeof accGuard?.requireAccountPage !== "function") return { kind: "missing", code: "MISSING", text: "requireAccountPage" };
    try {
      await inScope(PER[k]?.cookie ?? "", `/app/sys/${X.ACC}/account`, () => accGuard.requireAccountPage(X.ACC, action));
      return { kind: "ok", code: "OK", text: "" };
    } catch (e) {
      return outcomeOfErr(e);
    }
  };
  const x = {
    cashier: { print: await call("CASHIER", "account.doc.view"), settings: await call("CASHIER", "account.settings.manage") },
    owner: { print: await call("OWNER", "account.doc.view"), settings: await call("OWNER", "account.settings.manage") },
  };
  const p = judgeD1(x);
  chk("D1", p.length === 0, "CASHIER ForbiddenError ทั้ง 2 ด่าน · OWNER ผ่าน", fxNote(p.length ? p.join(" · ") : `CASHIER print ${x.cashier.print.code} · settings ${x.cashier.settings.code} · OWNER ok ×2 (ระดับด่าน — หน้า RSC เรียกในโปรเซสไม่ได้ · CD-P43-O1)`));
}

async function runD2(): Promise<void> {
  let prod = "";
  await fxStep("D2 สินค้า", async () => {
    prod = String((await catalogMod.createProduct({ tenantId: T, systemId: X.POS, actorUserId: PER.OWNER!.userId }, { name: `P43 โปร ${RAND}`, basePriceSatang: 5000 }))?.id ?? "");
    if (!prod) throw new Error("createProduct ไม่คืน id");
  });
  const input = (unitIds: string[], name: string, extra: Record<string, unknown> = {}) => ({ name, kind: "HAPPY_HOUR", active: true, priority: 0, productIds: [prod], categoryIds: [], channelCodes: [], unitIds, adjust: "AMOUNT_OFF", valueSatang: 500, valueBp: null, startsAt: null, endsAt: null, weekdays: [], timeFrom: null, timeTo: null, ...extra });
  const ofItem = (r: Any, patch: Record<string, unknown>) => ({ id: r.id, name: r.name, kind: r.kind, active: r.active, priority: r.priority, productIds: r.productIds, categoryIds: r.categoryIds, channelCodes: r.channelCodes, unitIds: r.unitIds, adjust: r.adjust, valueSatang: r.valueSatang, valueBp: r.valueBp, startsAt: r.startsAt, endsAt: r.endsAt, weekdays: r.weekdays, timeFrom: r.timeFrom, timeTo: r.timeTo, ...patch });
  const FILE = "src/lib/modules/pos/price-rule-actions.ts";
  const save = (k: string, inp: Any) => callAct(FILE, "savePriceRuleAction", PER[k]!, [{ systemId: X.POS, unitId: X.A1, input: inp }]);
  const row = async (id: string | undefined) => (id ? await P.posPriceRule.findUnique({ where: { id } }).catch(() => null) : null);
  const ownerAll = await save("OWNER", input([], `P43 ทุกสาขา ${RAND}`));
  const ownerRow = await row(ownerAll.r?.rule?.id);
  const mgrCreate = await save("MANAGER", input([], `P43 ผู้จัดการ ${RAND}`));
  const mgrRow = await row(mgrCreate.r?.rule?.id);
  // กติกาที่ใช้สลับ/เก็บถาวร: ของผู้จัดการ (สร้างได้) · ฐานสร้างไม่ได้ ⇒ กติกา [A1] ที่ OWNER สร้าง (วัดสลับ/เก็บแยกจากการสร้าง)
  let target: Any = okR(mgrCreate.r) ? mgrCreate.r.rule : null;
  let on = "กติกาของผู้จัดการ";
  if (!target) {
    const fb = await save("OWNER", input([X.A1!], `P43 สำรอง A1 ${RAND}`));
    target = okR(fb.r) ? fb.r.rule : null;
    on = `กติกา [A1] ของ OWNER (ผู้จัดการสร้างไม่ได้ ${codeR(mgrCreate.r)})`;
  }
  const tog = target ? await save("MANAGER", ofItem(target, { active: false })) : { r: { ok: false, code: "NO_TARGET" } };
  const togRow = await row(target?.id);
  const arc = target ? await callAct(FILE, "archivePriceRuleAction", PER.MANAGER!, [{ systemId: X.POS, unitId: X.A1, id: target.id }]) : { r: { ok: false, code: "NO_TARGET" } };
  const arcRow = await row(target?.id);
  const w1 = await save("MANAGER", input([X.A2!], `P43 ขยาย A2 ${RAND}`));
  const w2 = await save("MANAGER", input([X.A1!, X.A2!], `P43 ขยาย A1A2 ${RAND}`));
  const beforeOwner = JSON.stringify(ownerRow ? { a: ownerRow.active, u: ownerRow.unitIds, z: ownerRow.archivedAt } : null);
  const over = ownerAll.r?.rule ? await save("MANAGER", ofItem(ownerAll.r.rule, { active: false })) : { r: { ok: false, code: "NO_OWNER_RULE" } };
  const afterRow = await row(ownerAll.r?.rule?.id);
  const afterOwner = JSON.stringify(afterRow ? { a: afterRow.active, u: afterRow.unitIds, z: afterRow.archivedAt } : null);
  const x: D2In = {
    ownerAll: { r: ownerAll.r, stored: ownerRow ? (ownerRow.unitIds as string[]) : null },
    mgrCreate: { r: mgrCreate.r, stored: mgrRow ? (mgrRow.unitIds as string[]) : null },
    mgrToggle: { r: tog.r, active: togRow ? Boolean(togRow.active) : null, stored: togRow ? (togRow.unitIds as string[]) : null, on },
    mgrArchive: { r: arc.r, archived: !!arcRow?.archivedAt, on },
    mgrWiden: [w1.r, w2.r],
    mgrOverOwner: { r: over.r, same: beforeOwner === afterOwner && beforeOwner !== "null" },
    a1: X.A1!,
  };
  const p = judgeD2(x);
  chk("D2", p.length === 0, "MANAGER [] → ok เก็บ [A1] · สลับ/เก็บ ok · ขยาย/ทับของเจ้าของ ปฏิเสธ · OWNER [] เก็บ []", fxNote(p.length ? p.join(" · ") : `ครบ (ผู้จัดการ → [A1] · สลับ/เก็บ ok · ขยาย ${codeR(w1.r)}/${codeR(w2.r)} · ทับ ${codeR(over.r)})`));
}

async function runD3(): Promise<void> {
  const ts = async () => {
    const s = await P.appSystem.findUnique({ where: { id: X.POS }, select: { updatedAt: true, settings: true } });
    return { t: s ? new Date(s.updatedAt).getTime() : 0, chat: JSON.stringify((s?.settings as Any)?.pos?.chat ?? null) };
  };
  const b = await ts();
  await sleep(60);
  const r = await svc(chatLink, "setPosChatSettings", { tenantId: T, systemId: X.POS }, actorOf("OWNER"), { receiptAuto: true });
  const a = await ts();
  const p = judgeD3(r, b.t, a.t, a.chat !== b.chat && /"receiptAuto":true/.test(a.chat));
  chk("D3", p.length === 0, "ok · chat เปลี่ยน · updatedAt ขยับ", fxNote(p.length ? p.join(" · ") : `updatedAt ${new Date(b.t).toISOString()} → ${new Date(a.t).toISOString()}`));
}

async function runD4(): Promise<void> {
  const DEV = `p43${RAND}dev`;
  let prod = "";
  let party = "";
  const ok = await fxStep("D4 วางบิล", async () => {
    await patchPos((pos) => {
      pos.credit = { enabled: true, requireBuyer: false };
    });
    party = (await P.party.create({ data: { tenantId: T, name: `บริษัท คิวซี P4.3 ${RAND} จำกัด`, kind: "COMPANY" } })).id;
    must("saveCreditAccount", await svc(creditMod, "saveCreditAccount", { tenantId: T, systemId: X.POS }, actorOf("OWNER"), { partyId: party, limitSatang: 10_000_000, termDays: 30, active: true }));
    must("registerDevice", await svc(devMod, "registerDevice", ctxU(X.A1!), actorOf("OWNER"), { name: `เคาน์เตอร์ P4.3 ${RAND}`, deviceCode: DEV }));
    must("openShift", await svc(shiftMod, "openShift", ctxU(X.A1!, DEV), actorOf("OWNER"), { deviceId: DEV, deviceLabel: `เคาน์เตอร์ P4.3 ${RAND}`, floatSatang: 0 }));
    prod = String((await catalogMod.createProduct({ tenantId: T, systemId: X.POS, actorUserId: PER.OWNER!.userId }, { name: `P43 วางบิล ${RAND}`, basePriceSatang: 120_000 }))?.id ?? "");
    if (!prod) throw new Error("createProduct ไม่คืน id");
  });
  let submit: Any = null;
  let saleId = "";
  let due = "";
  if (ok) {
    const lines = [{ productId: prod, qty: 1 }];
    const q = await svc(regFacade, "quoteRegisterCart", ctxU(X.A1!, DEV), actorOf("OWNER"), { lines });
    const g = q?.ok === true ? Number(q.grandTotalSatang) : NaN;
    submit = Number.isFinite(g)
      ? await svc(regFacade, "submitRegisterSale", ctxU(X.A1!, DEV), actorOf("OWNER"), { lines, payMethods: [{ type: "ON_ACCOUNT", amountSatang: g }], expectedGrandTotalSatang: g, idempotencyKey: `p43-${RAND}-onacc`, customerPartyId: party })
      : { ok: false, code: `QUOTE:${codeR(q)}`, message: q?.message };
    saleId = okR(submit) ? String(submit.saleId) : "";
    if (saleId) {
      const r = (await P.$queryRawUnsafe(`SELECT "creditTerms" FROM "PosSale" WHERE id = $1`, saleId).catch(() => [])) as Any[];
      due = String(r[0]?.creditTerms?.dueDate ?? "");
    } else console.log(`  ⚠️  D4 ส่งบิลวางบิลไม่ได้: ${codeR(submit)} ${short(submit?.message ?? "", 120)}`);
  }
  const detail = saleId ? await svc(billsMod, "billDetail", { tenantId: T, systemId: X.POS }, actorOf("OWNER"), { unitId: X.A1, saleId }) : null;
  const built = saleId ? await svc(receiptMod, "receiptForSale", T, X.POS, saleId) : null;
  const token = saleId ? await svc(tokenMod, "ensureReceiptToken", T, saleId, P) : null;
  const pub = typeof token === "string" ? await svc(pubReceipt, "publicReceipt", token) : null;
  const surf = { submit, detail: detail?.bill ?? detail, payload: built?.payload ?? built, publicReceipt: pub?.receipt ?? pub };
  const p = judgeD4(due, surf);
  chk("D4", p.length === 0, "creditTerms.dueDate บน submit · bill · payload · /r", fxNote(p.length ? p.join(" · ") : `dueDate ${due} ครบ 4 ผิว`));
}

async function runD5(): Promise<void> {
  const TTL = 75;
  const ids: Record<string, string> = {};
  await fxStep("D5 HR", async () => {
    X.HR = (await sysSvc.createSystem(T, "HR", `ทีมงาน P4.3 ${RAND}`)).id;
    const e = await hrSvc.createEmployee({ tenantId: T, systemId: X.HR }, { name: `พนักงาน P4.3 ${RAND}` });
    // ฐานไม่มีตัวเขียน linkedUserId ของ HR — ทางเดียวกับ qc-pos-p3.5 :1052 (ในร้านชั่วคราวเท่านั้น)
    await P.hrEmployee.updateMany({ where: { id: e.id, tenantId: T }, data: { linkedUserId: PER.CASHIER!.userId } });
  });
  await fxStep("D5 แคตตาล็อก", async () => {
    const cc = { tenantId: T, systemId: X.POS, actorUserId: PER.OWNER!.userId };
    ids.C1 = String((await catalogMod.createCategory(cc, { name: `P43 หมวด ${RAND}` }))?.id ?? "");
    ids.P1 = String((await catalogMod.createProduct(cc, { name: `P43 แม่ ${RAND}`, basePriceSatang: 9000, categoryId: ids.C1 }))?.id ?? "");
    ids.V1 = String((await catalogMod.createProduct(cc, { name: `P43 ตัวแปร ${RAND}`, basePriceSatang: 9500, parentId: ids.P1 }))?.id ?? "");
    ids.P2 = String((await catalogMod.createProduct(cc, { name: `P43 เฉพาะ A2 ${RAND}`, basePriceSatang: 7000, unitId: X.A2 }))?.id ?? "");
    for (const [k, v] of Object.entries(ids)) if (!v) throw new Error(`ไม่มี id ${k}`);
  });
  await fxStep("D5 TTL", async () => {
    must("updatePosStaffSettings", await svc(settingsGeneral, "updatePosStaffSettings", { tenantId: T, systemId: X.POS }, actorOf("OWNER"), { scheduleGate: { overrideTtlMin: TTL } }));
  });
  const overview = await svc(overviewMod, "posStaffOverview", ctxU(X.A1!), actorOf("OWNER"));
  const items: Any[] = Array.isArray(overview?.staff) ? overview.staff : [];
  const cashierFromHr = items.find((s) => s.userId === PER.CASHIER?.userId)?.fromHr;
  const ownerFromHr = items.find((s) => s.userId === PER.OWNER?.userId)?.fromHr;
  const FILE = "src/lib/modules/pos/settings-actions.ts";
  const args = [{ systemId: X.POS, unitId: X.A1, limit: 500 }];
  const payroll = await callAct(FILE, "posCommissionCatalogAction", PER.PAYROLL!, args);
  const noperm = await callAct(FILE, "posCommissionCatalogAction", PER.NOPERM!, args);
  const owner = await callAct(FILE, "posCommissionCatalogAction", PER.OWNER!, args);
  const list = await svc(staffPin, "listStaffForDevice", ctxU(X.A1!), { unitId: X.A1 });
  const x = { cashierFromHr, ownerFromHr, overview, payroll: payroll.r, payrollText: short(payroll.r, 200_000), ids, noperm: noperm.r, owner: owner.r, list, ttl: TTL };
  const p = judgeD5(x);
  chk("D5", p.length === 0, "fromHr ถูกคน · reader ผู้ดูเงินเดือนเห็นครบ (หมวด/แม่/ตัวแปร/สาขาอื่น) · NOPERM ปฏิเสธ · overrideTtlMin = 75", fxNote(p.length ? p.join(" · ") : `ครบ (พนักงาน ${items.length} คน · reader ${Object.keys(ids).length} id · TTL ${TTL})`));
}

async function runD6(): Promise<void> {
  const routes = walk(F.reportsDir).filter((f) => /\/route\.(ts|tsx)$/.test(f));
  const route = routes.find((f) => /print/.test(f)) ?? routes[0] ?? "";
  const blank: Outcome = { kind: "missing", code: "MISSING", text: "" };
  const x = { anon: blank, staff: blank, owner: blank, body: "" };
  if (route) {
    const mod = await modOf(route);
    const GET = mod?.GET;
    const sub = route.replace(/^src\/app/, "").replace(/\/route\.(ts|tsx)$/, "").replace("[id]", X.POS!);
    const day = bkkToday();
    const url = `http://qc.local${sub}?kind=daily&from=${day}&to=${day}&unit=${X.A1}`;
    const hit = async (k: string | null): Promise<{ o: Outcome; body: string }> => {
      if (typeof GET !== "function" || !nextServer?.NextRequest) return { o: { kind: "missing", code: "MISSING", text: `${route}#GET` }, body: "" };
      const cookie = k ? PER[k]!.cookie : "";
      try {
        const res = (await inScope(cookie, sub, async () => GET(new nextServer.NextRequest(url, { headers: { ...(cookie ? { cookie } : {}), "user-agent": SUITE } }), { params: Promise.resolve({ id: X.POS }) }))) as Any;
        if (!res || typeof res.status !== "number") return { o: { kind: "ok", code: "NOT_RESPONSE", text: short(res, 80) }, body: "" };
        const body = await res.text().catch(() => "");
        return { o: { kind: "response", code: String(res.status), text: body.slice(0, 120), status: res.status, ctype: res.headers.get("content-type") ?? "", location: res.headers.get("location") ?? "" }, body };
      } catch (e) {
        return { o: outcomeOfErr(e), body: "" };
      }
    };
    x.anon = (await hit(null)).o;
    x.staff = (await hit("CASHIER")).o;
    const ow = await hit("OWNER");
    x.owner = ow.o;
    x.body = ow.body;
  }
  const p = judgeD6(route, x);
  chk("D6", p.length === 0, "ANON 401/login · STAFF 403 · OWNER 200 text/html + print(", fxNote(p.length ? p.join(" · ") : `${route}: ANON ${x.anon.status ?? x.anon.kind} · STAFF 403 · OWNER 200 ${x.owner.ctype}`));
}

// ═════════════════════════ 6. ลบร้านชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; seqLeft: number; err: string };
async function wipeTenant(tid: string, slug: string): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, seqLeft: 0, err: "" };
  if (!tid) return rep;
  const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, tid)) as Any[];
  if (t.length && t[0].slug !== slug) {
    rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
    return rep;
  }
  const accIds = ((await P.$queryRawUnsafe(`SELECT id FROM "AppSystem" WHERE "tenantId" = $1 AND type::text = 'ACCOUNT'`, tid).catch(() => [])) as Any[]).map((r: Any) => String(r.id));
  for (const id of accIds) await P.$queryRawUnsafe(`SELECT account_jno_drop($1)::text AS x`, id).catch((e: Error) => (rep.err = `account_jno_drop: ${e.message.slice(0, 60)}`));
  const tables = ((await P.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as Any[]).map((r: Any) => String(r.t));
  rep.tables = tables.length;
  await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "Customer" SET "mergedIntoId" = NULL, "referredById" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "PosProduct" SET "parentId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) {
      try {
        await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid);
      } catch {
        next.push(tb);
      }
    }
    pending = next;
  }
  const uids = ((await P.$queryRawUnsafe(`SELECT id FROM "User" WHERE email LIKE $1`, `${slug}-%@qc.invalid`)) as Any[]).map((r: Any) => String(r.id));
  for (const uid of uids) {
    await P.session.deleteMany({ where: { userId: uid } }).catch(() => {});
    await P.appNotification?.deleteMany({ where: { recipientUserId: uid } }).catch(() => {});
    await P.membership.deleteMany({ where: { userId: uid } }).catch(() => {});
  }
  await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${slug}-%@qc.invalid`).catch(() => {});
  try {
    await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, tid, slug);
  } catch (e) {
    rep.err = `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 80)}`;
  }
  for (const tb of tables) {
    try {
      const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, tid)) as Any[])[0]?.n ?? 0);
      if (n) rep.left[tb] = n;
    } catch {
      rep.left[tb] = -1;
    }
  }
  rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, tid)) as Any[])[0]?.n ?? 0);
  rep.usersLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `${slug}-%`)) as Any[])[0]?.n ?? 0);
  for (const id of accIds) {
    const r = (await P.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'S' AND n.nspname = current_schema()
         AND c.relname IN (account_jno_seq_name($1, 'SALES'), account_jno_seq_name($1, 'PURCHASES'), account_jno_seq_name($1, 'RECEIPTS'), account_jno_seq_name($1, 'PAYMENTS'), account_jno_seq_name($1, 'GENERAL'))`,
      id,
    ).catch(() => [{ n: -1 }])) as Any[];
    rep.seqLeft += Number(r[0]?.n ?? 0);
  }
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, seqLeft: 0, err: "" };
const qcBefore = await fpQc(QC_TIDS);
try {
  runStatic();
  console.log("\n── D ข้อ DB (ร้านชั่วคราว) ──");
  await setup();
  for (const [id, f] of [["D1", runD1], ["D3", runD3], ["D2", runD2], ["D4", runD4], ["D5", runD5], ["D6", runD6]] as const) {
    try {
      await f();
    } catch (e) {
      chk(id, false, "ไม่โยน", `💥 ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
    }
  }
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 4).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await sleep(1500);
    wipe = await wipeTenant(T, SLUG);
    console.log(`  ลบร้านชั่วคราว ${SLUG}: ${wipe.tables} ตาราง · ค้าง ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · User ${wipe.usersLeft} · sequence ${wipe.seqLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
  } finally {
    globalThis.fetch = realFetch;
  }
}
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && wipe.usersLeft === 0 && wipe.seqLeft === 0 && !wipe.err, "0 แถว · Tenant/User ลบ · sequence 0", [tempLeft.length ? `ค้าง ${tempLeft.join(", ")}` : `0 แถว (${wipe.tables} ตาราง)`, `Tenant ${wipe.tenantLeft}`, `User ${wipe.usersLeft}`, `sequence ${wipe.seqLeft}`, wipe.err].filter(Boolean).join(" · "));
const qcAfter = await fpQc(QC_TIDS);
const qcDrift = fpDiff(qcBefore, qcAfter);
chk("Z2", qcDrift.length === 0 && !Object.values(qcBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือ coffee/resto เท่าเดิม", qcDrift.length ? `ต่าง ${qcDrift.join(", ")}` : `เท่าเดิม (${Object.entries(qcAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 100)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (bgErrors) console.log(`  ⚠️  unhandledRejection ${bgErrors} ครั้ง`);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size} · ฐาน ${PIN}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, pin: PIN, lanePin: LANE_PIN, fixture: fx || null, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft + wipe.seqLeft })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
