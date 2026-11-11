// S2.13 ภาพคู่ของสถานะที่ต้องกด/เลื่อน (ชีต B1 · C4 · D3 · ส่วน K4/K5) ทั้ง 2 ธีม
// ใช้: node state-shots.mjs <BASE> <OUTDIR> <FIXDIR>
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
const [BASE, OUT, FIXDIR] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const STATES = [
  { name: "b1-switcher", route: "/secretary", fixture: "s2.20.json", click: "sec-tenant", wait: "sec-switcher" },
  { name: "c4-reject-sheet", route: "/secretary/room/r1", fixture: "s2.4.json", click: "sec-room-reject", wait: null },
  { name: "d3-add-member", route: "/secretary/room/r2", fixture: "s2.10.json", click: "sec-room-add-member", wait: null },
  { name: "k4-channels", route: "/secretary/settings/customers", fixture: "s2.17.json", scrollTo: "cust-set-channels" },
  { name: "k5-routing", route: "/secretary/settings/customers", fixture: "s2.17.json", scrollTo: "cust-set-routing" },
];
const UDD = `/tmp/chr-sec-st-${process.pid}`;
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${UDD}`] });
const out = [];
try {
  for (const st of STATES) for (const dark of [false, true]) {
    const EP = JSON.parse(readFileSync(join(FIXDIR, st.fixture), "utf8")).endpoints ?? {};
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }]);
    await page.setRequestInterception(true);
    const unmocked = [], errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 140)));
    page.on("request", (req) => {
      const u = new URL(req.url());
      if (u.host !== "shark.in.th") return req.continue();
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
      const k1 = `${req.method()} ${u.pathname}`;
      const body = Object.prototype.hasOwnProperty.call(EP, k1) ? EP[k1] : Object.prototype.hasOwnProperty.call(EP, u.pathname) ? EP[u.pathname] : undefined;
      if (body !== undefined) return req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
      unmocked.push(k1);
      return req.respond({ status: 404, headers: cors, contentType: "application/json", body: "{}" });
    });
    await page.evaluateOnNewDocument((mode) => { localStorage.clear(); localStorage.setItem("shark_theme", mode); localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", "t1"); }, dark ? "dark" : "light");
    await page.goto(BASE + st.route, { waitUntil: "networkidle0", timeout: 60000 }).catch((e) => errors.push("goto"));
    try {
      if (st.click) {
        await page.waitForSelector(`[data-testid="${st.click}"]`, { timeout: 20000 });
        await page.click(`[data-testid="${st.click}"]`);
        if (st.wait) await page.waitForSelector(`[data-testid="${st.wait}"]`, { timeout: 10000 });
      }
      if (st.scrollTo) {
        await page.waitForSelector(`[data-testid="${st.scrollTo}"]`, { timeout: 20000 });
        await page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`).scrollIntoView({ block: "start" }), st.scrollTo);
      }
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) { errors.push(String(e.message).slice(0, 140)); }
    const file = `${st.name}${dark ? "-dark" : ""}.png`;
    await page.screenshot({ path: join(OUT, file) });
    out.push({ name: st.name, dark, route: st.route, fixture: st.fixture, file, errors, unmocked, ok: errors.length === 0 && unmocked.length === 0 });
    await page.close();
  }
} finally { await browser.close(); rmSync(UDD, { recursive: true, force: true }); }
writeFileSync(join(OUT, "states.json"), JSON.stringify({ generatedAt: new Date().toISOString(), states: out }, null, 1));
console.log(JSON.stringify(out.map((x) => ({ n: x.name, d: x.dark, ok: x.ok, e: x.errors, u: x.unmocked }))));
