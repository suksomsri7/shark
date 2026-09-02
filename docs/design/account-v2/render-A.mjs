// เรนเดอร์มอคอัพรอบ 2 ชุด A จาก mockup-A.html (WO-ACC-UI-02 §15 แถว A)
// รัน: XDG_RUNTIME_DIR=/tmp/xdgrt node docs/design/account-v2/render-A.mjs
import pptr from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const OUT = "/root/projects/shark-accounting/docs/design/account-v2";

const FRAMES = [
  ["g1", "g1-invoice-form"],
  ["g2", "g2-receipt-payment"],
  ["g3", "g3-creditnote-wizard"],
  ["g4", "g4-invoice-detail"],
];

// g1 มีเมนู "อนุมัติใบแจ้งหนี้ ▾" เปิดค้างอยู่ในมาร์กอัป → ถ่าย 2 ใบ เหมือน WO รอบ 1
//   g1-invoice-form.png       = หน้าเปล่า (ปิดเมนู) — ไว้ตรวจ "เนื้อหา" ไม่มีอะไรทับส่วนแนบไฟล์
//   g1-invoice-form-menu.png  = สถานะเปิด — ไว้ตรวจ "โครงเมนู"
const TWO_SHOT = new Set(["g1"]);
const setPlain = (id, on) =>
  p.evaluate(
    (i, v) => document.getElementById(i).classList.toggle("no-menu", v),
    id,
    on,
  );

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const list = only.length ? FRAMES.filter(([id]) => only.includes(id)) : FRAMES;

const b = await pptr.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--user-data-dir=/tmp/chr-mockup-acc-A",
  ],
});
const p = await b.newPage();
await p.setViewport({ width: 1560, height: 1000, deviceScaleFactor: 2 });
await p.goto(`file://${OUT}/mockup-A.html`, { waitUntil: "networkidle2" });
await p.evaluateHandle("document.fonts.ready");
await new Promise((r) => setTimeout(r, 900));

const missing = [];
for (const [id, name] of list) {
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
    console.log(`✓ ${name}.png  ${Math.round(box.width)}×${Math.round(box.height)}  (หน้าเปล่า)`);
    await setPlain(id, false);
    await el.screenshot({ path: `${OUT}/${name}-menu.png` });
    box = await el.boundingBox();
    console.log(`✓ ${name}-menu.png  ${Math.round(box.width)}×${Math.round(box.height)}  (เปิดเมนู)`);
  } else {
    await el.screenshot({ path: `${OUT}/${name}.png` });
    const box = await el.boundingBox();
    console.log(`✓ ${name}.png  ${Math.round(box.width)}×${Math.round(box.height)}`);
  }
}

// ── QC: ไม่มีอะไรถูกตัดที่ขอบล่างของเฟรม ──────────────────────────────────
const vspill = await p.evaluate((ids) => {
  const out = [];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const e = el.getBoundingClientRect();
    const clipped = (n) => {
      for (let q = n.parentElement; q && q !== el; q = q.parentElement) {
        const ov = getComputedStyle(q).overflow;
        if (ov !== "visible") return true;
      }
      return false;
    };
    let worst = 0, who = "";
    for (const n of el.querySelectorAll("*")) {
      const r = n.getBoundingClientRect();
      if (r.height > 0 && r.bottom > e.bottom + 0.6 && !clipped(n)) {
        if (r.bottom - e.bottom > worst) { worst = r.bottom - e.bottom; who = n.className || n.tagName; }
      }
    }
    if (worst > 0) out.push({ id, worst: worst.toFixed(1), who });
  }
  return out;
}, FRAMES.map(([id]) => id));
if (vspill.length) {
  for (const v of vspill) console.log(`✗ ล้นขอบล่าง ${v.id}: ${v.who} +${v.worst}px`);
} else {
  console.log("✓ ไม่มีอะไรถูกตัดที่ขอบล่างของทุกเฟรม");
}

// ── QC: ไม่มีอะไรล้นขอบขวาของเฟรม (1440) ──────────────────────────────────
const hspill = await p.evaluate((ids) => {
  const out = [];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const e = el.getBoundingClientRect();
    const clipped = (n) => {
      for (let q = n.parentElement; q && q !== el; q = q.parentElement) {
        const ov = getComputedStyle(q).overflowX;
        if (ov === "hidden" || ov === "auto" || ov === "scroll") return true;
      }
      return false;
    };
    const bad = [];
    for (const n of el.querySelectorAll("*")) {
      const r = n.getBoundingClientRect();
      if (r.width > 0 && r.right > e.right + 0.6 && !clipped(n)) {
        bad.push(`${n.className || n.tagName} +${(r.right - e.right).toFixed(1)}px`);
      }
    }
    if (bad.length) out.push({ id, bad: bad.slice(0, 5), count: bad.length });
  }
  return out;
}, FRAMES.map(([id]) => id));
if (hspill.length) {
  for (const h of hspill) console.log(`✗ ล้นขอบขวา ${h.id}: ${h.count} จุด — ${h.bad.join(", ")}`);
} else {
  console.log("✓ ไม่มีอะไรล้นขอบขวาของทุกเฟรม");
}

await b.close();
if (missing.length) {
  console.error(`ยังไม่มีเฟรม: ${missing.join(", ")}`);
  process.exit(1);
}
