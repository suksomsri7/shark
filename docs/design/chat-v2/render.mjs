// เรนเดอร์แบบร่างอ้างอิงของกล่องแชท V2 ใหม่จาก mockup.html
// 🔴 mockup.html คือ **ข้อสอบด้านหน้าตา** — เจ้าของเคาะแล้ว 1 ก.ย. 2026 ว่า "ต้องเหมือนในรูป ห้ามผิด"
//    แก้ mockup.html เมื่อไหร่ ต้องรัน `node docs/design/chat-v2/render.mjs` ให้รูปตรงกันเสมอ
import pptr from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const OUT = "/root/projects/shark-in-th/docs/design/chat-v2";
const b = await pptr.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--user-data-dir=/tmp/chr-mockup2"],
});
const p = await b.newPage();
await p.setViewport({ width: 1780, height: 1000, deviceScaleFactor: 2 });
await p.goto(`file://${OUT}/mockup.html`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1200));

for (const [sel, name] of [["#s1", "ref-mobile"], ["#s2", "ref-desktop"]]) {
  const el = await p.$(sel);
  await el.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name}.png`);
}
await b.close();
