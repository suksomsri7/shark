// เรนเดอร์ทุกจอแบบ full-page (ความสูงตามเนื้อหา) — node render.mjs [NN ...]
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { readdirSync, rmSync } from "node:fs";
const dir = "/root/projects/shark-in-th/ledger/design-inventory";
const only = process.argv.slice(2);
const files = readdirSync(dir).filter(f => /^\d\d-.*\.html$/.test(f) && !f.endsWith(".body.html") && (only.length === 0 || only.some(p => f.startsWith(p))));
const udd = `/root/snap/chromium/common/pos-r-${process.pid}`;
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${udd}`] });
const page = await browser.newPage();
for (const f of files) {
  const w = 1500;
  await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
  await page.goto(`file://${dir}/${f}`, { waitUntil: "load" });
  await new Promise(r => setTimeout(r, 400));
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: `${dir}/${f.replace(/\.html$/, ".png")}`, fullPage: true });
  console.log(f, w + "x" + h);
}
await browser.close();
rmSync(udd, { recursive: true, force: true });
