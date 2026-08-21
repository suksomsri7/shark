// ถ่ายรูปหน้าจอสำหรับ "หน้าร้าน" บน App Store — ขนาดต้องเป๊ะตามที่ Apple บังคับ
//
// ต่างจาก scripts/shot-landing.mjs (ที่ถ่ายไปใช้บนเว็บ ขนาดอิสระ):
// สโตร์รับเฉพาะขนาดตายตัว — iPhone 6.7" = 1290×2796 · ผิดไป 1 พิกเซลก็ถูกปฏิเสธ
// → viewport 430×932 ที่ deviceScaleFactor 3 = 1290×2796 พอดี · ห้าม fullPage (จะสูงเกิน)
// 🔴 อย่าใช้ 6.9" (1320×2868): ASC API ยังไม่รู้จัก APP_IPHONE_69 — ตัวใหญ่สุดที่รับคือ APP_IPHONE_67
//
// ถ่ายจากระบบจริงบน prod ด้วยบัญชีผู้ตรวจ — ไม่ใช่ภาพ mock (Apple 2.3 Accurate Metadata)
//
// ใช้: REVIEW_EMAIL_QC=... REVIEW_OTP_QC=... node scripts/shot-appstore.mjs
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { mkdirSync } from "node:fs";

const BASE = "https://shark.in.th";
const EMAIL = process.env.REVIEW_EMAIL_QC;
const OTP = process.env.REVIEW_OTP_QC;
if (!EMAIL || !OTP) {
  console.error("ต้องส่ง REVIEW_EMAIL_QC + REVIEW_OTP_QC มาทาง env");
  process.exit(1);
}

const OUT = "/tmp/appstore-shots";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium-browser",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-as-${process.pid}`],
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 3 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.type('input[type="email"]', EMAIL);
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((x) => /รหัส|ส่ง|ต่อ/.test(x.textContent ?? ""))?.click();
});
await wait(4000);
await page.evaluate((code) => {
  const inp = [...document.querySelectorAll("input")].find((i) => i.type !== "email" && i.type !== "hidden");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inp, code);
  inp.dispatchEvent(new Event("input", { bubbles: true }));
}, OTP);
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((x) => /เข้าสู่ระบบ|ยืนยัน|ต่อ/.test(x.textContent ?? ""))?.click();
});
await wait(6000);
if (/\/login/.test(page.url())) {
  console.error("login ไม่ผ่าน:", (await page.evaluate(() => document.body.innerText)).slice(0, 300));
  await browser.close();
  process.exit(1);
}

const POS = "cmt18s57k00046kkzbsctgc8f";
const INV = "cmt18s59o00066kkzv68jmb3q";
const HR = "cmt18s5bf00086kkz8cbpu0fr";
// เรียงตามลำดับที่อยากให้คนเลื่อนเห็นในสโตร์ — ใบแรกสำคัญสุด (คนส่วนใหญ่เห็นแค่ 1-2 ใบแรก)
const SHOTS = [
  { n: 1, file: "01-home", path: "/app" },
  { n: 2, file: "02-pos", path: `/app/sys/${POS}/pos/register` },
  { n: 3, file: "03-calendar", path: "/app/calendar" },
  { n: 4, file: "04-inventory", path: `/app/sys/${INV}/inventory/items` },
  { n: 5, file: "05-hr", path: `/app/sys/${HR}/hr/employees` },
];

for (const s of SHOTS) {
  await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle2", timeout: 45000 });
  await wait(3500);
  const p = `${OUT}/${s.file}.png`;
  await page.screenshot({ path: p }); // ไม่ fullPage → ได้ขนาด viewport×3 พอดี
  console.log(`✅ ${s.file}  ${page.url()}`);
}

await browser.close();
