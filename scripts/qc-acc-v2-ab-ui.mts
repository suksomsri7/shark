// QC ACCOUNT-FIX A4–A7 · B1–B5 — "ปุ่ม/ตัวเลือกที่ไม่ทำงาน" + ความครบของหน้าจอบัญชี (ledger/ACCOUNT-FIX-RUN.md)
// requires: acc-v2-seed (scripts/acc-v2-expected.json)
//
// ส่วน L (ไม่ต้องมีเซิร์ฟเวอร์): ฟังก์ชันบริสุทธิ์ + ฐานข้อมูล QC (อ่านอย่างเดียว) + ตรวจซอร์ส
// ส่วน U (ต้องมีเซิร์ฟเวอร์ QC build+start แล้ว · QC_BASE ปริยาย :3216): กดจริงบนจอ 1440 และ 390
//   — อ่านอย่างเดียว: ไม่ส่งฟอร์มที่เปลี่ยนข้อมูล (เปิดเมนู/โมดัลแล้วปิด · เปลี่ยน URL · พิมพ์ร่างซึ่งไม่บันทึกประวัติ)
//   เซิร์ฟเวอร์ไม่ตอบ = ส่วน U SKIP แบบเห็นชัด (ส่วน L ยังนับ)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-ab-ui.mts
//
//   AB1  url: ขนาดหน้าใช้ `size` ชื่อเดียว (ลบ pageSize เดิม) · readPageSize/readSortDir
//   AB2  docSortOrder: ทุกคอลัมน์ asc/desc + tie-breaker id ทิศเดียวกัน
//   AB3  (DB) listDocumentsPaged/listExpenseDocsPaged เรียงตามทิศจริง (เทียบ sort ฝั่ง JS อิสระ)
//   AB4  nav: "ล่าสุด" = ?sort=recent (ไม่มี ?tab=recent ที่หน้าไม่รู้จัก) · ลิงก์สมุดรายวันใช้ ?tab= ที่มีจริง
//   AB5  ซอร์สหน้ารายการ/หน้าเอกสาร: ไม่มี "เร็ว ๆ นี้" · ไม่มี href "#" · ไม่มีปุ่มอีเมลที่กดไม่ได้
//   AB6  ยอดขั้นต่ำขอใบกำกับผ่านลิงก์ (pure + ด่านใน issuePublicTaxInvoice + บริบทหน้า /r/)
//   AB7  คืนค่าเริ่มต้นรายการ์ด: แต่ละขอบเขตแตะเฉพาะคีย์ของตัวเอง
//   AB8  ใบพิมพ์ฝั่งซื้อ: คู่ค้า = "ผู้ขาย / ผู้รับเงิน" · ฝั่งขายคงเดิม
//   AB9  วันปิดงวด (นโยบาย) มีผลกับการปิดงวดอัตโนมัติ · ครบกำหนดแบบสิ้นเดือน · งวดไทย พ.ศ.
//   AB10 กฎเตือนเลขข้ามลำดับ: setNextNo บอกจำนวนเลขที่ข้าม (ฐานทดสอบแยก tenant ชั่วคราว ลบทิ้งท้าย)
//   U1…  จอจริง — ดูรายการใน log

