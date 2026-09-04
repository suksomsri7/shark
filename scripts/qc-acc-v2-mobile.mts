// QC WO 9.1 — มือถือทำงานได้จริง: 4 งานจบบนมือถือ (DESIGN-SPEC-V2 §13 · เฟรม g17-g20 · BLUEPRINT §3 เกณฑ์ผ่าน 9.1)
//
// requires: acc-v2-seed (SIAM DIVE QC + scripts/acc-v2-expected.json — ดู scripts/seed-acc-v2-qc.mts)
//
// 🔴 ต่างจาก qc-*.mts ตัวอื่นในโฟลเดอร์นี้: ไฟล์นี้ขับ puppeteer ผ่าน **เซิร์ฟเวอร์ QC ที่ build+start แล้วจริง**
//    (แบบเดียวกับ scripts/visual-acc-v2.mts) ไม่ใช่แค่เรียก service ตรง ๆ ผ่าน prisma — เพราะต้องพิสูจน์ว่า
//    "กดจริงบนจอ 390px" ใช้งานได้ ไม่ใช่แค่ตรรกะฝั่งเซิร์ฟเวอร์ถูก
//    ⇒ ต้องมี `bash scripts/acc-v2-serve.sh` ทำงานอยู่ที่ :3215 ก่อนรันไฟล์นี้เสมอ
//    ถ้าเซิร์ฟเวอร์ไม่ตอบ ไฟล์นี้ **SKIP แบบเห็นชัด (exit 0)** ไม่ใช่ล้มถาวร — กัน `pnpm qc:all`/CI แดงค้าง
//    ตามบทเรียน WO 0.7 (ชุดที่ต้องพึ่ง infra ที่ CI ไม่มี ต้องข้ามให้เห็น ไม่ใช่ทำเนียนว่าผ่าน)
//
// รัน (บังคับ DB QC branch + เซิร์ฟเวอร์ QC):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   bash scripts/acc-v2-serve.sh
//   pnpm exec tsx scripts/qc-acc-v2-mobile.mts
//   bash scripts/acc-v2-serve.sh stop
//
// ครอบคลุม 4 งานจบบนมือถือ (390×844 · เกณฑ์ผ่าน BLUEPRINT WO 9.1):
//   J1  สร้างใบแจ้งหนี้ 2 รายการจากฟอร์มมือถือ (accordion จริง) → อนุมัติ → ได้เลขที่ (DOM+DB)
//   J2  รับชำระผ่านแผ่นมือถือ (SlideOver payment sheet) → สถานะ PAID (DOM+DB)
//   J3  ถ่ายบิลผ่านช่องกล้องกล่องขาเข้า (fixture jpg) → ปรากฏในกล่องขาเข้า (DOM+DB)
//   J4  เปิดใบสั่งซื้อเกินเพดานผู้อนุมัติ → อนุมัติ → ถูกปฏิเสธพร้อมข้อความไทย → OWNER อนุมัติสำเร็จ (DOM+DB)
// ทุกจอที่เปิดต้องไม่ล้นแนวนอน (scrollWidth ≤ 390) + ปุ่มหลักสูง/กว้าง ≥ 40px (touch target)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string; source: "file" | "ci" };
  QC: { tenantName: string; ownerEmail: string; expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { prisma } = await import("@/lib/core/db");

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => { passed++; console.log("  ✅ " + name); };
const bad = (name: string, detail: string) => { findings.push(`${name} — ${detail}`); console.log("  ❌ " + name + " — " + detail); };
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));

console.log(`\n===== QC WO 9.1 · มือถือทำงานได้จริง =====`);
console.log(`[env] DB ${host}\n`);

const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 2 } as const;

