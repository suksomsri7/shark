// สร้างรูปบิลตัวอย่างของ WO 7.2 (กล่องขาเข้า) — `scripts/fixtures/acc-v2/attach/bill-ptt-real.jpg`
//
// ทำไมต้องมี: ชุดข้อมูล QC เดิมมีแต่ `bill-ptt.jpg` ที่เป็นรูปทึบ ๆ (สร้างไว้ทดสอบการอัปโหลดของ WO 7.1)
// ⇒ ภาพหน้าจอของกล่องขาเข้าเห็น thumb เป็นสี่เหลี่ยมเทา เทียบกับเฟรม g15 ไม่ได้ว่า "อ่านบิลใบไหน"
// ที่นี่วาดใบกำกับภาษีอย่างย่อของ ปตท. ด้วย HTML แล้วถ่ายผ่าน chromium (ตัวเดียวกับ visual-acc-v2.mts)
// ตัวเลขบนรูปตรงกับเฉลย: 1,240.00 = ก่อน VAT 1,158.88 + VAT 7% 81.12
//
// รัน (ทำครั้งเดียว · ผลลัพธ์ commit ไว้ในโฟลเดอร์ fixtures):
//   pnpm exec tsx scripts/acc-v2-fixture-bill.mts

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "scripts/fixtures/acc-v2/attach");
const OUT = join(OUT_DIR, "bill-ptt-real.jpg");

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 620px; background: #e9e6e0; font-family: "Noto Sans Thai", "Sarabun", system-ui, sans-serif; }
  .paper { margin: 18px; padding: 22px 26px; background: #fffdf8; border: 1px solid #ddd8cd; box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  h1 { font-size: 21px; margin: 0 0 2px; letter-spacing: .5px; }
  .sub { font-size: 13px; color: #444; margin: 0 0 2px; }
  .kind { margin: 14px 0 10px; text-align: center; font-size: 17px; font-weight: 700; border-top: 1px dashed #b9b3a6; border-bottom: 1px dashed #b9b3a6; padding: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 3px 0; }
  .r { text-align: right; }
  .items th { text-align: left; font-size: 13px; border-bottom: 1px solid #cfc9bb; padding-bottom: 4px; }
  .items td { border-bottom: 1px dotted #ddd8cd; padding: 6px 0; }
  .total { font-size: 19px; font-weight: 800; }
  .foot { margin-top: 14px; font-size: 12px; color: #666; text-align: center; }
</style></head><body>
<div class="paper">
  <h1>ปตท. สถานีบริการฉลอง</h1>
  <p class="sub">123/4 ถ.เจ้าฟ้าตะวันตก ต.ฉลอง อ.เมือง จ.ภูเก็ต 83130</p>
  <p class="sub">เลขประจำตัวผู้เสียภาษี 0107544000094 (สำนักงานใหญ่)</p>
  <div class="kind">ใบเสร็จรับเงิน / ใบกำกับภาษี</div>
  <table>
    <tr><td>เลขที่</td><td class="r">6609-00231</td></tr>
    <tr><td>วันที่</td><td class="r">22 ส.ค. 2569  14:35 น.</td></tr>
    <tr><td>หัวจ่าย / พนักงาน</td><td class="r">4 / อนงค์</td></tr>
  </table>
  <table class="items">
    <tr><th>รายการ</th><th style="text-align:right">ลิตร</th><th style="text-align:right">ราคา/ลิตร</th><th style="text-align:right">จำนวนเงิน</th></tr>
    <tr><td>น้ำมันดีเซล B7</td><td class="r">32.05</td><td class="r">38.69</td><td class="r">1,240.00</td></tr>
  </table>
  <table style="margin-top:10px">
    <tr><td>มูลค่าสินค้า (ก่อนภาษี)</td><td class="r">1,158.88</td></tr>
    <tr><td>ภาษีมูลค่าเพิ่ม 7%</td><td class="r">81.12</td></tr>
    <tr class="total"><td>รวมทั้งสิ้น</td><td class="r">1,240.00</td></tr>
    <tr><td>เงินสด</td><td class="r">1,240.00</td></tr>
  </table>
  <p class="foot">ขอบคุณที่ใช้บริการ · เอกสารออกเป็นชุด</p>
</div>
</body></html>`;

mkdirSync(OUT_DIR, { recursive: true });
const pptr = await import(
  "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string
);
const browser = await pptr.default.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-accv2-fixture-${process.pid}`],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 620, height: 560, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  const buf = (await page.screenshot({ type: "jpeg", quality: 88 })) as Uint8Array;
  writeFileSync(OUT, buf);
  console.log(`✅ เขียนรูปบิลตัวอย่าง ${OUT} (${(buf.length / 1024).toFixed(0)} KB)`);
} finally {
  await browser.close();
}