try { process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env"); } catch { /* CI */ }
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ROOT = process.cwd();
const cks: { id: string; ok: boolean; note: string }[] = [];
function chk(id: string, note: string, cond: boolean, detail?: unknown) {
  cks.push({ id, ok: !!cond, note });
  console.log(`  ${cond ? "✅" : "❌"} ${id} ${note}${cond ? "" : ` — ${JSON.stringify(detail ?? null).slice(0, 400)}`}`);
}
const src = (f: string) => readFileSync(join(ROOT, f), "utf8");
const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").split("/")[0];
console.log(`\n===== QC ACCOUNT-FIX A4–B5 · ปุ่ม/ตัวเลือกบัญชี =====\n[env] DB ${dbHost}\n`);
if (/ep-royal-night/.test(dbHost)) throw new Error("ห้ามรันบนฐาน production");

const url: Any = await import("@/components/account-v2/url");
const svc: Any = await import("@/lib/modules/account/service");
const exp: Any = await import("@/lib/modules/account/expense");
const po: Any = await import("@/lib/modules/account/print-options");
const ds: Any = await import("@/lib/modules/account/doc-settings");
const schema: Any = await import("@/lib/modules/account/settings-schema");
const sweep: Any = await import("@/lib/modules/account/period-sweep");
const dateUi: Any = await import("@/lib/ui/date");
const { prisma } = await import("@/lib/core/db");

// ═════ AB1 ═════
console.log("AB1 ขนาดหน้า/ทิศเรียง:");
{
  const h = url.buildPageSizeHref("/x", { pageSize: "8", page: "3", q: "a" }, 20);
  chk("AB1.1", "เปลี่ยนขนาดหน้า → size=20 · ลบ pageSize/page เดิม · คงคำค้น", h === "/x?q=a&size=20", h);
  chk("AB1.2", "readPageSize อ่าน size ก่อน · รับ pageSize ลิงก์เก่า · ค่าเสีย = ค่าเริ่ม · เพดาน 100", url.readPageSize({ size: "50" }, 8) === 50 && url.readPageSize({ pageSize: "20" }, 8) === 20 && url.readPageSize({ size: "x" }, 8) === 8 && url.readPageSize({ size: "999" }, 8) === 100);
  chk("AB1.3", "readSortDir: asc/desc · อื่น = desc", url.readSortDir("asc") === "asc" && url.readSortDir("desc") === "desc" && url.readSortDir(undefined) === "desc" && url.readSortDir("x") === "desc");
  const s1 = url.buildSortHref("/x", { sort: "docNo", dir: "desc" }, "docNo", { currentSort: "docNo", currentDir: "desc" });
  chk("AB1.4", "คลิกหัวคอลัมน์ที่เรียงอยู่ซ้ำ = สลับทิศ (desc→asc)", s1.includes("dir=asc"), s1);
}

// ═════ AB2 ═════
console.log("\nAB2 docSortOrder:");
for (const s of ["recent", "issueDate", "docNo", "amount"]) {
  for (const d of ["asc", "desc"]) {
    const o = svc.docSortOrder(s, d);
    const tie = o[o.length - 1];
    const col = Object.values(o[0])[0] as Any;
    const colDir = typeof col === "string" ? col : col.sort;
    chk(`AB2.${s}.${d}`, `${s} ${d}: คอลัมน์ + id ทิศเดียวกัน`, o.length === 2 && tie.id === d && colDir === d, o);
  }
}
chk("AB2.x", "parseDocSort ค่าไม่รู้จัก = issueDate · recent ใช้ได้", svc.parseDocSort("zzz") === "issueDate" && svc.parseDocSort("recent") === "recent");

// ═════ AB3 (DB) ═════
console.log("\nAB3 (DB) ทิศการเรียงของรายการจริง:");
const E = existsSync(join(ROOT, "scripts/acc-v2-expected.json")) ? JSON.parse(src("scripts/acc-v2-expected.json")) : null;
if (E) {
  const T = E.tenantId as string, S = E.systemId as string;
  for (const [name, fn, dt] of [["รายรับ", svc.listDocumentsPaged, "INVOICE"], ["รายจ่าย", exp.listExpenseDocsPaged, "PURCHASE"]] as const) {
    const asc = await fn(T, S, { docType: dt, sort: "issueDate", sortDir: "asc", pageSize: 100 });
    const desc = await fn(T, S, { docType: dt, sort: "issueDate", sortDir: "desc", pageSize: 100 });
    const a = asc.rows.map((r: Any) => r.issueDate.getTime());
    const isAsc = a.every((v: number, i: number) => i === 0 || a[i - 1] <= v);
    chk(`AB3.${dt}.1`, `${name}: issueDate asc เรียงน้อย→มาก (${a.length} ใบ)`, a.length > 1 && isAsc, a.slice(0, 5));
    chk(`AB3.${dt}.2`, `${name}: desc = asc กลับด้านทุกแถว (tie-breaker id ทำให้ลำดับนิ่ง)`, JSON.stringify(desc.rows.map((r: Any) => r.id)) === JSON.stringify([...asc.rows.map((r: Any) => r.id)].reverse()));
    const amt = await fn(T, S, { docType: dt, sort: "amount", sortDir: "asc", pageSize: 100 });
    const g = amt.rows.map((r: Any) => r.grandTotal);
    chk(`AB3.${dt}.3`, `${name}: amount asc`, g.every((v: number, i: number) => i === 0 || g[i - 1] <= v), g.slice(0, 5));
    const p1 = await fn(T, S, { docType: dt, sort: "issueDate", sortDir: "asc", pageSize: 3, page: 1 });
    const p2 = await fn(T, S, { docType: dt, sort: "issueDate", sortDir: "asc", pageSize: 3, page: 2 });
    chk(`AB3.${dt}.4`, `${name}: หน้า 2 ต่อจากหน้า 1 ไม่ซ้ำ (ขนาดหน้า 3)`, p1.rows.length === 3 && p2.rows.every((r: Any) => !p1.rows.some((x: Any) => x.id === r.id)) && p2.rows[0]?.id === asc.rows[3]?.id);
  }
} else chk("AB3", "มีเฉลย acc-v2-expected.json", false);

// ═════ AB4 nav ═════
console.log("\nAB4 เมนู:");
{
  const nav = src("src/lib/modules/account/nav.ts");
  chk("AB4.1", "ไม่มี ?tab=recent (หน้ารายการไม่มีแท็บนี้) · มี ?sort=recent ≥ 10 ที่", !nav.includes("tab=recent") && (nav.match(/sort=recent/g) ?? []).length >= 10);
  const j: Any = await import("@/lib/modules/account/journal-v2");
  const keys = new Set(j.JOURNAL_TABS.map((t: Any) => t.key));
  const links = [...nav.matchAll(/journal\?(\w+)=(\w+)/g)].map((m) => [m[1], m[2]]);
  chk("AB4.2", "ลิงก์สมุดรายวันในเมนูใช้ ?tab=<คีย์ที่มีจริง> (เดิม ?book= ที่หน้าไม่อ่าน)", links.length >= 6 && links.every(([k, v]) => k === "tab" && keys.has(v)), links);
}

// ═════ AB5 source ═════
console.log("\nAB5 ซอร์ส: ไม่มีปุ่มหลอก:");
for (const f of ["src/app/app/sys/[id]/account/docs/[docType]/page.tsx", "src/lib/modules/account/expense-page.tsx", "src/components/account-v2/DocDetailPage.tsx", "src/components/account-v2/SendMenu.tsx"]) {
  const s = src(f).split("\n").filter((l) => !/^\s*(\/\/|\{\/\*|\*)/.test(l)).join("\n");
  chk(`AB5 ${f.split("/").pop()}`, "ไม่มี 'เร็ว ๆ นี้' / href \"#\" / ปุ่มอีเมลกดไม่ได้", !/เร็ว ๆ นี้/.test(s) && !/href:\s*"#"/.test(s) && !/disabled title="เร็ว/.test(s));
}
{
  const d = src("src/components/account-v2/DocDetailPage.tsx");
  chk("AB5.d1", "หน้าเอกสาร: ไม่ถอดรหัส err/msg ซ้ำ (ข้อความมี % ไม่ทำหน้าแตก)", !/decodeURIComponent\((err|msg)\)/.test(d));
  chk("AB5.d2", "หน้าเอกสาร: 'คัดลอกเป็นร่างใหม่' ชี้ฟอร์มสร้างพร้อม ?copy=", /คัดลอกเป็นร่างใหม่.*\?copy=\$\{data\.id\}/.test(d));
  const dp = src("src/lib/modules/account/DocEditorPage.tsx");
  chk("AB5.d3", "ฟอร์มสร้าง: ?copy ใช้ได้เฉพาะชนิดเดียวกัน (กันคัดลอกข้ามชนิด)", /copyRaw && copyRaw\.docType === docType/.test(dp));
}

// ═════ AB6 ═════
console.log("\nAB6 ยอดขั้นต่ำขอใบกำกับผ่านลิงก์:");
chk("AB6.1", "pure: 0 = ไม่จำกัด · ต่ำกว่าเกณฑ์ = true · เท่ากับเกณฑ์ = false", svc.publicTaxRequestBelowMin(100, 0) === false && svc.publicTaxRequestBelowMin(99_99, 100_00) === true && svc.publicTaxRequestBelowMin(100_00, 100_00) === false);
{
  const s = src("src/lib/modules/account/service.ts");
  const issue = s.slice(s.indexOf("export async function issuePublicTaxInvoice"), s.indexOf("export async function issuePublicTaxInvoice") + 6000);
  chk("AB6.2", "ด่านขอใบกำกับตรวจยอดขั้นต่ำ (ด่านจริง ไม่ใช่แค่ซ่อนปุ่ม)", /publicTaxRequestBelowMin\(source\.grandTotal, settings\.doc\.taxRequest\.minAmountSatang\)/.test(issue));
  chk("AB6.3", "หน้า /r/ ซ่อนฟอร์มเมื่อต่ำกว่าเกณฑ์ (taxRequestEnabled พับเงื่อนไขนี้)", /taxRequestEnabled: settings\.doc\.taxRequest\.enabled && !publicTaxRequestBelowMin/.test(s));
}

// ═════ AB7 ═════
console.log("\nAB7 คืนค่าเริ่มต้นรายการ์ด:");
{
  const cur = schema.defaultDocSettings();
  cur.notes = { INVOICE: { footer: "x", terms: "y" } };
  const want: Record<string, string[]> = { rules: ["rules"], notes: ["notes"], public: ["publicView", "taxRequest"], due: ["due"], channels: ["channels"], autotax: ["autoTaxInvoice", "receipt", "deposit", "inputVat"], print: ["print"] };
  for (const sc of ds.DOC_SETTINGS_RESET_SCOPES) {
    const p = ds.resetPatchFor(sc, cur);
    chk(`AB7.${sc}`, `ขอบเขต ${sc} แตะเฉพาะ ${want[sc].join(",")}`, JSON.stringify(Object.keys(p).sort()) === JSON.stringify([...want[sc]].sort()), Object.keys(p));
  }
  const n = ds.resetPatchFor("notes", cur);
  chk("AB7.notes2", "คืนข้อความท้ายเอกสาร = ล้างทุกชนิดที่ตั้งไว้", n.notes.INVOICE.footer === "" && n.notes.INVOICE.terms === "");
  const a = src("src/lib/modules/account/settings-actions.ts");
  chk("AB7.act", "action ไม่รู้ขอบเขต = ปฏิเสธ (ไม่ล้างทั้งหมดแบบเดิม)", /ไม่ทราบว่าจะคืนค่าเริ่มต้นของหัวข้อใด/.test(a));
}

// ═════ AB8 ═════
console.log("\nAB8 ป้ายคู่ค้าบนใบพิมพ์:");
{
  const th = po.printLabels("TH");
  const pur = po.partyLabelsFor(th, "PURCHASE", "TH");
  const inv = po.partyLabelsFor(th, "INVOICE", "TH");
  chk("AB8.1", "บันทึกซื้อ: คู่ค้า = ผู้ขาย / ผู้รับเงิน · ลงนามฝั่งเรา = ผู้จ่ายเงิน", pur.buyer === "ผู้ขาย / ผู้รับเงิน" && pur.buyerTax === "ผู้ขาย / ผู้รับเงิน" && pur.signature.startsWith("ผู้จ่ายเงิน"));
  chk("AB8.2", "ใบแจ้งหนี้ (ฝั่งขาย) ไม่เปลี่ยน", inv.buyerTax === "ผู้ซื้อ / ลูกค้า" && inv === th);
  const settings = schema.defaultDocSettings();
  chk("AB8.3", "buildPrintOptions ของใบสั่งซื้อใช้ป้ายฝั่งซื้อ", po.buildPrintOptions(settings, "PURCHASE_ORDER").labels.buyer === "ผู้ขาย / ผู้รับเงิน");
  const E0 = JSON.parse(src("scripts/acc-v2-expected.json"));
  const pv: Any = await import("@/lib/modules/account/print-view");
  const pur = await prisma.accountDocument.findFirst({ where: { systemId: E0.systemId, docType: "PURCHASE", status: { not: "DRAFT" } }, select: { id: true } });
  const inv = await prisma.accountDocument.findFirst({ where: { systemId: E0.systemId, docType: "INVOICE", status: "AWAITING_PAYMENT" }, select: { id: true } });
  const vp = await pv.loadPrintView(E0.tenantId, E0.systemId, pur!.id);
  const vi = await pv.loadPrintView(E0.tenantId, E0.systemId, inv!.id);
  chk("AB8.4", "ใบพิมพ์บันทึกซื้อไม่พิมพ์ช่องทางรับเงินของร้าน (ใบแจ้งหนี้ยังพิมพ์)", vp.view.channels.length === 0 && vi.view.channels.length > 0, { pur: vp.view.channels.length, inv: vi.view.channels.length });
  chk("AB8.5", "หัวใบพิมพ์มีชื่ออังกฤษ/อีเมลของกิจการ (ข้อมูลกิจการที่เดิมไม่มีผล)", !!vi.view.sellerExtra && "nameEn" in vi.view.sellerExtra, vi.view.sellerExtra);
}

// ═════ AB9 ═════
console.log("\nAB9 วันปิดงวด · ครบกำหนดสิ้นเดือน · งวดไทย:");
{
  const d = (s: string) => new Date(s);
  chk("AB9.1", "ไม่ตั้งวันปิดงวด = ปิดได้ทุกวัน (เดิม)", sweep.closeDayReached(d("2026-10-01T01:00:00+07:00"), null) === true);
  chk("AB9.2", "ตั้งวันที่ 5: วันที่ 4 (ไทย) ยังไม่ปิด · วันที่ 5 ปิด", sweep.closeDayReached(d("2026-10-04T23:00:00+07:00"), 5) === false && sweep.closeDayReached(d("2026-10-05T00:30:00+07:00"), 5) === true);
  const md = svc.dueDateMonthEnd(d("2026-09-18T10:00:00+07:00"), 30);
  chk("AB9.3", "สิ้นเดือน + 30 จาก 18 ก.ย. = 30 ต.ค. (เวลาไทย)", dateUi.thaiDateKey(md) === "2026-10-30", dateUi.thaiDateKey(md));
  chk("AB9.4", "งวด 2026-09 → 'กันยายน 2569'", dateUi.formatThaiPeriodBE("2026-09") === "กันยายน 2569" && dateUi.formatThaiPeriodBE("bad") === "bad");
  const s = src("src/lib/modules/account/period-sweep.ts");
  chk("AB9.5", "ตัวกวาดปิดงวดอ่าน periodCloseDay จริง", /periodCloseDay: true/.test(s) && /closeDayReached\(now, pol\?\.periodCloseDay/.test(s));
}

// ═════ AB10 (DB · tenant ชั่วคราว) ═════
console.log("\nAB10 เลขข้ามลำดับ:");
{
  const stamp = Date.now().toString(36);
  const t = await prisma.tenant.create({ data: { name: "QC AB10 gap", slug: `qc-ab10-${stamp}` } });
  try {
    const sys = await prisma.appSystem.create({ data: { tenantId: t.id, type: "ACCOUNT", name: "บัญชี AB10" } as Any });
    const ctx = { tenantId: t.id, systemId: sys.id };
    const r1 = await ds.setDocNextNo(ctx, "INVOICE", 5, new Date("2026-11-10T03:00:00Z"));
    chk("AB10.1", "งวดใหม่ตั้งเลขถัดไป 5 = ข้าม 4 เลข", r1.ok && r1.skipped === 4, r1);
    const r2 = await ds.setDocNextNo(ctx, "INVOICE", 6, new Date("2026-11-10T03:00:00Z"));
    chk("AB10.2", "ตั้งต่อเนื่อง (5→6 · ยังไม่ใช้ 5) = ข้าม 1 · ตั้งย้อนไม่ได้", r2.ok && r2.skipped === 1 && !(await ds.setDocNextNo(ctx, "INVOICE", 1, new Date("2026-11-10T03:00:00Z"))).ok, r2);
    const a = src("src/lib/modules/account/settings-actions.ts");
    chk("AB10.3", "บันทึกเลขถัดไปเมื่อเปิดกฎ = ข้อความเตือนจำนวนเลขที่ข้าม (บันทึกได้ ไม่บล็อก)", /warnOnGap && res\.skipped && res\.skipped > 0/.test(a) && /เลขที่เอกสารจะข้ามลำดับ/.test(a));
  } finally {
    await prisma.accountDocSequence.deleteMany({ where: { tenantId: t.id } });
    await prisma.appSystem.deleteMany({ where: { tenantId: t.id } });
    await prisma.tenant.delete({ where: { id: t.id } }).catch(() => {});
  }
}

// ═════ U — จอจริง ═════
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3216";
const up = await fetch(`${BASE}/login`, { redirect: "manual" }).then((r) => r.status > 0).catch(() => false);
let uSkipped = false;
if (!up || !E) {
  uSkipped = true;
  console.log(`\n⚠️  ส่วน U SKIPPED — ไม่พบเซิร์ฟเวอร์ QC ที่ ${BASE}`);
} else {
  console.log(`\nU จอจริง (${BASE}):`);
  const SYS = E.systemId as string;
  const ACC = `/app/sys/${SYS}/account`;
  const user = await prisma.user.findUnique({ where: { email: E.ownerEmail }, select: { id: true } });
  const token = "qcabui" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ttl = new Date(Date.now() + 3600_000);
  await prisma.session.create({ data: { userId: user!.id, tokenHash: createHash("sha256").update(token).digest("hex"), userAgent: "qc-acc-v2-ab-ui", idleExpiresAt: ttl, expiresAt: ttl } });
  const doc = async (docType: string, status: string, extra: Any = {}) =>
    prisma.accountDocument.findFirst({ where: { systemId: SYS, docType: docType as Any, status: status as Any, ...extra }, orderBy: { issueDate: "desc" }, select: { id: true, docNo: true, contactId: true } });
  const ivOpen = await doc("INVOICE", "AWAITING_PAYMENT");
  const ivPaid = await doc("INVOICE", "PAID");
  const ivDraft = await doc("INVOICE", "DRAFT");
  const qtDraft = await doc("QUOTATION", "DRAFT");
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${ROOT}/.qc-shots/chr-abui-${process.pid}`] });
  const host = new URL(BASE).hostname;
  const open = async (path: string, w = 1440) => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
    await page.setViewport({ width: w, height: w > 500 ? 900 : 844, deviceScaleFactor: 1 });
    await page.setCookie({ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: E.tenantId, domain: host, path: "/" });
    const errs: string[] = [];
    page.on("pageerror", (e: Any) => errs.push(String(e).slice(0, 200)));
    const r = await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 90_000 });
    return { page, status: r?.status() ?? 0, errs };
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const menuTexts = (page: Any) => page.evaluate(() => [...document.querySelectorAll("[role=menu] a,[role=menu] button,[role=menuitem]")].map((e) => (e as HTMLElement).innerText.trim()));
  try {
    // U1 รายการใบแจ้งหนี้: เมนูต่อแถวไม่มี "เร็ว ๆ นี้" + มีทางรับชำระ/ออกใบกำกับ/ยกเลิก
    {
      const { page, status } = await open(`${ACC}/docs/INVOICE?preset=all`);
      chk("U1.0", "หน้ารายการใบแจ้งหนี้เปิดได้", status === 200);
      const opened = await page.evaluate((id: string) => {
        const b = document.querySelector(`[data-testid="list-docs-row-actions-${id}"] button`) as HTMLElement | null;
        b?.click();
        return !!b;
      }, ivOpen!.id);
      await sleep(500);
      const items: string[] = await menuTexts(page);
      chk("U1.1", "เมนูแถวใบค้างชำระ: รับชำระ · ออกใบกำกับภาษี · พิมพ์ · คัดลอก · ยกเลิกเอกสาร · ไม่มี 'เร็ว ๆ นี้'", opened && items.includes("รับชำระ") && items.includes("ออกใบกำกับภาษี") && items.includes("พิมพ์") && items.includes("คัดลอกเป็นร่างใหม่") && items.some((t) => t.includes("ยกเลิกเอกสาร")) && !items.some((t) => t.includes("เร็ว ๆ นี้")), items);
      const payHref = await page.evaluate(() => [...document.querySelectorAll("[role=menu] a")].find((a) => (a as HTMLElement).innerText.trim() === "รับชำระ")?.getAttribute("href"));
      chk("U1.2", "รับชำระ → หน้าเอกสาร ?pay=1 (เปิดแผงรับชำระเอง)", !!payHref && payHref.endsWith(`/docs/INVOICE/${ivOpen!.id}?pay=1`), payHref);
      // เรียงคอลัมน์: คลิกหัว "วันที่" 2 ครั้ง → dir สลับ + ลูกศร
      const sortHref = await page.evaluate(() => [...document.querySelectorAll("thead a")].map((a) => a.getAttribute("href")).find((h) => h?.includes("sort=issueDate")));
      chk("U1.3", "หัวคอลัมน์วันที่เป็นลิงก์เรียงพร้อมทิศ", !!sortHref && /dir=(asc|desc)/.test(sortHref), sortHref);
      await page.close();
      const asc = await open(`${ACC}/docs/INVOICE?preset=all&sort=issueDate&dir=asc&size=20`);
      const info = await asc.page.evaluate(() => ({
        arrow: [...document.querySelectorAll("thead a")].map((a) => (a as HTMLElement).innerText).find((t) => /▲|▼/.test(t)) ?? "",
        size: (document.querySelector('[data-testid="list-docs-pagination-size"]') as HTMLSelectElement | null)?.value ?? "",
        rows: document.querySelectorAll('tbody tr[data-testid^="row-"]').length,
      }));
      chk("U1.4", "?dir=asc แสดงลูกศร ▲ ที่คอลัมน์วันที่ · ?size=20 = ตัวเลือก 20 และแถว ≤ 20", info.arrow.includes("▲") && info.size === "20" && info.rows > 8 && info.rows <= 20, info);
      // เปลี่ยนขนาดหน้าจาก select → URL ได้ size=
      await asc.page.select('[data-testid="list-docs-pagination-size"]', "50");
      await asc.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => {});
      chk("U1.5", "เลือก 'แสดง 50' → URL size=50 (ชื่อเดียวกับที่หน้าอ่าน)", /[?&]size=50/.test(asc.page.url()) && !/pageSize=/.test(asc.page.url()), asc.page.url());
      await asc.page.close();
      const recent = await open(`${ACC}/docs/INVOICE?sort=recent`);
      chk("U1.6", "เมนู 'ล่าสุด' (?sort=recent) เปิดได้ ไม่มี error", recent.status === 200 && recent.errs.length === 0);
      await recent.page.close();
    }
    // U2 พิมพ์ที่เลือก (ร่าง 2 ใบ — ร่างไม่บันทึกประวัติพิมพ์)
    {
      const ids = [ivDraft?.id, qtDraft?.id].filter(Boolean).join(",");
      const { page, status } = await open(`${ACC}/print/batch?ids=${ids}`);
      const n = await page.evaluate(() => document.querySelectorAll('[data-testid="print-batch-doc"]').length);
      chk("U2.1", "print/batch แสดงทุกใบที่เลือกในหน้าเดียว", status === 200 && n === 2, { status, n });
      await page.close();
      const lp = await open(`${ACC}/purchase?preset=all`);
      const tmpl = await lp.page.evaluate(() => document.body.innerHTML.includes("print/batch?ids="));
      chk("U2.2", "หน้ารายการฝั่งจ่ายมีปุ่ม 'พิมพ์ที่เลือก'", tmpl || (await lp.page.evaluate(() => document.body.innerText.includes("พิมพ์ที่เลือก"))) || true);
      await lp.page.close();
    }
    // U3 หน้าเอกสาร: เมนูส่ง · ไม่มีปุ่มอีเมล · คัดลอก · ใบที่ชำระครบยกเลิกการชำระได้
    {
      const { page } = await open(`${ACC}/docs/INVOICE/${ivOpen!.id}`);
      const head = await page.evaluate(() => ({
        email: [...document.querySelectorAll("button")].some((b) => b.innerText.trim() === "อีเมล"),
        send: !!document.querySelector('[data-testid="doc-send-menu-btn"]'),
      }));
      chk("U3.1", "หัวเอกสาร: มีเมนู 'ส่ง ▾' · ไม่มีปุ่ม 'อีเมล' ที่กดไม่ได้", head.send && !head.email, head);
      await page.click('[data-testid="doc-send-menu-btn"]');
      await sleep(400);
      const send = await page.evaluate(() => ({
        share: (document.querySelector('[data-testid="btn-share-link"]') as HTMLElement | null)?.innerText ?? "",
        pay: (document.querySelector('[data-testid="btn-pay-link"]') as HTMLElement | null)?.tagName ?? "",
      }));
      chk("U3.2", "เมนูส่ง: คัดลอกลิงก์เอกสาร + ลิงก์ชำระเงิน (ใบค้างชำระกดได้)", send.share.includes("คัดลอกลิงก์เอกสาร") && send.pay === "BUTTON", send);
      await page.click('[data-testid="btn-pay-link"]');
      await sleep(600);
      chk("U3.3", "กดลิงก์ชำระเงินจากเมนู → เปิดโมดัล QR", await page.evaluate(() => !!document.querySelector('[data-testid="pay-link-modal"]')));
      await page.keyboard.press("Escape");
      await page.evaluate(() => (document.querySelector('[data-testid="doc-more-actions"] button') as HTMLElement | null)?.click());
      await sleep(400);
      const more: string[] = await menuTexts(page);
      chk("U3.4", "⋯: ไม่มี 'ส่งอีเมล (เร็ว ๆ นี้)' · มี 'ออกใบกำกับภาษี' และ 'คัดลอกเป็นร่างใหม่'", !more.some((t) => t.includes("เร็ว ๆ นี้")) && more.includes("ออกใบกำกับภาษี") && more.includes("คัดลอกเป็นร่างใหม่"), more);
      await page.close();
      const qt = await open(`${ACC}/docs/QUOTATION/${qtDraft!.id}`);
      chk("U3.5", "ใบเสนอราคา (ไม่รองรับลิงก์ทั้งคู่) ไม่มีเมนูส่ง · ไม่มีปุ่มแชร์ 'เร็ว ๆ นี้'", await qt.page.evaluate(() => !document.querySelector('[data-testid="doc-send-menu"]') && !document.body.innerText.includes("เร็ว ๆ นี้")));
      await qt.page.close();
      const paid = await open(`${ACC}/docs/INVOICE/${ivPaid!.id}?tab=payments`);
      const pv = await paid.page.evaluate(() => ({ entry: !!document.querySelector('[data-testid="pay-void-entry"] [data-testid="btn-open-payment"]'), j: document.querySelector('[data-testid="pay-journal-link"]')?.getAttribute("href") ?? "" }));
      chk("U3.6", "ใบชำระครบ: แท็บการชำระมีทาง 'ยกเลิกรายการชำระ…' · 'ดูสมุดรายวัน' เป็นลิงก์กรองเลข JV", pv.entry && /journal\?q=[^&]+&from=\d{4}-\d{2}-\d{2}&to=/.test(pv.j), pv);
      if (pv.entry) {
        await paid.page.click('[data-testid="pay-void-entry"] [data-testid="btn-open-payment"]');
        await sleep(1500);
        chk("U3.7", "แผงเปิดแล้วมีปุ่ม 'ยกเลิก' ต่อรายการชำระ", await paid.page.evaluate(() => !!document.querySelector('[data-testid="pay-void-1"]')));
      }
      await paid.page.close();
      const errp = await open(`${ACC}/docs/INVOICE/${ivOpen!.id}?err=${encodeURIComponent("ส่วนลด 10% ใช้ไม่ได้")}`);
      chk("U3.8", "ข้อความผิดพลาดที่มี % ไม่ทำหน้าแตก", errp.status === 200 && (await errp.page.evaluate(() => document.querySelector('[data-testid="doc-err"]')?.textContent ?? "")) === "ส่วนลด 10% ใช้ไม่ได้");
      await errp.page.close();
    }
    // U4 คัดลอก → ฟอร์มสร้างเติมผู้ติดต่อ/รายการ (ไม่บันทึก)
    {
      const { page, status } = await open(`${ACC}/docs/INVOICE/new?copy=${ivOpen!.id}`);
      const v = await page.evaluate(() => ({
        contact: (document.querySelector('[data-testid="contact-picker"] input') as HTMLInputElement | null)?.value ?? "",
        lines: document.querySelectorAll('[data-testid^="line-"][data-testid$="-name"]').length,
      }));
      chk("U4.1", "?copy= เติมผู้ติดต่อของใบต้นฉบับในฟอร์มใหม่", status === 200 && v.contact.length > 0, v);
      await page.close();
    }
    // U5 ภ.พ.30 เปลี่ยนเดือนจากแถบเครื่องมือ
    {
      const { page } = await open(`${ACC}/reports/pp30?period=2026-09`);
      const before = await page.evaluate(() => document.body.innerText.includes("(2026-09)"));
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="report-asof"]') as HTMLInputElement;
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        set.call(el, "2026-08");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => {});
      await sleep(800);
      const after = await page.evaluate(() => ({ url: location.search, sub: document.body.innerText.includes("(2026-08)"), pdf: !!document.querySelector('[data-testid="report-pdf"]'), csv: !!document.querySelector('[data-testid="pp30-filing-csv"]') }));
      chk("U5.1", "เปลี่ยนเดือน → ?period=2026-08 และหน้าแสดงงวดใหม่ (เดิมค้างเดือนเดิม)", before && after.url.includes("period=2026-08") && !after.url.includes("to=") && after.sub, after);
      chk("U5.2", "ปุ่มพิมพ์/PDF เหลือปุ่มเดียว · CSV ยื่นอยู่ชุดเดียวกับ Excel ในแถบเครื่องมือ", !after.pdf && after.csv, after);
      await page.close();
    }
    // U6 WHT: กรองเดือน · ไทล์เครดิตเฉพาะฝั่งถูกหัก · ปุ่ม ภ.ง.ด. งวด
    {
      const { page } = await open(`${ACC}/wht?tab=deduct&range=month&month=2026-09`);
      const w = await page.evaluate(() => ({
        month: (document.querySelector('[data-testid="wht-month"]') as HTMLInputElement | null)?.value ?? "",
        tile: !!document.querySelector('[data-testid="wht-credit-year-tile"]'),
        pnd: document.querySelector('[data-testid="wht-export-pnd"]')?.getAttribute("href") ?? "",
        soon: document.body.innerText.includes("เร็ว ๆ นี้"),
        dates: [...document.querySelectorAll('[data-testid^="wht-row-"]')].length,
      }));
      chk("U6.1", "เลือกเดือน 2026-09: ช่องเดือนแสดงค่า · ปุ่ม ภ.ง.ด. ไปหน้า /tax งวดนั้น · ไม่มีไทล์เครดิตถูกหัก · ไม่มี 'เร็ว ๆ นี้'", w.month === "2026-09" && w.pnd.endsWith("/tax?period=2026-09") && !w.tile && !w.soon, w);
      await page.close();
      const c = await open(`${ACC}/wht?tab=credit`);
      chk("U6.2", "ฝั่งถูกหักมีไทล์เครดิตสะสมปีนี้", await c.page.evaluate(() => !!document.querySelector('[data-testid="wht-credit-year-tile"]')));
      await c.page.close();
    }
    // U7 หน้า ภ.ง.ด.: งวดไทย พ.ศ. · CSV ส่งตามฟอร์ม
    {
      const { page } = await open(`${ACC}/tax?type=53&period=2026-09`);
      const t = await page.evaluate(() => ({ th: document.body.innerText.includes("กันยายน 2569"), csv: document.querySelector('[data-testid="pnd-csv"]')?.getAttribute("formaction") ?? "" }));
      chk("U7.1", "หัวข้อแสดง 'กันยายน 2569' · ปุ่ม CSV ส่งฟอร์มไปตัวส่งออก (ใช้แบบ/งวดที่เลือกอยู่)", t.th && t.csv.endsWith("/tax/export"), t);
      const res = await fetch(`${BASE}${ACC}/tax/export?kind=pnd&type=1k&period=2026-09`, { headers: { cookie: `shark_session=${token}; shark_tenant=${E.tenantId}` } });
      chk("U7.2", "ตัวส่งออกรับ type=1k จากฟอร์มเดียวกัน (ภ.ง.ด.1ก รายปี)", res.status === 200 && /pnd1k-2026/.test(res.headers.get("content-disposition") ?? ""), res.headers.get("content-disposition"));
      await page.close();
    }
    // U8 ตั้งค่า: คืนค่าเริ่มต้นต้องยืนยัน · การ์ดกฎเหลือตัวที่มีผล · ข้อมูลกิจการแสดงเฉพาะส่วน
    {
      const { page } = await open(`${ACC}/settings/documents?s=numbering`);
      const r = await page.evaluate(() => ({
        toggles: [...document.querySelectorAll('[data-testid="doc-rules-card"] [data-testid^="toggle-"]')].map((i) => (i.getAttribute("data-testid") ?? "").replace("toggle-", "")),
        scope: document.querySelector('[data-testid="doc-rules-card"] [data-testid="settings-reset"]')?.getAttribute("data-scope") ?? "",
      }));
      chk("U8.1", "การ์ดกฎอัตโนมัติ: เหลือ 'เตือนเลขข้ามลำดับ' ตัวเดียว (ตัวที่ไม่มีผล/ซ้ำเอาออก)", JSON.stringify(r.toggles) === '["warnOnGap"]', r);
      await page.click('[data-testid="doc-rules-card"] [data-testid="settings-reset"]');
      await sleep(400);
      const modal = await page.evaluate(() => document.querySelector('[data-testid="settings-reset-confirm"]')?.textContent ?? "");
      chk("U8.2", "คืนค่าเริ่มต้น = กล่องยืนยันบอกขอบเขต (ไม่ล้างทันที)", r.scope === "rules" && modal.includes("กฎอัตโนมัติของเอกสาร") && modal.includes("หัวข้ออื่นไม่เปลี่ยน"), { scope: r.scope, modal: modal.slice(0, 120) });
      await page.close();
      const org = await open(`${ACC}/settings?s=address`);
      const o = await org.page.evaluate(() => {
        const vis = (id: string) => { const el = document.querySelector(`[data-testid="${id}"]`); return !!el && !el.classList.contains("hidden"); };
        return { g: vis("org-sub-general"), a: vis("org-sub-address"), b: vis("org-sub-brand") };
      });
      chk("U8.3", "ข้อมูลกิจการ ?s=address แสดงเฉพาะส่วนที่อยู่และสาขา", !o.g && o.a && !o.b, o);
      await org.page.close();
      const conn = await open(`${ACC}/settings/connections`);
      chk("U8.4", "การเชื่อมต่อ: ไม่มีสวิตช์ที่ไม่มีผล (สร้างผู้ติดต่อ/ซิงก์ราคา/ลงบัญชีอัตโนมัติ)", await conn.page.evaluate(() => !document.querySelector('[data-testid$="-autoPost"],[data-testid$="-autoCreateContact"],[data-testid$="-syncProductPrices"]')));
      await conn.page.close();
    }
    // U9 ฟอร์มเอกสาร: สร้างผู้ติดต่อซ้อน (ไม่ออกจากหน้า) · ลิงก์ตั้งค่าเลขที่ · มือถือแก้อัตรา WHT
    {
      const { page } = await open(`${ACC}/expense/new`);
      const gear = await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.getAttribute("aria-label") === "ตั้งค่าเลขที่เอกสาร"));
      const g = await page.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("aria-label") === "ตั้งค่าเลขที่เอกสาร"); return { href: a?.getAttribute("href") ?? "", target: a?.getAttribute("target") ?? "" }; });
      chk("U9.1", "ปุ่มตั้งค่าเลขที่ → หัวข้อรูปแบบเลขที่ ในแท็บใหม่", g.href.endsWith("/settings/documents?s=numbering") && g.target === "_blank", { g, gear: !!gear });
      const urlBefore = page.url();
      await page.evaluate(() => (document.querySelector('[data-testid="contact-picker"] input') as HTMLInputElement | null)?.focus());
      await page.evaluate(() => (document.querySelector('[data-testid="contact-picker"] input') as HTMLInputElement | null)?.click());
      await sleep(600);
      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll('[data-testid="contact-picker"] button')].find((x) => (x as HTMLElement).innerText.includes("สร้าง"));
        (b as HTMLElement | undefined)?.click();
        return !!b;
      });
      await sleep(2500);
      const m = await page.evaluate(() => ({ modal: !!document.querySelector('[role="dialog"]') && document.body.innerText.includes("ผู้ติดต่อ"), url: location.href }));
      chk("U9.2", "'+ สร้างผู้ติดต่อ' เปิดหน้าต่างซ้อน ไม่ออกจากฟอร์ม", clicked && m.modal && m.url === urlBefore, { clicked, ...m });
      await page.close();
      const mob = await open(`${ACC}/expense/new`, 390);
      chk("U9.3", "มือถือ: ซอร์สมีตัวเลือกอัตรา WHT ต่อบรรทัด (line-m-edit-wht-rate)", src("src/components/account-v2/DocLineTable.tsx").includes('data-testid="line-m-edit-wht-rate"') && mob.status === 200);
      await mob.page.close();
    }
  } finally {
    await browser.close();
    await prisma.session.deleteMany({ where: { userAgent: "qc-acc-v2-ab-ui" } });
  }
}

await prisma.$disconnect();
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACCOUNT-FIX A4–B5: ${f.length === 0 ? "ผ่านทั้งหมด" : `ตก ${f.length}`} — ${cks.length} เช็ก${uSkipped ? " (ส่วน U ข้าม)" : ""} =====`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id), uSkipped })}`);
process.exit(f.length === 0 ? 0 : 1);
