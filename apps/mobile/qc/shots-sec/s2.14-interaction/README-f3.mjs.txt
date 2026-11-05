// S2.14 F3: ภาพ K2 เลื่อนถึงรูปลูกค้า (พื้นรอ surface + ไอคอน) ทั้ง 2 ธีม · ใช้: node f3shot.mjs (ต้องมี dist ใน /root/qc-shark-mobile-sec-d)
import { serveDist, launch, openPage, goto } from "/root/projects/shark-sec-d/apps/mobile/qc/sec-harness.mjs";
import { readFileSync } from "node:fs";
const M = "/root/projects/shark-sec-d/apps/mobile";
const fx = JSON.parse(readFileSync(`${M}/qc/fixtures/secretary/s2.17.json`, "utf8"));
const s = await serveDist("/root/qc-shark-mobile-sec-d/dist", 4734);
const { browser, close } = await launch("f3");
for (const dark of [false, true]) {
  const { page, log } = await openPage(browser, { base: "http://127.0.0.1:4734", route: "/customers/x1", fx, dark, scale: 2 });
  await goto(page, "http://127.0.0.1:4734", "/customers/x1", { waitMs: 3500 });
  await page.evaluate(() => document.querySelector('[data-testid="cust-att-image"]')?.scrollIntoView({ block: "center" }));
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${M}/qc/shots-sec/s2.14-interaction/k2-image-placeholder${dark ? "-dark" : ""}.png` });
  console.log(dark, log.errors, log.unmocked, log.external.slice(0, 3));
  await page.close();
}
await close(); s.close();