// ── ด่านเซิร์ฟเวอร์: ไม่ตอบ = SKIP ทั้งไฟล์ (ไม่ทำ qc:all แดงถาวรเพราะไม่มี build/server ให้) ──
async function serverUp(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/login`, { redirect: "manual" });
    return r.status > 0;
  } catch {
    return false;
  }
}
if (!(await serverUp())) {
  console.log(`⚠️  SKIPPED — ไม่พบเซิร์ฟเวอร์ QC ที่ ${BASE} (ต้อง \`bash scripts/acc-v2-serve.sh\` ก่อน — ไฟล์นี้ต้องมีเซิร์ฟเวอร์ build+start จริงเหมือน visual-acc-v2.mts ไม่ใช่แค่ DB)`);
  console.log(`\nJSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  await prisma.$disconnect();
  process.exit(0);
}

const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as {
  tenantId: string;
  systemId: string;
  ownerUserId: string;
  fixtures: { contactNattapholId: string; contactNattapholDocNo?: string };
};
const SYS = E.systemId;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// ── กันซากจากรอบที่ล้มกลางคัน (แบบเดียวกับ visual-acc-v2.mts fixture ของ WO 1.3/1.4): ลบเอกสาร/ไฟล์ที่มี
//    ข้อความเฉพาะของ QC มือถือค้างจาก run ก่อนหน้าที่ตายกลางทาง — ก่อนเริ่ม 4 งานใหม่เสมอ ──
async function purgeStale() {
  const staleLines = await prisma.accountDocumentLine.findMany({
    where: { document: { systemId: SYS }, description: { in: ["ทริปดำน้ำเกาะเฮ ครึ่งวัน", "QC 9.1 — อุปกรณ์ดำน้ำล็อตใหญ่เกินเพดาน"] } },
    select: { documentId: true },
  });
  const ids = [...new Set(staleLines.map((l) => l.documentId))];
  for (const id of ids) {
    // ดู cleanupDoc() ด้านล่าง — JV ของการชำระผูก refId=paymentId ไม่ใช่ documentId ต้องลบทั้งคู่
    const paymentIds = (await prisma.accountDocumentPayment.findMany({ where: { documentId: id }, select: { id: true } })).map((p) => p.id);
    const refIds = [id, ...paymentIds];
    await prisma.accountJournalLine.deleteMany({ where: { entry: { systemId: SYS, refId: { in: refIds } } } });
    await prisma.accountJournalEntry.deleteMany({ where: { systemId: SYS, refId: { in: refIds } } });
    await prisma.accountDocumentPayment.deleteMany({ where: { documentId: id } });
    await prisma.accountDocumentRelation.deleteMany({ where: { OR: [{ fromId: id }, { toId: id }] } });
    await prisma.accountDocumentLine.deleteMany({ where: { documentId: id } });
    await prisma.accountDocument.deleteMany({ where: { id } });
  }
  const staleAttach = await prisma.accountAttachment.deleteMany({
    where: { systemId: SYS, status: "UNLINKED", fileName: "bill-ptt.jpg" },
  });
  if (ids.length || staleAttach.count) {
    console.log(`🧹 ล้างซากจาก run ก่อนหน้า: เอกสาร ${ids.length} ใบ · ไฟล์แนบ ${staleAttach.count} ไฟล์`);
  }
}
await purgeStale();

// ── mint session จริงต่อผู้ใช้ (คนละ token ต่อ job ที่ต้องสลับตัว) — ลบทิ้งใน finally เสมอ ──
const UA = "qc-acc-v2-mobile";
const mintedTokens: string[] = [];
async function mintSession(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`ไม่พบผู้ใช้ ${email} — รัน seed ก่อน`);
  const token = "accv2mob" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl } });
  mintedTokens.push(token);
  return token;
}

const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
const browser = await pptr.default.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-accv2-mobile-${process.pid}`],
});
// puppeteer-core ไม่ใช่ dependency ตรงของรีโปนี้ (โหลดจาก /root/dive3d) — ไม่มี type ให้ import ตรง ๆ
// (เหมือน visual-acc-v2.mts) ⇒ อนุมานชนิด Page จากค่าที่ browser.newPage() คืนจริงแทน
type Pg = Awaited<ReturnType<typeof browser.newPage>>;

const https = BASE.startsWith("https:");
const host2 = new URL(BASE).hostname;
async function newPageAs(token: string, tenantId: string) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
  await page.setViewport(VIEWPORT);
  const cookies = https
    ? [
        { name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true },
        { name: "shark_tenant", value: tenantId, url: BASE, path: "/", secure: true },
      ]
    : [
        { name: "shark_session", value: token, domain: host2, path: "/" },
        { name: "shark_tenant", value: tenantId, domain: host2, path: "/" },
      ];
  await page.setCookie(...cookies);
  return page;
}

