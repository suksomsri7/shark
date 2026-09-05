// QC — API บัญชี WO A2: หน้า "ตั้งค่า › การเชื่อมต่อ › แอปภายนอก/API" สร้างคีย์ผูกสมุด + bundle/scope + หมดอายุ + หมุน (เบราว์เซอร์จริง)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §A2
//
// requires: acc-v2-seed (SIAM DIVE QC + scripts/acc-v2-expected.json)
// 🔴 ขับ puppeteer ผ่านเซิร์ฟเวอร์ QC ที่ build+start แล้ว (`bash scripts/acc-v2-serve.sh` :3215) — ไม่มีเซิร์ฟเวอร์ = SKIP (exit 0)
//
// data-testid ที่หน้าต้องมี (สัญญา UI):
//   api-key-name · api-key-bundle-<bundleId> (radio ×5) · api-key-ttl (select: 30/90/365/0) · api-key-scopes-toggle (ปุ่มกาง)
//   api-key-scope-<permissionKey> (checkbox รายตัว) · api-key-submit · api-key-new (กล่อง rawKey ครั้งเดียว)
//   api-key-row-<id> · api-key-row-bundle-<id> · api-key-row-expires-<id> · api-key-row-system-<id> · api-key-rotate-<id> · api-key-revoke-<id>
//   หน้า /app/settings/api: platform-api-key-account-link (ลิงก์ไปหน้าบัญชี) · api-key-row-scopes-<id>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string; source: "file" | "ci" };
  QC: { tenantName: string; ownerEmail: string; expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();
const { prisma } = await import("@/lib/core/db");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const scopesMod = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => { passed++; console.log("  ✅ " + name); };
const bad = (name: string, detail: string) => { findings.push(`${name} — ${detail}`); console.log("  ❌ " + name + " — " + detail); };
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));
console.log(`\n===== QC A2 · หน้าตั้งค่าคีย์ API ของบัญชี =====`);
console.log(`[env] DB ${host}\n`);
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
async function serverUp(): Promise<boolean> {
  try { const r = await fetch(`${BASE}/login`, { redirect: "manual" }); return r.status > 0; } catch { return false; }
}
if (!(await serverUp())) {
  console.log(`⚠️  SKIPPED — ไม่พบเซิร์ฟเวอร์ QC ที่ ${BASE} (ต้อง \`bash scripts/acc-v2-serve.sh\` ก่อน)`);
  console.log(`\nJSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  await prisma.$disconnect();
  process.exit(0);
}
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as { tenantId: string; systemId: string; ownerUserId: string };
const SYS = E.systemId;
const TID = E.tenantId;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const NAME1 = "QC A2 คีย์ระบบจอง";
const NAME2 = "QC A2 อ่านอย่างเดียว";
// ล้างซากจาก run ก่อน
await prisma.apiKey.deleteMany({ where: { tenantId: TID, name: { startsWith: "QC A2 " } } });

const mintedTokens: string[] = [];
async function mintSession(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`ไม่พบผู้ใช้ ${email} — รัน seed ก่อน`);
  const token = "accv2api" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), userAgent: "qc-account-api-settings", idleExpiresAt: ttl, expiresAt: ttl } });
  mintedTokens.push(token);
  return token;
}
const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
const browser = await pptr.default.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-accv2-apiset-${process.pid}`],
});
type Pg = Awaited<ReturnType<typeof browser.newPage>>;
const host2 = new URL(BASE).hostname;
async function newPageAs(token: string, width: number) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await page.setCookie(
    { name: "shark_session", value: token, domain: host2, path: "/" },
    { name: "shark_tenant", value: TID, domain: host2, path: "/" },
  );
  return page;
}
const sel = (id: string) => `[data-testid="${id}"]`;
async function waitFor(page: Pg, s: string, timeoutMs = 10000): Promise<boolean> {
  for (let i = 0; i < Math.ceil(timeoutMs / 200); i++) {
    const seen = await page.evaluate((q: string) => !!document.querySelector(q), s).catch(() => false);
    if (seen) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
const text = (page: Pg, s: string) => page.evaluate((q: string) => (document.querySelector(q)?.textContent ?? "").trim(), s).catch(() => "");
const click = (page: Pg, s: string) => page.evaluate((q: string) => { const el = document.querySelector(q) as HTMLElement | null; if (!el) return false; el.click(); return true; }, s);
const exists = (page: Pg, s: string) => page.evaluate((q: string) => !!document.querySelector(q), s).catch(() => false);
const checked = (page: Pg, s: string) => page.evaluate((q: string) => (document.querySelector(q) as HTMLInputElement | null)?.checked ?? null, s).catch(() => null);
const value = (page: Pg, s: string) => page.evaluate((q: string) => (document.querySelector(q) as HTMLInputElement | HTMLSelectElement | null)?.value ?? null, s).catch(() => null);
const setSelect = (page: Pg, s: string, v: string) => page.evaluate((q: string, val: string) => { const el = document.querySelector(q) as HTMLSelectElement | null; if (!el) return false; el.value = val; el.dispatchEvent(new Event("change", { bubbles: true })); return true; }, s, v);
const url = `${BASE}/app/sys/${SYS}/account/settings/connections?s=api`;

try {
  const token = await mintSession(QC.ownerEmail);
  const page = await newPageAs(token, 1440);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  assert("S1.1 เปิดแท็บแอปภายนอก/API ได้ (มี connections-api)", await waitFor(page, sel("connections-api")), "ไม่พบ connections-api");
  const bundleIds = (scopesMod.API_SCOPE_BUNDLES as { id: string; scopes: string[] }[]).map((b) => b.id);
  let allRadios = true;
  for (const id of bundleIds) if (!(await exists(page, sel(`api-key-bundle-${id}`)))) allRadios = false;
  assert("S1.2 ฟอร์มมี radio bundle ครบ 5 ชุด", allRadios, `ขาดบางตัวจาก ${bundleIds.join(",")}`);
  assert("S1.3 default bundle = issue-and-collect", (await checked(page, sel("api-key-bundle-issue-and-collect"))) === true, "ไม่ถูกเลือก");
  assert("S1.4 select หมดอายุ default 365", (await value(page, sel("api-key-ttl"))) === "365", `ค่า ${await value(page, sel("api-key-ttl"))}`);
  assert("S1.5 มีปุ่มกาง scope รายตัว", await exists(page, sel("api-key-scopes-toggle")), "ไม่พบ api-key-scopes-toggle");
  await click(page, sel("api-key-scopes-toggle"));
  await waitFor(page, sel("api-key-scope-account.doc.view"), 4000);
  const icScopes = scopesMod.expandBundles(["issue-and-collect"]) as string[];
  let preChecked = true;
  for (const s of icScopes) if ((await checked(page, sel(`api-key-scope-${s}`))) !== true) preChecked = false;
  assert("S1.6 กาง scope: ทุก scope ของ issue-and-collect ถูกติ๊กไว้", preChecked, "บางตัวไม่ถูกติ๊ก");
  assert("S1.7 scope อันตราย (account.doc.void) ไม่ถูกติ๊ก", (await checked(page, sel("api-key-scope-account.doc.void"))) === false, `${await checked(page, sel("api-key-scope-account.doc.void"))}`);
  // เปลี่ยน bundle → ติ๊กเปลี่ยนตาม
  await click(page, sel("api-key-bundle-read-only"));
  await new Promise((r) => setTimeout(r, 300));
  assert("S1.8 เลือก bundle read-only → account.doc.create ถูกเอาออก", (await checked(page, sel("api-key-scope-account.doc.create"))) === false, "ยังติ๊กอยู่");
  await click(page, sel("api-key-bundle-issue-and-collect"));
  await new Promise((r) => setTimeout(r, 300));

  // ── สร้างคีย์ 1: default ──
  await page.type(sel("api-key-name"), NAME1);
  await click(page, sel("api-key-submit"));
  assert("S2.1 กดสร้าง → กล่อง rawKey โผล่", await waitFor(page, sel("api-key-new"), 15000), "ไม่พบ api-key-new");
  const raw1 = await text(page, sel("api-key-new"));
  const rawMatch = /shark_[0-9a-f]{64}/.exec(raw1);
  assert("S2.2 rawKey รูปแบบ shark_ + 64 hex", !!rawMatch, raw1.slice(0, 80));
  const row1 = await prisma.apiKey.findFirst({ where: { tenantId: TID, name: NAME1 }, orderBy: { createdAt: "desc" } }) as Any;
  assert("S2.3 DB: คีย์ผูกสมุดเล่มนี้ (systemId = SYS)", row1?.systemId === SYS, `${row1?.systemId}`);
  const scopes1 = Array.isArray(row1?.scopesJson) ? [...(row1.scopesJson as string[])].sort() : [];
  assert("S2.4 DB: scopes = issue-and-collect ทั้งชุด", JSON.stringify(scopes1) === JSON.stringify([...icScopes].sort()), scopes1.join(","));
  const days1 = row1?.expiresAt ? (row1.expiresAt.getTime() - Date.now()) / 86_400_000 : NaN;
  assert("S2.5 DB: หมดอายุ ≈ +365 วัน", days1 > 364 && days1 <= 366, `${days1}`);
  assert("S2.6 DB: createdById = เจ้าของที่ล็อกอิน", row1?.createdById === E.ownerUserId, `${row1?.createdById}`);
  assert("S2.7 DB: keyHash = sha256(rawKey ที่โชว์)", !!rawMatch && row1?.keyHash === sha256(rawMatch[0]), "ไม่ตรง");
  await page.reload({ waitUntil: "networkidle0" });
  assert("S2.8 รีโหลดแล้ว rawKey ไม่โชว์อีก (ครั้งเดียว)", !(await exists(page, sel("api-key-new"))), "ยังโชว์");
  assert("S2.9 ตารางมีแถวคีย์ใหม่", await waitFor(page, sel(`api-key-row-${row1?.id}`)), "ไม่พบแถว");
  const bundleTxt = await text(page, sel(`api-key-row-bundle-${row1?.id}`));
  assert("S2.10 แถวแสดงป้าย bundle (ไทย) ของ issue-and-collect", /[ก-๙]/.test(bundleTxt) && bundleTxt.length > 0, bundleTxt);
  const expTxt = await text(page, sel(`api-key-row-expires-${row1?.id}`));
  assert("S2.11 แถวแสดงวันหมดอายุเป็นวันที่ไทย (พ.ศ./ค.ศ. + เดือนไทย)", /[ก-๙]\.?[ก-๙]*\.? ?\d{4}|\d{1,2} [ก-๙]+/.test(expTxt), expTxt);
  const sysTxt = await text(page, sel(`api-key-row-system-${row1?.id}`));
  assert("S2.12 แถวแสดงชื่อสมุดบัญชีที่ผูก", sysTxt.length > 0, sysTxt, );

  // ── หมุนคีย์ ──
  await click(page, sel(`api-key-rotate-${row1?.id}`));
  assert("S3.1 หมุน → rawKey ใหม่โผล่", await waitFor(page, sel("api-key-new"), 15000), "ไม่พบ api-key-new");
  const raw2 = /shark_[0-9a-f]{64}/.exec(await text(page, sel("api-key-new")))?.[0];
  assert("S3.2 rawKey ใหม่ ≠ เดิม", !!raw2 && raw2 !== rawMatch?.[0], `${raw2?.slice(0, 16)}`);
  const rot = await prisma.apiKey.findFirst({ where: { tenantId: TID, rotatedFromId: row1?.id } }) as Any;
  const old = await prisma.apiKey.findUnique({ where: { id: row1?.id } }) as Any;
  assert("S3.3 DB: คีย์เก่าเพิกถอน · คีย์ใหม่ rotatedFromId ชี้เก่า · scopes/systemId เท่าเดิม", !!old?.revokedAt && !!rot && rot.systemId === SYS && JSON.stringify([...(rot.scopesJson as string[])].sort()) === JSON.stringify(scopes1), JSON.stringify({ oldRevoked: !!old?.revokedAt, rot: !!rot }));
  await page.reload({ waitUntil: "networkidle0" });
  const oldRowTxt = await text(page, sel(`api-key-row-${row1?.id}`));
  assert("S3.4 แถวคีย์เก่าขึ้น 'เพิกถอนแล้ว' และไม่มีปุ่มหมุน", /เพิกถอน/.test(oldRowTxt) && !(await exists(page, sel(`api-key-rotate-${row1?.id}`))), oldRowTxt.slice(0, 80));

  // ── สร้างคีย์ 2: read-only · ไม่หมดอายุ · เอา tax.view ออก ──
  await page.type(sel("api-key-name"), NAME2);
  await click(page, sel("api-key-bundle-read-only"));
  await new Promise((r) => setTimeout(r, 300));
  if (!(await exists(page, sel("api-key-scope-account.tax.view")))) await click(page, sel("api-key-scopes-toggle"));
  await waitFor(page, sel("api-key-scope-account.tax.view"), 4000);
  await click(page, sel("api-key-scope-account.tax.view"));
  await setSelect(page, sel("api-key-ttl"), "0");
  await click(page, sel("api-key-submit"));
  assert("S4.1 สร้างคีย์ 2 → rawKey โผล่", await waitFor(page, sel("api-key-new"), 15000), "ไม่พบ");
  const row2 = await prisma.apiKey.findFirst({ where: { tenantId: TID, name: NAME2 }, orderBy: { createdAt: "desc" } }) as Any;
  const ro = (scopesMod.expandBundles(["read-only"]) as string[]).filter((s) => s !== "account.tax.view").sort();
  assert("S4.2 DB: scopes = read-only ลบ account.tax.view", JSON.stringify([...((row2?.scopesJson as string[]) ?? [])].sort()) === JSON.stringify(ro), JSON.stringify(row2?.scopesJson));
  assert("S4.3 DB: ไม่หมดอายุ (expiresAt null)", row2?.expiresAt === null, `${row2?.expiresAt}`);
  await page.reload({ waitUntil: "networkidle0" });
  await waitFor(page, sel(`api-key-row-${row2?.id}`));
  const exp2 = await text(page, sel(`api-key-row-expires-${row2?.id}`));
  assert("S4.4 แถวคีย์ 2 แสดง 'ไม่หมดอายุ'", /ไม่หมดอายุ/.test(exp2), exp2);
  const bundle2 = await text(page, sel(`api-key-row-bundle-${row2?.id}`));
  assert("S4.5 แถวคีย์ 2 บอกว่ากำหนดเอง/ไม่ครบชุด (ไม่ใช่ป้าย read-only เต็ม)", bundle2.length > 0 && !/^อ่านอย่างเดียว$/.test(bundle2), bundle2, );

  // ── เพิกถอน ──
  await click(page, sel(`api-key-revoke-${row2?.id}`));
  await new Promise((r) => setTimeout(r, 1500));
  const row2b = await prisma.apiKey.findUnique({ where: { id: row2?.id } }) as Any;
  assert("S5.1 เพิกถอนคีย์ 2 → DB revokedAt ตั้ง", !!row2b?.revokedAt, "ยังไม่เพิกถอน");

  // ── มือถือ 390: ไม่ล้น ──
  const m = await newPageAs(token, 390);
  await m.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await waitFor(m, sel("connections-api"));
  const sw = await m.evaluate(() => document.documentElement.scrollWidth);
  assert("S6.1 มือถือ 390 ไม่ล้นแนวนอน", sw <= 390, `scrollWidth ${sw}`);
  const btnBox = await m.evaluate((q: string) => { const el = document.querySelector(q) as HTMLElement | null; if (!el) return null; const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; }, sel("api-key-submit"));
  assert("S6.2 ปุ่มสร้างคีย์บนมือถือสูง ≥ 40px", !!btnBox && btnBox.h >= 40, JSON.stringify(btnBox));
  await m.close();

  // ── หน้า /app/settings/api (ระดับร้าน) ──
  const p2 = await newPageAs(token, 1440);
  await p2.goto(`${BASE}/app/settings/api`, { waitUntil: "networkidle0", timeout: 60000 });
  assert("S7.1 หน้า API ระดับร้านมีลิงก์ไปหน้าคีย์บัญชี", await waitFor(p2, sel("platform-api-key-account-link")), "ไม่พบ platform-api-key-account-link");
  assert("S7.2 ตารางระดับร้านแสดง scope ของคีย์บัญชี (คอลัมน์ขอบเขต)", await exists(p2, sel(`api-key-row-scopes-${rot?.id}`)), "ไม่พบ api-key-row-scopes-<id>");
  await p2.close();
  await page.close();
} catch (e) {
  bad("CRASH", e instanceof Error ? e.message.slice(0, 200) : String(e));
} finally {
  await browser.close().catch(() => {});
  for (const t of mintedTokens) await prisma.session.deleteMany({ where: { tokenHash: sha256(t) } }).catch(() => {});
  await prisma.apiKey.deleteMany({ where: { tenantId: TID, name: { startsWith: "QC A2 " } } }).catch(() => {});
  await prisma.$disconnect();
}
const total = passed + findings.length;
console.log(`\n===== QC A2 =====\nผ่าน ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(findings.length > 0 ? 1 : 0);
