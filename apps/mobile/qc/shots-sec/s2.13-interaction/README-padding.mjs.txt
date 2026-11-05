// S2.13 fix-forward: ตรวจ "รายการท้ายสุดไม่ถูกแถบ/ปุ่มลอยล่างทับ" ตอนเลื่อนสุด ทั้ง 2 ธีม
// ใช้: node pad-check.mjs <BASE> <OUTDIR> <route|fixture|floatTestID?> ...
//   floatTestID = ปุ่ม/ช่องที่ลอยล่าง (absolute) · ไม่ใส่ = จอไม่มีของลอย (ตรวจว่าเนื้อหาท้ายสุดอยู่เหนือแถบล่างที่อยู่ในโฟลว์)
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const [BASE, OUT, ...specs] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const UDD = `/tmp/chr-sec-pad-${process.pid}`;
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${UDD}`] });
const out = [];
try {
  for (const spec of specs) {
    const [route, fixture, floatId] = spec.split("|");
    const FX = JSON.parse(readFileSync(fixture, "utf8"));
    const EP = FX.endpoints ?? {};
    for (const dark of [false, true]) {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }]);
      await page.setRequestInterception(true);
      const unmocked = [];
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
      await page.evaluateOnNewDocument((mode) => {
        localStorage.clear();
        localStorage.setItem("shark_theme", mode);
        localStorage.setItem("shark_token", "qc-mock");
        localStorage.setItem("shark_tenant", "t1");
      }, dark ? "dark" : "light");
      await page.goto(BASE + route, { waitUntil: "networkidle0", timeout: 60000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      // ScrollView หลักของจอ = กล่องที่เลื่อนได้และใหญ่ที่สุด
      const res = await page.evaluate(async (floatId) => {
        const els = [...document.querySelectorAll("div")].filter((d) => {
          const cs = getComputedStyle(d);
          return /(auto|scroll)/.test(cs.overflowY) && d.scrollHeight > d.clientHeight + 2 && d.clientHeight > 150;
        });
        els.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
        const sc = els[0];
        if (!sc) return { scroll: false };
        sc.scrollTop = sc.scrollHeight;
        await new Promise((r) => setTimeout(r, 600));
        // เนื้อหาท้ายสุดที่มองเห็น: ลูกหลานที่มีขนาด ล่างสุด (ใน content container)
        const content = sc.firstElementChild;
        let lastBottom = 0;
        let lastId = "";
        for (const e of content.querySelectorAll("*")) {
          const r = e.getBoundingClientRect();
          if (r.height > 4 && r.width > 40 && r.bottom > lastBottom) {
            lastBottom = r.bottom;
            lastId = e.closest("[data-testid]")?.getAttribute("data-testid") ?? e.tagName;
          }
        }
        const scR = sc.getBoundingClientRect();
        let floatTop = null;
        if (floatId) {
          const f = document.querySelector(`[data-testid="${floatId}"]`);
          floatTop = f ? f.getBoundingClientRect().top : null;
        }
        return { scroll: true, lastBottom: Math.round(lastBottom), lastId, scrollBottom: Math.round(scR.bottom), floatTop: floatTop === null ? null : Math.round(floatTop), viewport: innerHeight };
      }, floatId ?? "");
      const limit = res.floatTop ?? res.scrollBottom;
      const gap = res.scroll ? limit - res.lastBottom : null;
      const ok = res.scroll ? gap >= 0 : true;
      const name = route.replace(/^\/+/, "").replace(/[^A-Za-z0-9_]+/g, "-") + (dark ? "-dark" : "") + "-scrolled-end.png";
      await page.screenshot({ path: join(OUT, name) });
      out.push({ route, dark, fixture: fixture.split("/").pop(), floatId: floatId ?? null, ...res, gap, ok, unmocked, shot: name });
      await page.close();
    }
  }
} finally {
  await browser.close();
  rmSync(UDD, { recursive: true, force: true });
}
writeFileSync(join(OUT, "padding.json"), JSON.stringify({ generatedAt: new Date().toISOString(), ok: out.every((x) => x.ok), checks: out }, null, 1));
console.log(JSON.stringify(out.map((x) => ({ r: x.route, dark: x.dark, scroll: x.scroll, last: x.lastBottom, lastId: x.lastId, float: x.floatTop, scrollBottom: x.scrollBottom, gap: x.gap, ok: x.ok, um: x.unmocked.length })), null, 0).replace(/\},\{/g, "},\n{"));