// ── ตัวช่วยรอ+คลิกผ่าน DOM ตรง ๆ (ไม่ผ่าน page.click พิกัด — กันแถบ sticky/orb ดักคลิก บทเรียน WO 1.6 รอบ 4) ──
async function waitFor(page: Pg, sel: string, timeoutMs = 8000): Promise<boolean> {
  const steps = Math.ceil(timeoutMs / 200);
  for (let i = 0; i < steps; i++) {
    const seen = await page.evaluate((s: string) => !!document.querySelector(s), sel).catch(() => false);
    if (seen) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
async function clickDom(page: Pg, sel: string): Promise<boolean> {
  const el = await page.$(sel);
  if (!el) return false;
  await page.evaluate((s: string) => document.querySelector<HTMLElement>(s)?.scrollIntoView({ block: "center" }), sel);
  await page.evaluate((s: string) => (document.querySelector(s) as HTMLElement | null)?.click(), sel);
  await new Promise((r) => setTimeout(r, 250));
  return true;
}
async function typeInto(page: Pg, sel: string, text: string): Promise<boolean> {
  const el = await page.$(sel);
  if (!el) return false;
  // โฟกัส+เลือกทั้งหมดผ่าน DOM ตรง ๆ (ไม่ใช่ page.click พิกัด) — เจอจริงระหว่างพัฒนา WO นี้:
  // การ์ดรายการมือถือมี ProductPicker ที่เปิด dropdown ค้าง (ไม่ปิดด้วย Tab เพราะปิดด้วย mousedown-outside
  // เท่านั้น) ซึ่งวาดทับช่องราคาด้านล่างพอดี (z-20) ⇒ page.click พิกัดไปโดน dropdown แทนช่องราคาจริง
  // (บทเรียนเดียวกับ WO 1.6 รอบ 4 — คลิกพิกัดโดนแถบ sticky บัง คนละอาการ อาการเดียวกัน) → โฟกัสด้วย
  // DOM ตรง ๆ ไม่สนใจว่ามีอะไรวาดทับอยู่บนจอ ณ ตำแหน่งนั้นหรือไม่
  await page.evaluate((s: string) => {
    const input = document.querySelector<HTMLInputElement>(s);
    input?.scrollIntoView({ block: "center" });
    input?.focus();
    input?.select();
  }, sel);
  await page.keyboard.type(text, { delay: 20 });
  // MoneyInput ยืนยันค่าตอน blur ไม่ใช่ onChange (ดูคอมเมนต์ในไฟล์ MoneyInput.tsx) — ต้องกด Tab เสมอ
  // (บทเรียนเดียวกับ visual-acc-v2.mts flow executor — พลาดจุดนี้ทำให้ราคาที่พิมพ์ไม่ถูกบันทึกจริง)
  await page.keyboard.press("Tab").catch(() => {});
  await new Promise((r) => setTimeout(r, 250));
  return true;
}
/** ปิด dropdown ค้นหาที่อาจค้างเปิดอยู่ (ContactPicker/ProductPicker ปิดด้วย mousedown-outside เท่านั้น
 *  ไม่ใช่ blur/Tab ธรรมดา) — เรียกหลังกรอกช่องค้นหาที่ไม่ได้ตั้งใจเลือกผลลัพธ์ ก่อนไปแตะช่องถัดไปที่dropdown อาจวาดทับ */
async function closeAnyDropdown(page: Pg) {
  await page.evaluate(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))).catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
}

/** ไม่ล้นแนวนอน + ปุ่มหลักที่ระบุ (ถ้ามี) ต้อง ≥40px ทั้งสองด้าน */
async function probeOverflowAndTouch(page: Pg, label: string, primarySel?: string) {
  const r = await page.evaluate((sel: string | undefined) => {
    const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    let rect: { width: number; height: number } | null = null;
    if (sel) {
      const el = document.querySelector(sel);
      if (el) {
        const b = el.getBoundingClientRect();
        rect = { width: b.width, height: b.height };
      }
    }
    return { overflow, rect };
  }, primarySel);
  assert(`[${label}] ไม่ล้นแนวนอน (390px)`, r.overflow === 0, `เกิน ${r.overflow}px`);
  if (primarySel) {
    assert(
      `[${label}] ปุ่มหลัก ${primarySel} touch target ≥40px`,
      !!r.rect && r.rect.width >= 40 && r.rect.height >= 40,
      r.rect ? `ได้ ${r.rect.width.toFixed(0)}×${r.rect.height.toFixed(0)}` : "ไม่พบปุ่ม",
    );
  }
}

