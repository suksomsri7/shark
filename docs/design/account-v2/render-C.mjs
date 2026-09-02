// เรนเดอร์แบบร่างโมดูลบัญชี V2 รอบ 2 ชุด C จาก mockup-C.html (§10, §8.4 ของ DESIGN-SPEC-V2.md)
// รัน: XDG_RUNTIME_DIR=/tmp/xdgrt node docs/design/account-v2/render-C.mjs
import pptr from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const OUT = "/root/projects/shark-accounting/docs/design/account-v2";

// id → ชื่อไฟล์ (ตรงกับ DESIGN-SPEC-V2.md §15 แถว C)
const FRAMES = [
  ["g9", "g9-finance-channels"],
  ["g10", "g10-bank-reconcile"],
  ["g11", "g11-wht-deduct"],
  ["g12", "g12-goods-issue-form"],
];

// g9 มีทั้งหน้าปกติ (การ์ดจัดกลุ่มครบ) และโมดัล "เพิ่มช่องทางการเงิน" เปิดค้างอยู่ในมาร์กอัป → ถ่าย 2 ใบ
//   g9-finance-channels.png       = โมดัลปิด (no-menu) — การ์ดกลุ่มช่องทางเห็นครบ
//   g9-finance-channels-modal.png = โมดัลเปิด — ไว้ตรวจฟิลด์ §10.1 ในโมดัล
const TWO_SHOT = new Set(["g9"]);
const setPlain = (id, on) =>
  p.evaluate(
    (i, v) => document.getElementById(i).classList.toggle("no-menu", v),
    id,
    on,
  );

const b = await pptr.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--user-data-dir=/tmp/chr-mockup-acc-C",
  ],
});
const p = await b.newPage();
await p.setViewport({ width: 1560, height: 1000, deviceScaleFactor: 2 });
await p.goto(`file://${OUT}/mockup-C.html`, { waitUntil: "networkidle2" });
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
  if (TWO_SHOT.has(id)) {
    await setPlain(id, true);
    await el.screenshot({ path: `${OUT}/${name}.png` });
    let box = await el.boundingBox();
    console.log(`✓ ${name}.png  ${Math.round(box.width)}×${Math.round(box.height)}  (โมดัลปิด)`);
    await setPlain(id, false);
    await el.screenshot({ path: `${OUT}/${name}-modal.png` });
    box = await el.boundingBox();
    console.log(`✓ ${name}-modal.png  ${Math.round(box.width)}×${Math.round(box.height)}  (โมดัลเปิด)`);
  } else {
    await el.screenshot({ path: `${OUT}/${name}.png` });
    const box = await el.boundingBox();
    console.log(`✓ ${name}.png  ${Math.round(box.width)}×${Math.round(box.height)}`);
  }
}

// ── QC: ไม่มีอะไรถูกตัดที่ขอบขวา/ล่างของแต่ละเฟรม ──────────────────────────
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
    out.push({ id, worstB: worstB.toFixed(1), whoB, worstR: worstR.toFixed(1), whoR });
  }
  return out;
}, FRAMES.map(([id]) => id));
let anyBad = false;
for (const s of spill) {
  if (+s.worstB > 0) { anyBad = true; console.log(`✗ ล้นขอบล่าง ${s.id}: ${s.whoB} +${s.worstB}px`); }
  if (+s.worstR > 0) { anyBad = true; console.log(`✗ ล้นขอบขวา ${s.id}: ${s.whoR} +${s.worstR}px`); }
}
if (!anyBad) console.log("✓ ไม่มีอะไรถูกตัดที่ขอบของทุกเฟรม");

await b.close();
if (missing.length) {
  console.error(`ยังไม่มีเฟรม: ${missing.join(", ")}`);
  process.exit(1);
}
