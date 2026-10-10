// look-l6.mts — HUNTER C5.2 lens L6 · READ-ONLY look at QC1 (http://127.0.0.1:3215) in headless chromium · NOT an oracle
//   Writes exactly one thing: a Session row for the seeded owner (tagged userAgent "qc-hunt-l6"), deleted in finally.
//   Every non-GET request is aborted in the browser (no server action / form submit can reach the server).
//   Measures per page at 390×844: horizontal overflow · tiny tap targets · raw internal codes in visible text. ≤ 6 screenshots.
// Run: bash scripts/iso.sh pnpm exec tsx scripts/pending/hunt-l6/look-l6.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (/ep-royal-night/.test(host)) throw new Error("prod — stop");
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const E = JSON.parse(readFileSync("scripts/crm-expected.json", "utf8"));
const BASE = "http://127.0.0.1:3215";
const SYS = E.systemId as string;
const CRM = `/app/sys/${SYS}/crm`;
const OUT = ".qc-shots/hunt-l6";
mkdirSync(OUT, { recursive: true });
const UA = "qc-hunt-l6";
const sessionIds: string[] = [];
const dataDir = `/tmp/chr-hunt-l6-${process.pid}`;
const res: Record<string, unknown> = {};
let browser: Any = null;
try {
  const owner = E.users.owner.userId as string;
  // pick records that exist in the seed
  const wonCo = await P.crmCompany.findFirst({ where: { systemId: SYS, archivedAt: null, mergedIntoId: null, wonValueSatang: { gt: 0 } }, orderBy: { wonValueSatang: "desc" }, select: { id: true, name: true, lifecycleStage: true, score: true, wonValueSatang: true } });
  const coLife = await P.$queryRawUnsafe(`SELECT "lifecycleStage"::text AS l, count(*)::int AS n, count(*) FILTER (WHERE "wonValueSatang" > 0)::int AS with_won FROM "CrmCompany" WHERE "systemId" = $1 GROUP BY 1`, SYS);
  const deal = await P.crmDeal.findFirst({ where: { systemId: SYS, kind: "OPEN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const contact = await P.crmContact.findFirst({ where: { systemId: SYS, archivedAt: null, mergedIntoId: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
  res.db = { wonCompany: wonCo ? { ...wonCo, wonValueSatang: String(wonCo.wonValueSatang) } : null, companyLifecycleCounts: coLife };

  const token = randomBytes(32).toString("base64url");
  const ttl = new Date(Date.now() + 30 * 60_000);
  const s = await P.session.create({ data: { userId: owner, tokenHash: createHash("sha256").update(token).digest("hex"), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  sessionIds.push(s.id);
  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string)) as Any;
  browser = await pptr.default.launch({ executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${dataDir}`] });
  const pages: { key: string; path: string; shot?: boolean }[] = [
    { key: "home", path: `/app/sys/${SYS}` },
    { key: "company360-won", path: `${CRM}/companies/${wonCo?.id ?? "-"}`, shot: true },
    { key: "companies", path: `${CRM}/companies` },
    { key: "contacts", path: `${CRM}/contacts` },
    { key: "contact360", path: `${CRM}/contacts/${contact?.id ?? "-"}` },
    { key: "deals-board", path: `${CRM}/deals` },
    { key: "deals-table", path: `${CRM}/deals?view=table` },
    { key: "deals-new", path: `${CRM}/deals/new`, shot: true },
    { key: "deal360", path: `${CRM}/deals/${deal?.id ?? "-"}`, shot: true },
    { key: "activities", path: `${CRM}/activities` },
    { key: "activities-overdue", path: `${CRM}/activities?status=overdue` },
    { key: "calendar", path: `${CRM}/calendar` },
    { key: "notif-settings", path: `${CRM}/settings/notifications`, shot: true },
    { key: "pipelines", path: `${CRM}/settings/pipelines` },
    { key: "reports", path: `${CRM}/reports` },
  ];
  let shots = 0;
  for (const pg of pages) {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.evaluateOnNewDocument("window.__name = (f) => f;");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.setRequestInterception(true);
    page.on("request", (r: Any) => (["GET", "HEAD", "OPTIONS"].includes(r.method()) ? r.continue() : r.abort()));
    await page.setCookie({ name: "shark_session", value: token, domain: "127.0.0.1", path: "/" }, { name: "shark_tenant", value: E.tenantId, domain: "127.0.0.1", path: "/" });
    let status = 0;
    try {
      const r = await page.goto(`${BASE}${pg.path}`, { waitUntil: "networkidle2", timeout: 60_000 });
      status = r?.status() ?? 0;
      await new Promise((ok) => setTimeout(ok, 600));
      const m = await page.evaluate(() => {
        const W = 390;
        const doc = document.documentElement;
        const vis = (el: Element) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
        };
        // overflow offenders: elements whose right edge passes the viewport and that are not inside a horizontal scroller
        const inScroller = (el: Element) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if ((cs.overflowX === "auto" || cs.overflowX === "scroll" || cs.overflowX === "hidden") && p !== document.body && p !== doc) return true;
          }
          return false;
        };
        const over: string[] = [];
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          if (!vis(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.right > W + 1 && !inScroller(el)) {
            const tid = el.getAttribute("data-testid");
            over.push(`${el.tagName.toLowerCase()}${tid ? `[${tid}]` : ""} right=${Math.round(r.right)} "${(el.textContent ?? "").trim().slice(0, 40)}"`);
          }
        }
        const tiny: string[] = [];
        for (const el of Array.from(document.querySelectorAll("a[href],button,input,select,textarea,[role=button],summary"))) {
          if (!vis(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.height < 24 || r.width < 24) {
            const tid = el.getAttribute("data-testid");
            tiny.push(`${el.tagName.toLowerCase()}${tid ? `[${tid}]` : ""} ${Math.round(r.width)}×${Math.round(r.height)} "${(el.textContent ?? (el as HTMLInputElement).value ?? "").trim().slice(0, 30)}"`);
          }
        }
        const text = document.body.innerText;
        const codes = [...new Set((text.match(/\b[A-Z][A-Z_]{3,}\b/g) ?? []).filter((w) => !["CRM", "LINE", "PDPA", "HTTP", "HTTPS", "API", "CSV", "URL", "SHARK", "OTP", "UTM", "DKIM", "SPF", "DMARC", "TXT", "CNAME", "HTML", "JSON", "PDF", "LIFF", "ROI", "KPI", "VAT", "THB"].includes(w)))].slice(0, 20);
        const h1 = document.querySelector("h1")?.textContent?.trim() ?? null;
        return { scrollWidth: doc.scrollWidth, overflowCount: over.length, overflow: over.slice(0, 6), tinyCount: tiny.length, tiny: tiny.slice(0, 8), codes, h1, notFound: /404|ไม่พบหน้า/.test(document.title + " " + (h1 ?? "")) };
      });
      let extra: Any = null;
      if (pg.key === "company360-won") extra = await page.$eval("[data-testid=company-360-header]", (el: Element) => (el as HTMLElement).innerText.slice(0, 300)).catch(() => null);
      if (pg.key === "notif-settings") extra = await page.evaluate(() => document.body.innerText.match(/lead ใหม่ถูกมอบหมายให้ฉัน|ลูกค้าตอบกลับ|สรุปงานของวันนี้|เตือนก่อนถึงนัด|lead ร้อน|ดีลปิดแล้ว|ใบแจ้งหนี้/g));
      res[pg.key] = { status, ...m, extra };
      if (pg.shot && shots < 6) {
        await page.screenshot({ path: `${OUT}/${pg.key}-390.png`, fullPage: pg.key !== "notif-settings" });
        shots += 1;
      }
    } catch (e) {
      res[pg.key] = { status, error: String(e).slice(0, 200) };
    }
    await page.close();
  }
} catch (e) {
  res.fatal = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  for (const id of sessionIds) await P.session.delete({ where: { id } }).catch(() => undefined);
  res.sessionsLeft = await P.session.count({ where: { userAgent: UA } });
  for (const d of [dataDir, `/tmp/snap-private-tmp/snap.chromium${dataDir}`]) rmSync(d, { recursive: true, force: true });
  writeFileSync(`${OUT}/look-l6.json`, JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
  await P.$disconnect();
}
