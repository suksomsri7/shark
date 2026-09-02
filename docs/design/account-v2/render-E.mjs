// เรนเดอร์แบบร่างโมดูลบัญชี V2 รอบ 2 ชุด E (มือถือ 390) จาก mockup-E.html (§13 ของ DESIGN-SPEC-V2.md)
// รัน: XDG_RUNTIME_DIR=/tmp/xdgrt node docs/design/account-v2/render-E.mjs
import pptr from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const OUT = "/root/projects/shark-accounting/docs/design/account-v2";

// id → ชื่อไฟล์ (ตรงกับ DESIGN-SPEC-V2.md §15 แถว E)
const FRAMES = [
  ["g17", "g17-invoice-form"],
  ["g18", "g18-sheet-l2"],
  ["g19", "g19-contact-360"],
  ["g20", "g20-inbox"],
];

const b = await pptr.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--user-data-dir=/tmp/chr-mockup-acc-E",
  ],
});
const p = await b.newPage();
await p.setViewport({ width: 390, height: 1000, deviceScaleFactor: 2 });
await p.goto(`file://${OUT}/mockup-E.html`, { waitUntil: "networkidle2" });
await p.evaluateHandle("document.fonts.ready");
await new Promise((r) => setTimeout(r, 900));

const missing = [];
for (const [id, name] of FRAMES) {
  const el = await p.$(`#${id}`);
  if (!el) {
    missing.push(id);
    console.log(`✗ ไม่พบ #${id}`);
    continue;
  }
  await el.screenshot({ path: `${OUT}/${name}.png` });
  const box = await el.boundingBox();
  console.log(`✓ ${name}.png  ${Math.round(box.width)}×${Math.round(box.height)}`);
}

// ── QC: ไม่มีอะไรถูกตัดที่ขอบขวา/ล่างของแต่ละเฟรม + scrollWidth ต้อง ≤390 ──
const spill = await p.evaluate((ids) => {
  const out = [];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const e = el.getBoundingClientRect();
    const clipped = (n) => {
      for (let q = n.parentElement; q && q !== el; q = q.parentElement) {
        const cs = getComputedStyle(q);
        if (cs.overflow !== "visible" || cs.overflowX !== "visible") return true;
      }
      return false;
    };
    let worstB = 0, whoB = "", worstR = 0, whoR = "";
    for (const n of el.querySelectorAll("*")) {
      const r = n.getBoundingClientRect();
      if (r.height > 0 && r.bottom > e.bottom + 0.6 && !clipped(n)) {
        if (r.bottom - e.bottom > worstB) { worstB = r.bottom - e.bottom; whoB = n.className || n.tagName; }
      }
      if (r.width > 0 && r.right > e.right + 0.6 && !clipped(n)) {
        if (r.right - e.right > worstR) { worstR = r.right - e.right; whoR = n.className || n.tagName; }
      }
    }
    out.push({ id, worstB: worstB.toFixed(1), whoB, worstR: worstR.toFixed(1), whoR, scrollWidth: el.scrollWidth });
  }
  return out;
}, FRAMES.map(([id]) => id));
let anyBad = false;
for (const s of spill) {
  console.log(`  #${s.id} scrollWidth=${s.scrollWidth}`);
  if (+s.worstB > 0) { anyBad = true; console.log(`✗ ล้นขอบล่าง ${s.id}: ${s.whoB} +${s.worstB}px`); }
  if (+s.worstR > 0) { anyBad = true; console.log(`✗ ล้นขอบขวา ${s.id}: ${s.whoR} +${s.worstR}px`); }
  if (s.scrollWidth > 390) { anyBad = true; console.log(`✗ scrollWidth เกิน 390: ${s.id} = ${s.scrollWidth}`); }
}
if (!anyBad) console.log("✓ ไม่มีอะไรถูกตัดที่ขอบของทุกเฟรม และ scrollWidth ≤ 390 ทุกเฟรม");

await b.close();
if (missing.length) {
  console.error(`ยังไม่มีเฟรม: ${missing.join(", ")}`);
  process.exit(1);
}
