// ถ่ายรูปหน้าจอ "ของจริง" จาก prod มาใช้บน landing
//
// ทำไมต้องถ่ายจากของจริง: เจ้าของตั้งกติกาไว้ว่าหน้าเว็บห้ามสร้างจาก mock ที่ AI วาดเอง
// และ Apple 2.3 (Accurate Metadata) บังคับว่าภาพในหน้าโปรโมทต้องตรงกับสิ่งที่ผู้ใช้เจอจริง
// → login เป็นบัญชีผู้ตรวจ (ร้านตัวอย่างบน prod) แล้วถ่ายหน้าจอตามเส้นทางจริง
//
// ใช้: node scripts/shot-landing.mjs
// ผลลัพธ์: public/shots/*.png  (ยังไม่บีบ — ขั้นบีบทำต่อด้วย pillow)
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { mkdirSync } from "node:fs";

const BASE = "https://shark.in.th";
const EMAIL = process.env.REVIEW_EMAIL_QC;
const OTP = process.env.REVIEW_OTP_QC;
if (!EMAIL || !OTP) {
  console.error("ต้องส่ง REVIEW_EMAIL_QC + REVIEW_OTP_QC มาทาง env (ห้าม hardcode ในไฟล์)");
  process.exit(1);
}

const OUT = "public/shots";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium-browser",
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    `--user-data-dir=/tmp/chr-shot-${process.pid}`,
  ],
});

const page = await browser.newPage();
// 2x = จอ retina — ภาพคมตอนย่อลงครึ่งหนึ่งบนเว็บ
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── login ด้วยบัญชีผู้ตรวจ (OTP ค่าคงที่ที่ตั้งไว้บน prod) ──
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.type('input[type="email"]', EMAIL);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /รหัส|ส่ง|ต่อ/.test(x.textContent ?? ""));
  b?.click();
});
await wait(4000);

const typed = await page.evaluate((code) => {
  const inp = [...document.querySelectorAll("input")].find(
    (i) => i.type !== "email" && i.type !== "hidden",
  );
  if (!inp) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inp, code);
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, OTP);
if (!typed) {
  console.error("หาช่องกรอกรหัสไม่เจอ — หน้าจอตอนนี้:", (await page.evaluate(() => document.body.innerText)).slice(0, 400));
  await browser.close();
  process.exit(1);
}
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /เข้าสู่ระบบ|ยืนยัน|ต่อ/.test(x.textContent ?? ""));
  b?.click();
});
await wait(6000);

const afterLogin = page.url();
console.log("หลัง login อยู่ที่:", afterLogin);
if (/\/login/.test(afterLogin)) {
  console.error("login ไม่ผ่าน:", (await page.evaluate(() => document.body.innerText)).slice(0, 400));
  await browser.close();
  process.exit(1);
}

// ── เส้นทางที่จะถ่าย — ชื่อไฟล์ = ชื่อที่จะอ้างบน landing ──
// id ของร้านตัวอย่างบน prod (ร้านที่ผู้ตรวจสโตร์ใช้) — ดึงจาก DB ตอนถ่าย ไม่ฮาร์ดโค้ดข้อมูลลง landing
const POS = "cmt18s57k00046kkzbsctgc8f";
const INV = "cmt18s59o00066kkzv68jmb3q";
const HR = "cmt18s5bf00086kkz8cbpu0fr";
const SHOTS = [
  { file: "home", path: "/app" },
  { file: "pos", path: `/app/sys/${POS}/pos/register` },
  { file: "calendar", path: "/app/calendar" },
  { file: "inventory", path: `/app/sys/${INV}/inventory/items` },
  { file: "hr", path: `/app/sys/${HR}/hr/employees` },
  { file: "unit", path: "/app/u/siam" },
];

for (const s of SHOTS) {
  try {
    await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle2", timeout: 45000 });
    await wait(3500);
    const url = page.url();
    const text = await page.evaluate(() => document.body.innerText.slice(0, 120).replace(/\s+/g, " "));
    await page.screenshot({ path: `${OUT}/${s.file}.png` });
    console.log(`✅ ${s.file.padEnd(9)} ${s.path} → ${url}  | ${text}`);
  } catch (e) {
    console.log(`❌ ${s.file.padEnd(9)} ${s.path} — ${e.message.slice(0, 120)}`);
  }
}

await browser.close();
