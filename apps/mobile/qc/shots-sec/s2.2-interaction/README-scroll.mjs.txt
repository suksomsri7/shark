// A1 เลื่อนสุดรายการ: การ์ดสุดท้ายต้องอยู่เหนือช่องสั่งงานทั้งใบ (วัด rect จริง)
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http"; import { readFileSync, existsSync, statSync, rmSync } from "node:fs"; import { join, extname } from "node:path";
const DIST = "/root/qc-shark-mobile-sec-d/dist", FX = JSON.parse(readFileSync(process.argv[2], "utf8")), OUT = process.argv[3];
const srv = createServer((q, r) => { let f = join(DIST, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html"); r.writeHead(200, { "content-type": { ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf" }[extname(f)] ?? "application/octet-stream" }); r.end(readFileSync(f)); }).listen(4725);
const UDD = `/tmp/chr-s22s-${process.pid}`;
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", `--user-data-dir=${UDD}`] });
const out = {};
try {
  for (const dark of [false, true]) {
    const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }]); await p.setRequestInterception(true);
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
    p.on("request", (q) => { const u = new URL(q.url()); if (u.host === "shark.in.th") { if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: cors, body: "" }); const body = FX.endpoints[`${q.method()} ${u.pathname}`]; return q.respond({ status: body ? 200 : 404, headers: cors, contentType: "application/json", body: JSON.stringify(body ?? { error: "x" }) }); } q.continue(); });
    await p.evaluateOnNewDocument((m) => { localStorage.clear(); localStorage.setItem("shark_theme", m); localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", "t1"); }, dark ? "dark" : "light");
    await p.goto("http://127.0.0.1:4725/secretary", { waitUntil: "networkidle0" }); await p.waitForSelector('[data-testid="sec-home-card-r5"]');
    await p.evaluate(() => { const el = document.querySelector('[data-testid="sec-home"]'); const s = [el, ...el.querySelectorAll("div")].find((d) => d.scrollHeight > d.clientHeight + 4 && getComputedStyle(d).overflowY !== "visible"); s.scrollTop = s.scrollHeight; });
    await new Promise((r) => setTimeout(r, 800));
    const m = await p.evaluate(() => { const c = document.querySelector('[data-testid="sec-home-card-r5"]').getBoundingClientRect(); const i = document.querySelector('[data-testid="sec-input"]').getBoundingClientRect(); return { lastCardBottom: Math.round(c.bottom), inputTop: Math.round(i.top), gap: Math.round(i.top - c.bottom) }; });
    out[dark ? "dark" : "light"] = m;
    await p.screenshot({ path: `${OUT}/a1-scrolled-end${dark ? "-dark" : ""}.png` }); await p.close();
  }
} finally { await b.close(); srv.close(); rmSync(UDD, { recursive: true, force: true }); rmSync(`/tmp/snap-private-tmp/snap.chromium/tmp/chr-s22s-${process.pid}`, { recursive: true, force: true }); }
console.log(JSON.stringify(out));
