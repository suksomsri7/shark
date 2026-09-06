// QC iPad: เรนเดอร์ web export ของแอป SHARK HUB ด้วย chromium · API ถูก mock ทั้งหมด (ไม่แตะ prod · ไม่มี token จริง)
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { mkdirSync } from "node:fs";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:4700";
const OUT = "/root/qc-shark-mobile/qc/shots"; mkdirSync(OUT, { recursive: true });
const ME = { user: { id: "u1", email: "owner@example.com", name: "เจ้าของร้าน" }, memberships: [{ tenantId: "t1", name: "SIAM DIVE CENTER", role: "OWNER" }] };
const CONVS = { conversations: [
  { id: "c1", title: "สรุปยอดขายสัปดาห์นี้", updatedAt: new Date(Date.now() - 3600e3).toISOString(), unread: true },
  { id: "c2", title: "ตั้งค่าคิวลูกค้าหน้าร้าน", updatedAt: new Date(Date.now() - 86400e3).toISOString(), unread: false },
  { id: "c3", title: null, updatedAt: new Date(Date.now() - 3 * 86400e3).toISOString(), unread: false },
] };
const MSGS = { messages: [
  { id: "m1", role: "USER", content: "ช่วยสรุปยอดขายสัปดาห์นี้ให้หน่อย" },
  { id: "m2", role: "ASSISTANT", content: "สัปดาห์นี้ (1–6 ก.ย.) ยอดขายรวม 184,500 บาท จาก 42 บิล เพิ่มขึ้น 12% จากสัปดาห์ก่อน\n\n• คอร์ส Open Water 6 ราย = 78,000 บาท\n• ทริปวันเดียว 21 ราย = 63,000 บาท\n• อุปกรณ์ = 43,500 บาท\n\nอยากให้ผมทำรายงานส่งอีเมลให้ไหมครับ" },
  { id: "m3", role: "USER", content: "ทำเลย ส่งให้ทีมบัญชีด้วย" },
  { id: "m4", role: "ASSISTANT", content: "รับทราบครับ ผมร่างรายงานไว้แล้ว รอคุณยืนยันก่อนส่ง" },
] };
const routes = {
  "/api/mobile/me": ME, "/api/mobile/conversations": CONVS, "/api/mobile/conversations/c1/messages": MSGS,
  "/api/mobile/usage": { used: 12, limit: 100 }, "/api/mobile/proposals": { proposals: [] },
};
const VIEWS = [
  { tag: "ipad-portrait", w: 820, h: 1180 }, { tag: "ipad-landscape", w: 1180, h: 820 },
  { tag: "ipad13-portrait", w: 1024, h: 1366 }, { tag: "iphone", w: 390, h: 844 },
];
const SCREENS = [
  { name: "login", path: "/login", auth: false },
  { name: "sessions", path: "/sessions", auth: true },
  { name: "chat", path: "/chat/c1?title=" + encodeURIComponent("สรุปยอดขายสัปดาห์นี้"), auth: true },
  { name: "dna", path: "/dna", auth: true, noTenant: true },
];
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] });
const results = [];
for (const v of VIEWS) for (const s of SCREENS) {
  const page = await browser.newPage();
  await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 2 });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.host === "shark.in.th") {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
      const key = u.pathname;
      const body = key === "/api/mobile/me" && s.noTenant ? { ...ME, memberships: [] } : routes[key];
      if (body) return req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
      return req.respond({ status: 404, headers: cors, contentType: "application/json", body: '{"error":"not_found"}' });
    }
    req.continue();
  });
  await page.evaluateOnNewDocument((auth) => { localStorage.clear(); if (auth) { localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", "t1"); } }, s.auth);
  const errors = []; page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
  await page.goto(BASE + s.path, { waitUntil: "networkidle0", timeout: 60000 }).catch((e) => errors.push("goto " + e.message.slice(0, 80)));
  await new Promise((r) => setTimeout(r, 1500));
  const file = `${OUT}/${s.name}-${v.tag}.png`;
  await page.screenshot({ path: file });
  results.push({ screen: s.name, view: v.tag, url: page.url().replace(BASE, ""), errors: errors.slice(0, 2) });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
