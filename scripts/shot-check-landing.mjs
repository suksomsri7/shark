// เรนเดอร์ landing ที่รันอยู่แล้วถ่ายรูปดูจริง — กันยืนยันงานจากโค้ดอย่างเดียว
//
// ใช้: BASE=http://127.0.0.1:3000 node scripts/shot-check-landing.mjs
// ผลลัพธ์: /tmp/landing-<w>.png ต่อความกว้าง + รายงานความสูงหน้า/จำนวนรูปที่โหลดไม่ขึ้น
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const WIDTHS = [430, 1280];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium-browser",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-lc-${process.pid}`],
});

for (const w of WIDTHS) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 1200, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));

  const report = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    const orb = document.querySelector(".ai-orb");
    const beat = document.querySelector(".ai-orb-heartbeat");
    const orbBox = orb?.getBoundingClientRect();
    return {
      height: document.documentElement.scrollHeight,
      imgs: imgs.length,
      broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")),
      orbPresent: !!orb,
      orbSize: orbBox ? `${Math.round(orbBox.width)}x${Math.round(orbBox.height)}` : "-",
      orbSpin: orb ? getComputedStyle(orb).animationName : "-",
      orbRing: orb ? getComputedStyle(orb).getPropertyValue("--orb-ring").trim() : "-",
      beatAnim: beat ? getComputedStyle(beat).animationName : "-",
      systemCards: document.querySelectorAll("section:last-of-type ul li").length,
      // ตัวไหนกว้างเกินจอ = ล้นขอบ (เจอบ่อยตอนใส่รูป/ตารางใหม่)
      overflow: [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 5)
        .map((el) => `${el.tagName}.${(el.className || "").toString().slice(0, 40)}`),
    };
  });
  console.log(`\n── ${w}px ──`);
  console.log(JSON.stringify(report, null, 1));

  await page.screenshot({ path: `/tmp/landing-${w}.png`, fullPage: true });
  await page.close();
}

await browser.close();