// ═══════════════════════════ J1 — สร้างใบแจ้งหนี้ 2 รายการจากฟอร์มมือถือ → อนุมัติ ═══════════════════════════
let j1DocId = "";
try {
  const token = await mintSession(QC.ownerEmail);
  const page = await newPageAs(token, E.tenantId);
  await page.goto(`${BASE}/app/sys/${SYS}/account/docs/INVOICE/new`, { waitUntil: "networkidle0" });
  assert("[J1] เปิดฟอร์มใบแจ้งหนี้มือถือ (accordion) สำเร็จ", await waitFor(page, '[data-testid="doc-editor-v2"]'));

  // WO 9.1 รอบ 2 (§13 · g17): ส่วนหัวเอกสารบนมือถือเป็นแถวสรุปที่ต้องแตะเปิดแผ่นเต็มจอก่อนถึงจะกรอกได้
  // (ContactPicker ไม่ได้อยู่บนหน้าตรง ๆ แล้ว) — แตะแถว "ผู้ติดต่อ" → แผ่น "sheet-contact" เปิด → ค้นหา+เลือก (ปิดแผ่นเองเมื่อเลือก)
  assert("[J1] แตะแถวผู้ติดต่อเปิดแผ่นเลือกผู้ติดต่อ", await clickDom(page, '[data-testid="fld-contact-row"]'));
  assert("[J1] แผ่นผู้ติดต่อเปิดจริง", await waitFor(page, '[data-testid="sheet-contact"]', 3000));
  assert("[J1] พิมพ์ค้นหาผู้ติดต่อได้", await typeInto(page, '[data-testid="contact-picker-m-input"]', "ณัฐพล"));
  const gotResult = await waitFor(page, '[data-testid="sheet-contact"] [role="listbox"] button[role="option"]', 5000);
  assert("[J1] ผลค้นหาผู้ติดต่อขึ้นจริง", gotResult);
  if (gotResult) {
    await page.evaluate(() =>
      (document.querySelector('[data-testid="sheet-contact"] [role="listbox"] button[role="option"]') as HTMLElement | null)?.click(),
    );
    await new Promise((r) => setTimeout(r, 300));
  }
  assert("[J1] เลือกแล้วแผ่นผู้ติดต่อปิดเอง (onSelect ปิดแผ่น)", await waitFor(page, '[data-testid="sheet-contact"]', 1500).then((v) => !v));
  const contactVal = await page.evaluate(() => document.querySelector('[data-testid="fld-contact-row"]')?.textContent ?? "");
  assert("[J1] เลือกผู้ติดต่อแล้วชื่อขึ้นในแถวสรุป", contactVal.includes("ณัฐพล"), `ได้ "${contactVal}"`);

  // บรรทัดที่ 1 (มีอยู่แล้วโดยฟอร์มเปล่า) — การ์ดตอนนี้ "อ่านอย่างเดียว" ต้องเปิดเมนู ⋯ → แก้ไข → แผ่นเต็มจอ ถึงจะกรอกได้
  assert("[J1] เปิดเมนู ⋯ ของการ์ดบรรทัดที่ 1", await clickDom(page, '[data-testid="line-m-0-actions"] button'));
  assert("[J1] เมนูเปิดจริง", await waitFor(page, '[data-testid="line-m-0-actions-menu"]', 3000));
  assert(
    "[J1] กด \"แก้ไข\"",
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('[data-testid="line-m-0-actions-menu"] button')].find((b) => b.textContent?.trim() === "แก้ไข");
      (btn as HTMLElement | undefined)?.click();
      return !!btn;
    }),
  );
  assert("[J1] แผ่นแก้ไขรายการที่ 1 เปิดจริง", await waitFor(page, '[data-testid="line-edit-sheet"]', 3000));
  assert("[J1] กรอกชื่อรายการที่ 1", await typeInto(page, '[data-testid="line-m-edit-product-input"]', "ทริปดำน้ำเกาะเฮ ครึ่งวัน"));
  await closeAnyDropdown(page); // ปิด dropdown ค้นหาสินค้าที่เปิดค้าง กันวาดทับช่องราคาด้านล่างในแผ่นเดียวกัน
  assert("[J1] กรอกราคาต่อหน่วยรายการที่ 1", await typeInto(page, '[data-testid="line-m-edit-price"]', "1500"));
  assert("[J1] กดเสร็จ ปิดแผ่นแก้ไขรายการที่ 1", await clickDom(page, '[data-testid="line-edit-done"]'));

  // เพิ่มบรรทัดที่ 2 — ปุ่มเต็มกว้างเส้นประ (§13) กดแล้วเปิดแผ่นแก้ไขของบรรทัดใหม่ให้เองทันที
  assert("[J1] กดปุ่ม + เพิ่มรายการ (เต็มกว้างเส้นประตาม §13)", await clickDom(page, '[data-testid="line-add-mobile"]'));
  assert("[J1] การ์ดบรรทัดที่ 2 ขึ้นจริง", await waitFor(page, '[data-testid="line-m-1"]'));
  assert("[J1] แผ่นแก้ไขรายการที่ 2 เปิดเองหลังกด +", await waitFor(page, '[data-testid="line-edit-sheet"]', 3000));
  assert("[J1] กรอกชื่อรายการที่ 2", await typeInto(page, '[data-testid="line-m-edit-product-input"]', "ค่าเช่าอุปกรณ์ดำน้ำ"));
  await closeAnyDropdown(page);
  assert("[J1] กรอกราคาต่อหน่วยรายการที่ 2", await typeInto(page, '[data-testid="line-m-edit-price"]', "500"));
  assert("[J1] กดเสร็จ ปิดแผ่นแก้ไขรายการที่ 2", await clickDom(page, '[data-testid="line-edit-done"]'));

  await probeOverflowAndTouch(page, "J1 ฟอร์มก่อนอนุมัติ", '[data-testid="btn-approve-m"]');

  // มือถือ (g17 รอบ 2): ปุ่ม "อนุมัติ" กดแล้วยิง action ตรง ไม่มีเมนูย่อยเหมือนเดสก์ท็อป
  assert("[J1] กด \"อนุมัติ\"", await clickDom(page, '[data-testid="btn-approve-m"]'));

  // รอ redirect ไปหน้าเอกสาร (URL ไม่มี /new หรือ /edit แล้ว)
  let redirected = false;
  for (let i = 0; i < 40; i++) {
    const url = page.url();
    if (/\/account\/docs\/INVOICE\/[a-z0-9]+$/i.test(url) && !url.includes("/new")) { redirected = true; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  assert("[J1] อนุมัติแล้ว redirect ไปหน้าเอกสาร", redirected, `url จริง: ${page.url()}`);
  j1DocId = redirected ? (page.url().split("/").pop() ?? "") : "";

  if (j1DocId) {
    const docNoText = await page.evaluate(() => document.querySelector('[data-testid="doc-h1"]')?.textContent?.trim() ?? "");
    // รูปแบบเลขที่ปรับได้ต่อร้าน (§9.2 ตั้งค่าเอกสาร WO 8.1 — QC ตั้ง sequences.INVOICE เป็น "INV-{yy}{mm}-{0000}")
    // ⇒ เช็คแค่ว่าออกเลขจริงแล้ว (ไม่ใช่ "(ร่าง)" placeholder) ไม่ผูกกับ pattern ตายตัว
    assert("[J1] มีเลขที่เอกสารจริงบนจอ (ไม่ใช่ placeholder ร่าง)", !!docNoText && docNoText !== "(ร่าง)", `เจอ "${docNoText}"`);

    const dbDoc = await prisma.accountDocument.findUnique({
      where: { id: j1DocId },
      include: { lines: true },
    });
    assert("[J1·DB] เอกสารมีจริงใน DB", !!dbDoc);
    assert("[J1·DB] เลขที่ออกแล้ว (docNo ไม่ว่าง)", !!dbDoc?.docNo);
    assert("[J1·DB] สถานะไม่ใช่ร่างอีกต่อไป", !!dbDoc && dbDoc.status !== "DRAFT", `สถานะจริง: ${dbDoc?.status}`);
    assert("[J1·DB] มี 2 รายการตามที่กรอกจากมือถือ", dbDoc?.lines.length === 2, `ได้ ${dbDoc?.lines.length} รายการ`);
    assert("[J1·DB] ยอดรวม > 0 (คิดจาก 1,500+500 บวก VAT)", (dbDoc?.grandTotal ?? 0) > 0);
  }
  await page.close();
} catch (e) {
  bad("[J1] สร้างใบแจ้งหนี้จากมือถือ", e instanceof Error ? e.message : String(e));
}

// ═══════════════════════════ J2 — รับชำระผ่านแผ่นมือถือ (SlideOver) → PAID ═══════════════════════════
try {
  if (!j1DocId) throw new Error("ข้าม — J1 ไม่ได้เอกสารมา");
  const token = await mintSession(QC.ownerEmail);
  const page = await newPageAs(token, E.tenantId);
  await page.goto(`${BASE}/app/sys/${SYS}/account/docs/INVOICE/${j1DocId}`, { waitUntil: "networkidle0" });
  const statusBefore = await page.evaluate(() => document.querySelector('[data-testid="doc-status"]')?.textContent?.trim() ?? "");
  assert("[J2] เปิดหน้าเอกสารมือถือ เห็นสถานะก่อนชำระ", !!statusBefore, `สถานะ: "${statusBefore}"`);

  assert("[J2] กดปุ่ม รับชำระ (เปิดแผ่นเต็มจอ SlideOver)", await clickDom(page, '[data-testid="btn-open-payment"]'));
  assert("[J2] แผ่นรับชำระเต็มจอเปิดจริง", await waitFor(page, '[data-testid="payment-slideover"]', 5000));
  await probeOverflowAndTouch(page, "J2 แผ่นรับชำระมือถือ", '[data-testid="btn-record-payments"]');

  // กล่องรับชำระตั้งยอดเต็ม+ช่องทางเริ่มต้นให้อัตโนมัติแล้ว (newPayBox) — กดบันทึกได้ทันที
  const canRecord = await waitFor(page, '[data-testid="btn-record-payments"]:not([disabled])', 5000);
  assert("[J2] ปุ่มบันทึกการชำระใช้งานได้ (ไม่ disabled)", canRecord);
  assert("[J2] กดบันทึกการชำระ", await clickDom(page, '[data-testid="btn-record-payments"]'));

  const gotOk = await waitFor(page, '[data-testid="pay-ok"]', 6000);
  assert("[J2] ขึ้นข้อความบันทึกสำเร็จในแผ่น", gotOk);

  await new Promise((r) => setTimeout(r, 500));
  await page.close();

  const dbDoc = await prisma.accountDocument.findUnique({ where: { id: j1DocId }, include: { payments: true } });
  assert("[J2·DB] สถานะเป็น PAID หลังรับชำระเต็มจำนวน", dbDoc?.status === "PAID", `สถานะจริง: ${dbDoc?.status}`);
  assert("[J2·DB] มีแถวการชำระอย่างน้อย 1 ครั้ง", (dbDoc?.payments.length ?? 0) >= 1);
} catch (e) {
  bad("[J2] รับชำระผ่านแผ่นมือถือ", e instanceof Error ? e.message : String(e));
}

// ═══════════════════════════ J3 — ถ่ายบิลผ่านกล้อง (กล่องขาเข้า) → ปรากฏในรายการ ═══════════════════════════
let j3AttachmentId = "";
try {
  const token = await mintSession(QC.ownerEmail);
  const page = await newPageAs(token, E.tenantId);
  await page.goto(`${BASE}/app/sys/${SYS}/account/documents/inbox`, { waitUntil: "networkidle0" });
  assert("[J3] เปิดกล่องขาเข้ามือถือ", await waitFor(page, '[data-testid="inbox-capture-bar"]'));
  await probeOverflowAndTouch(page, "J3 กล่องขาเข้ามือถือ", '[data-testid="inbox-capture-btn"]');

  const before = await prisma.accountAttachment.count({ where: { systemId: SYS, status: "UNLINKED" } });

  // จำลอง "ถ่ายบิล" — input ที่แท้จริงมี accept=image/* capture=environment (g20) · uploadFile ผ่าน DevTools
  // ทำงานได้แม้ input จะซ่อนด้วย .hidden (ปุ่มดำครอบ ref คลิกจริงเปิดกล้อง — เทสนี้ยิงเข้า input ตรง ๆ แทนกล้องจริง)
  const camInput = await page.$('[data-testid="inbox-capture-input"]');
  assert("[J3] พบช่องอัปโหลดกล้อง (accept=image/* capture=environment)", !!camInput);
  if (camInput) {
    await camInput.uploadFile("scripts/fixtures/acc-v2/attach/bill-ptt.jpg");
  }
  const gotDone = await waitFor(page, '[data-testid="attachment-upload-ok"]', 15000);
  assert("[J3] อัปโหลดเสร็จ (แถบสถานะขึ้น 'เสร็จ')", gotDone);

  await new Promise((r) => setTimeout(r, 500));
  await page.close();

  const after = await prisma.accountAttachment.count({ where: { systemId: SYS, status: "UNLINKED" } });
  assert("[J3·DB] จำนวนไฟล์ในกล่องขาเข้าเพิ่มขึ้น 1", after === before + 1, `ก่อน ${before} · หลัง ${after}`);
  const newRow = await prisma.accountAttachment.findFirst({
    where: { systemId: SYS, status: "UNLINKED", fileName: "bill-ptt.jpg" },
    orderBy: { createdAt: "desc" },
  });
  assert("[J3·DB] ไฟล์ที่อัปโหลดหาเจอจริงในกล่องขาเข้า", !!newRow);
  j3AttachmentId = newRow?.id ?? "";
} catch (e) {
  bad("[J3] ถ่ายบิลผ่านกล่องขาเข้ามือถือ", e instanceof Error ? e.message : String(e));
}

// ═══════════════════════════ J4 — เปิด PO เกินเพดาน → ถูกปฏิเสธ → OWNER อนุมัติสำเร็จ ═══════════════════════════
let j4DocId = "";
try {
  const expense = await import("@/lib/modules/account/expense");
  const vendor = await prisma.accountContact.findFirst({ where: { systemId: SYS, kind: "VENDOR", archivedAt: null } });
  if (!vendor) throw new Error("ไม่พบผู้ขายใน tenant QC — รัน seed ก่อน");
  // เพดานผู้อนุมัติ QC = 50,000 บาท (5,000,000 สตางค์ · seed-acc-v2-qc.mts role2) → ตั้ง PO ให้เกินชัดเจน
  const po = await expense.createPurchaseOrder({
    tenantId: E.tenantId,
    systemId: SYS,
    docType: "PURCHASE_ORDER",
    contactId: vendor.id,
    issueDate: new Date(`${QC.today}T00:00:00.000Z`),
    lines: [{ description: "QC 9.1 — อุปกรณ์ดำน้ำล็อตใหญ่เกินเพดาน", qty: 1, unitName: "ชุด", unitPrice: 6_000_000, vatRateBp: 700 }],
    createdById: E.ownerUserId,
  });
  j4DocId = po.id;
  const submitted = await expense.submitForApproval(E.tenantId, SYS, po.id);
  if (!submitted.ok) throw new Error("ส่งอนุมัติ PO fixture ไม่สำเร็จ — " + submitted.reason);

  // เข้าเป็น approver@ (เพดาน 50,000) — เปิดหน้าเอกสารมือถือ กดอนุมัติ ต้องถูกปฏิเสธ
  const approverToken = await mintSession("approver@siamdive-qc.test");
  const pageA = await newPageAs(approverToken, E.tenantId);
  await pageA.goto(`${BASE}/app/sys/${SYS}/account/po/${po.id}`, { waitUntil: "networkidle0" });
  assert("[J4] approver เปิดหน้า PO บนมือถือเห็นปุ่มอนุมัติ", await waitFor(pageA, '[data-testid="btn-primary-action"] button'));
  await probeOverflowAndTouch(pageA, "J4 หน้า PO มือถือ (approver)", '[data-testid="btn-primary-action"] button');
  assert("[J4] approver กดอนุมัติ", await clickDom(pageA, '[data-testid="btn-primary-action"] button'));

  let sawErr = false;
  let errText = "";
  for (let i = 0; i < 30; i++) {
    errText = await pageA.evaluate(() => document.querySelector('[data-testid="doc-err"]')?.textContent?.trim() ?? "");
    if (errText) { sawErr = true; break; }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert("[J4] ถูกปฏิเสธพร้อมข้อความไทยบอกเพดาน (inline บนจอ)", sawErr && errText.includes("เพดาน"), `เจอ: "${errText}"`);
  await pageA.close();

  const afterRefuse = await prisma.accountDocument.findUnique({ where: { id: po.id } });
  assert("[J4·DB] เอกสารยังไม่ถูกอนุมัติ (ยังรออนุมัติ)", afterRefuse?.status === "AWAITING_APPROVAL", `สถานะจริง: ${afterRefuse?.status}`);

  // เข้าเป็น OWNER (ไม่มีเพดาน) — อนุมัติสำเร็จ
  const ownerToken = await mintSession(QC.ownerEmail);
  const pageO = await newPageAs(ownerToken, E.tenantId);
  await pageO.goto(`${BASE}/app/sys/${SYS}/account/po/${po.id}`, { waitUntil: "networkidle0" });
  assert("[J4] OWNER เปิดหน้าเดียวกันบนมือถือ กดอนุมัติ", await clickDom(pageO, '[data-testid="btn-primary-action"] button'));
  await new Promise((r) => setTimeout(r, 600));
  await pageO.close();

  const afterApprove = await prisma.accountDocument.findUnique({ where: { id: po.id } });
  assert("[J4·DB] OWNER อนุมัติสำเร็จ สถานะเปลี่ยนเป็น APPROVED", afterApprove?.status === "APPROVED", `สถานะจริง: ${afterApprove?.status}`);
} catch (e) {
  bad("[J4] อนุมัติ PO เกินเพดานจากมือถือ", e instanceof Error ? e.message : String(e));
}

// ═══════════════════════════ ทำความสะอาด (ลบข้อมูลทดสอบทั้งหมด — ไม่แตะของ seed) ═══════════════════════════
async function cleanupDoc(id: string) {
  if (!id) return;
  try {
    // 🔴 บั๊กที่เจอจริงระหว่างพัฒนา WO นี้: JV ของ "การรับชำระ" ผูก refId = **paymentId** ไม่ใช่ documentId
    // (ดู `gl.postPayment` → `commitEntry({ refType: "AccountDocumentPayment", refId: paymentId })`)
    // ⇒ ลบด้วย refId=documentId เฉย ๆ (เหมือนตอนออกเอกสาร) พลาด JV ของการชำระเงินไปเงียบ ๆ — ยอดคงเหลือ
    // ช่องทางการเงิน (คำนวณสดจาก JV) เพี้ยนถาวรเพราะ Dr/Cr ค้างอยู่แต่เอกสาร/การชำระถูกลบไปแล้ว
    // (จับได้จาก qc-acc-v2-dashboard P3.1/P3.2/P3.4/P10.11 แดงหลัง J2 รันสำเร็จ 2 ครั้งระหว่าง dev)
    // ⇒ ต้องลบ JV ของทั้ง 2 refType (เอกสาร + การชำระทุกครั้ง) ก่อนลบแถว payment ทิ้ง
    const paymentIds = (await prisma.accountDocumentPayment.findMany({ where: { documentId: id }, select: { id: true } })).map((p) => p.id);
    const refIds = [id, ...paymentIds];
    await prisma.accountJournalLine.deleteMany({ where: { entry: { systemId: SYS, refId: { in: refIds } } } });
    await prisma.accountJournalEntry.deleteMany({ where: { systemId: SYS, refId: { in: refIds } } });
    await prisma.accountDocumentPayment.deleteMany({ where: { documentId: id } });
    await prisma.accountDocumentRelation.deleteMany({ where: { OR: [{ fromId: id }, { toId: id }] } });
    await prisma.accountDocumentLine.deleteMany({ where: { documentId: id } });
    await prisma.accountDocument.deleteMany({ where: { id } });
  } catch (e) {
    console.log(`  ⚠️ ลบเอกสารทดสอบ ${id} ไม่สำเร็จ (เก็บกวาดมือ): ${e instanceof Error ? e.message : e}`);
  }
}
await cleanupDoc(j1DocId);
await cleanupDoc(j4DocId);
if (j3AttachmentId) {
  try {
    await prisma.accountAttachment.delete({ where: { id: j3AttachmentId } });
  } catch (e) {
    console.log(`  ⚠️ ลบไฟล์แนบทดสอบ ${j3AttachmentId} ไม่สำเร็จ (เก็บกวาดมือ): ${e instanceof Error ? e.message : e}`);
  }
}
if (mintedTokens.length) {
  await prisma.session.deleteMany({ where: { tokenHash: { in: mintedTokens.map(sha256) } } });
}
await browser.close();
console.log(`\n🧹 ลบข้อมูลทดสอบ + session ชั่วคราวแล้ว (ตัวนับแท็บ/เฉลยของ WO อื่นไม่เพี้ยน)`);

console.log(`\n===== QC WO 9.1 · มือถือทำงานได้จริง สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length} (รวม ${passed + findings.length} ข้อ)`);
if (findings.length) {
  console.log("\nพบปัญหา:");
  for (const f of findings) console.log("  - " + f);
}
console.log(`\nJSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, findings })}`);
await prisma.$disconnect();
process.exit(findings.length > 0 ? 1 : 0);
