// C5.4-C round 13 · R12-1/R12-2 — the receipt editor on a real production build (QC2) shows:
//   A) a draft cash-sale receipt whose payment (cheque) is already attached ⇒ read-only attached rows, no empty payment form
//   B) a draft whose only payment bounced ⇒ the "จะบันทึกเป็นรับเงินสด" warning + confirm checkbox
// Needs a server on QC2 (`QC_BASE`, default http://127.0.0.1:3220) · QC2 only · throwaway tenant + session, deleted at the end.
// Run: bash scripts/qc2.sh pnpm exec tsx scripts/pending/c54c/shot-r13-editor.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3220";
const OUT = "/root/projects/shark-crm-c54c/.qc-shots/r13";
mkdirSync(OUT, { recursive: true });
const TAG = `qc-c54c-shot-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const UA = "qc-c54c-r13-shot";
const log = (s: string) => console.log(s);
const res: { id: string; ok: boolean; msg: string }[] = [];
const chk = (id: string, ok: boolean, msg: string) => { res.push({ id, ok, msg }); log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`); };
let T = ""; let U = ""; const udd = `/tmp/chr-c54c-r13-${process.pid}`;
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const cfg = (await import("@/lib/modules/account/doc-editor-config" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  U = (await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: `owner ${TAG}` } })).id;
  await P.membership.create({ data: { userId: U, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R13", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const bk = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: "ออมทรัพย์ R13", bankName: "กสิกรไทย" });
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const day = new Date(`${today}T00:00:00Z`);
  const worst = async (chequeNo: string) => {
    const re = (await accSvc.createDocument({ tenantId: T, systemId: A, docType: "RECEIPT", contactId: cust.id, vatMode: "EXCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 1_000_000 }] })).id as string;
    const r = await cheque.attachReceiptPaymentsWithChequesInOneTx(T, A, re, [{ paidAt: day, channel: "CHEQUE", financeAccountId: null, amount: 1_070_000, whtAmountSatang: 0, whtRateBp: null, feeAmount: 0, note: null, createdById: null, idempotencyKey: `${TAG}-${chequeNo}:0`, cheque: { chequeNo, bankName: "KBank", chequeDate: day }, chequeFinanceAccountId: bk.id }]);
    if (!r.ok) throw new Error(`attach: ${r.reason}`);
    return re;
  };
  const reA = await worst("R13-SHOT-A");
  const reB = await worst("R13-SHOT-B");
  const cqB = (await P.accountDocumentPayment.findFirst({ where: { documentId: reB }, select: { chequeId: true } })).chequeId;
  const b = await cheque.bounceCheque(T, A, cqB, "เช็คเด้ง (ภาพทดสอบ)");
  if (!b.ok) throw new Error(`bounce: ${b.reason}`);

  const token = `r13${randomBytes(16).toString("hex")}`;
  const ttl = new Date(Date.now() + 30 * 60 * 1000);
  await P.session.create({ data: { userId: U, tokenHash: createHash("sha256").update(token).digest("hex"), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl } });
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${udd}`] });
  try {
    const hostName = new URL(BASE).hostname;
    for (const [name, re] of [["A-attached", reA], ["B-bounced", reB]] as const) {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await page.setCookie({ name: "shark_session", value: token, domain: hostName, path: "/" }, { name: "shark_tenant", value: T, domain: hostName, path: "/" });
      const url = `${BASE}${cfg.editorEditPath(`/app/sys/${A}/account`, "RECEIPT", re)}`;
      await page.goto(url, { waitUntil: "networkidle2", timeout: 90_000 }).catch((e: unknown) => log(`goto ${name}: ${e}`));
      await page.waitForSelector("[data-testid=sec-note], [data-testid=attached-payments], [data-testid=pay-voided-warning]", { timeout: 60_000 }).catch(() => undefined);
      const dom = await page.evaluate(() => ({
        attached: !!document.querySelector("[data-testid=attached-payments]"),
        rows: document.querySelectorAll("[data-testid^=attached-pay-row-]").length,
        rowText: (document.querySelector("[data-testid=attached-payments]") as HTMLElement | null)?.innerText ?? "",
        warning: !!document.querySelector("[data-testid=pay-voided-warning]"),
        confirm: !!document.querySelector("[data-testid=pay-voided-confirm]"),
        title: document.title,
      }));
      const el = await page.$("[data-testid=attached-payments], [data-testid=pay-voided-warning]");
      if (el) await el.scrollIntoView().catch(() => undefined);
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      if (name === "A-attached")
        chk("SHOT-A", dom.attached && dom.rows === 1 && /R13-SHOT-A/.test(dom.rowText) && /10,700\.00/.test(dom.rowText) && !dom.warning,
          `attached cheque shown read-only: table ${dom.attached} rows ${dom.rows} text "${dom.rowText.replace(/\s+/g, " ")}" · warning ${dom.warning} · ${OUT}/${name}.png`);
      else
        chk("SHOT-B", !dom.attached && dom.warning && dom.confirm,
          `bounced draft: warning ${dom.warning} confirm ${dom.confirm} attached ${dom.attached} · ${OUT}/${name}.png`);
      await page.close();
    }
  } finally { await browser.close(); }
} catch (e) { chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e)); }
finally {
  rmSync(udd, { recursive: true, force: true });
  await P.session.deleteMany({ where: { userAgent: UA } }).catch(() => undefined);
  if (T) {
    const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined); await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0; for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    chk("CLEAN", left === 0, `tenant rows left=${left}`);
  }
  if (U) { await P.membership.deleteMany({ where: { userId: U } }).catch(() => undefined); await P.user.delete({ where: { id: U } }).catch(() => undefined); }
  await prisma.$disconnect();
}
const passed = res.filter((r) => r.ok).length;
log(`\n${passed === res.length ? "🟢" : "🔴"} shot-r13-editor: ${passed}/${res.length}`);
process.exit(passed === res.length ? 0 : 1);
