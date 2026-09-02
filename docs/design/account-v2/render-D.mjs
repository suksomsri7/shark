// เรนเดอร์แบบร่างโมดูลบัญชี V2 รอบ 2 ชุด D จาก mockup-D.html (§9.4, §9.5, §12, §11.2 ของ DESIGN-SPEC-V2.md)
// รัน: XDG_RUNTIME_DIR=/tmp/xdgrt node docs/design/account-v2/render-D.mjs
import pptr from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const OUT = "/root/projects/shark-accounting/docs/design/account-v2";

// id → ชื่อไฟล์ (ตรงกับ DESIGN-SPEC-V2.md §15 แถว D)
// g14/g16 มีป็อปโอเวอร์/โมดัลเปิดค้าง → ถ่าย 2 ใบด้วยคลาส .no-menu (เทคนิคเดียวกับ render.mjs รอบ 1)
//   ปิด (no-menu=true)  = ชื่อหลัก (ไว้ตรวจ "เนื้อหา" ให้เห็นครบไม่โดนป็อปโอเวอร์/โมดัลบัง)
//   เปิด (no-menu=false) = ชื่อ suffix (ไว้ตรวจ "โครงป็อปโอเวอร์/โมดัล")
const FRAMES = [
  ["g13", "g13-settings-permissions", null],
  ["g14", "g14-settings-connections", "g14-settings-connections-menu"],
  ["g15", "g15-documents-inbox", null],
  ["g16", "g16-journal", "g16-journal-modal"],
];
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
    "--user-data-dir=/tmp/chr-mockup-acc-D",
  ],
});
const p = await b.newPage();
await p.setViewport({ width: 1560, height: 1000, deviceScaleFactor: 2 });
await p.goto(`file://${OUT}/mockup-D.html`, { waitUntil: "networkidle2" });
await p.evaluateHandle("document.fonts.ready");
await new Promise((r) => setTimeout(r, 900));

const missing = [];
const shots = []; // ["g13-settings-permissions", ...] — ใช้ตรวจล้นขอบทีหลัง
for (const [id, name, openName] of FRAMES) {
  const el = await p.$(`#${id}`);
  if (!el) {
    missing.push(id);
    console.log(`✗ ไม่พบ #${id}`);
    continue;
  }
  if (openName) {
    await setPlain(id, true);
    await el.screenshot({ path: `${OUT}/${name}.png` });
    let box = await el.boundingBox();
    console.log(`✓ ${name}.png  ${Math.round(box.width)}×${Math.round(box.height)}  (ปิด)`);
    shots.push(name);
    await setPlain(id, false);
    await el.screenshot({ path: `${OUT}/${openName}.png` });
    box = await el.boundingBox();
    console.log(`✓ ${openName}.png  ${Math.round(box.width)}×${Math.round(box.height)}  (เปิด)`);
    shots.push(openName);
    await setPlain(id, false); // คืนสถานะปกติ (เปิดค้างไว้) ตามค่าเริ่มต้นของมาร์กอัป
  } else {
    await el.screenshot({ path: `${OUT}/${name}.png` });
    const box = await el.boundingBox();
    console.log(`✓ ${name}.png  ${Math.round(box.width)}×${Math.round(box.height)}`);
    shots.push(name);
  }
}

// ── QC: ไม่มีอะไรถูกตัดที่ขอบขวา/ล่างของแต่ละเฟรม (เช็คสถานะ "เปิด" ของ g14/g16 — เนื้อหาสูงสุด) ──
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
