// เรนเดอร์แบบร่างโมดูลบัญชี V2 จาก mockup.html  (WO-ACC-UI-01)
// 🔴 mockup.html คือ "ข้อสอบด้านหน้าตา" — แก้ไฟล์เมื่อไหร่ ต้องรันสคริปต์นี้ให้รูปตรงกันเสมอ
// รัน: XDG_RUNTIME_DIR=/tmp/xdgrt node docs/design/account-v2/render.mjs
import pptr from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const OUT = "/root/projects/shark-accounting/docs/design/account-v2";

// id → ชื่อไฟล์ (ต้องตรงกับ WO §3)
const FRAMES = [
  ["f1", "f1-dashboard"],
  ["f2", "f2-menu-revenue"],
  ["f3", "f3-invoice-list"],
  ["f4", "f4-expense-overview"],
  ["f5", "f5-contacts"],
  ["f6", "f6-products"],
  ["f7", "f7-finance-overview"],
  ["f8", "f8-chart-of-accounts"],
  ["f9", "f9-documents"],
  ["f10", "f10-settings"],
  ["f11", "f11-m-dashboard"],
  ["f12", "f12-m-sheet"],
  ["f13", "f13-m-invoice-list"],
  ["f14", "f14-m-doc-detail"],
];
const MOBILE = new Set(["f11", "f12", "f13", "f14"]);

// เฟรมเดสก์ท็อปที่มีเมนู/แผงเปิดค้างไว้ → ถ่าย 2 ใบ
//   fN-<name>.png       = หน้าเปล่า (ปิดเมนู/แถบ bulk/แผงโปรไฟล์) — ไว้ตรวจ "เนื้อหา"
//   fN-<name>-menu.png  = สถานะเปิด — ไว้ตรวจ "โครงเมนู"
// 🔴 ใช้คลาส .no-menu สลับสถานะ ไม่ก๊อป markup เฟรมซ้ำ (ดู mockup.html §โหมดถ่ายรูป)
// f1 ไม่มีเมนูอยู่แล้ว · f2 คือเฟรม "เมนู" โดยเฉพาะ จึงถ่ายใบเดียวแบบเปิด
const TWO_SHOT = new Set(["f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10"]);
const setPlain = (id, on) =>
  p.evaluate(
    (i, v) => document.getElementById(i).classList.toggle("no-menu", v),
    id,
    on,
  );

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const skipSheet = process.argv.includes("--no-sheet");
const list = only.length ? FRAMES.filter(([id]) => only.includes(id)) : FRAMES;

const b = await pptr.launch({
  executablePath: "/usr/bin/chromium-browser",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--user-data-dir=/tmp/chr-mockup-acc",
  ],
});
const p = await b.newPage();
await p.setViewport({ width: 1560, height: 1000, deviceScaleFactor: 2 });
await p.goto(`file://${OUT}/mockup.html`, { waitUntil: "networkidle2" });
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

// ── QC: เฟรมมือถือต้องไม่ล้นแนวนอน ────────────────────────────────────────
const overflow = await p.evaluate((ids) => {
  const out = [];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const bad = [];
    const e = el.getBoundingClientRect();
    // นับเฉพาะโหนดที่ "ล้นออกนอกกรอบจริง" — ข้ามอันที่พ่ออยู่ในกล่อง overflow:hidden
    // (แถบเลื่อนแนวนอนอย่าง .mnav / .mtabs ตั้งใจให้ล้นแล้วตัด ไม่ทำให้ทั้งหน้าเลื่อน)
    const clipped = (n) => {
      for (let p = n.parentElement; p && p !== el; p = p.parentElement) {
        const ov = getComputedStyle(p).overflowX;
        if (ov === "hidden" || ov === "auto" || ov === "scroll") return true;
      }
      return false;
    };
    for (const n of el.querySelectorAll("*")) {
      const r = n.getBoundingClientRect();
      if (r.width > 0 && r.right > e.right + 0.6 && !clipped(n)) {
        bad.push(`${n.className || n.tagName} +${(r.right - e.right).toFixed(1)}px`);
      }
    }
    out.push({
      id,
      w: el.getBoundingClientRect().width,
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      spill: bad.slice(0, 5),
      spillCount: bad.length,
    });
  }
  return out;
}, [...MOBILE]);
for (const o of overflow) {
  const ok = o.scrollW <= o.clientW && o.spillCount === 0;
  console.log(
    `${ok ? "✓" : "✗"} overflow ${o.id}: กว้าง ${o.w} · scrollWidth ${o.scrollW} / clientWidth ${o.clientW}` +
      (o.spillCount ? ` · ล้น ${o.spillCount} จุด: ${o.spill.join(", ")}` : ""),
  );
}

// ── QC: ไม่มีอะไรถูกตัดที่ขอบล่างของเฟรม (เมนู dropdown ที่เปิดค้างไว้) ──────
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

// ── contact sheet: โคลนทุกเฟรมมาย่อในกริดเดียว ────────────────────────────
if (!skipSheet && !only.length) {
  await p.evaluate((frames) => {
    document.getElementById("sheet")?.remove();
    const sheet = document.createElement("div");
    sheet.id = "sheet";
    // 🔴 ต้องมี z-index สูง + ซ่อนเฟรมต้นฉบับ ไม่งั้น dropdown ของเฟรมจริง (z-index 30)
    //    จะทะลุขึ้นมาทับแผ่นรวม เพราะ element.screenshot() ถ่าย "พื้นที่" ไม่ใช่เฉพาะ element
    sheet.style.cssText =
      "position:absolute;left:0;top:0;z-index:9999;width:2240px;background:#f4f5f7;padding:26px;" +
      "display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start;font-family:'Noto Sans Thai',sans-serif";
    const title = document.createElement("div");
    title.style.cssText =
      "width:100%;font-size:20px;font-weight:700;color:#0a0a0a;margin-bottom:2px";
    title.textContent = "SHARK · แบบร่างโมดูลบัญชี V2 — 14 เฟรม (WO-ACC-UI-01)";
    sheet.appendChild(title);
    for (const [id, name] of frames) {
      const src = document.getElementById(id);
      if (!src) continue;
      // แผ่นรวมใช้ "ใบเปล่า" เพื่อให้เห็นเนื้อหา — เว้น f2 ที่เป็นเฟรมโชว์เมนูโดยเฉพาะ
      if (id !== "f2") src.classList.add("no-menu");
      const scale = src.classList.contains("m") ? 0.62 : 0.36;
      const cell = document.createElement("div");
      const w = src.getBoundingClientRect().width * scale;
      const h = src.getBoundingClientRect().height * scale;
      cell.style.cssText = `width:${w}px`;
      const lab = document.createElement("div");
      lab.style.cssText = "font-size:12px;font-weight:700;color:#404040;margin-bottom:6px";
      lab.textContent = name;
      const box = document.createElement("div");
      box.style.cssText = `width:${w}px;height:${h}px;overflow:hidden;border:1px solid #e5e5e5;border-radius:8px;background:#fff`;
      const cl = src.cloneNode(true);
      cl.removeAttribute("id");
      cl.style.transform = `scale(${scale})`;
      cl.style.transformOrigin = "0 0";
      cl.style.borderRadius = "0";
      cl.style.border = "0";
      box.appendChild(cl);
      cell.appendChild(lab);
      cell.appendChild(box);
      sheet.appendChild(cell);
    }
    document.body.appendChild(sheet);
    const wrap = document.querySelector(".wrap");
    if (wrap) wrap.style.display = "none";
    sheet.style.position = "static";
  }, FRAMES);
  await new Promise((r) => setTimeout(r, 500));
  const sh = await p.$("#sheet");
  await sh.screenshot({ path: `${OUT}/contact-sheet.png` });
  const sb = await sh.boundingBox();
  console.log(`✓ contact-sheet.png  ${Math.round(sb.width)}×${Math.round(sb.height)}`);
}

await b.close();
if (missing.length) {
  console.error(`ยังไม่มีเฟรม: ${missing.join(", ")}`);
  process.exit(1);
}
