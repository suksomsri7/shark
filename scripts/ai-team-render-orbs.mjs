// เรนเดอร์ลูกแก้ว (orb) ของทีมพนักงาน AI เป็น PNG 12 ไฟล์ → apps/mobile/assets/team/orbs/<department>-<light|dark>.png  (T0.3 · คำตัดสิน OQ-3)
// ที่มา = CSS ของ mockup ตรง ๆ (อ่านจากไฟล์ generator ตอนรัน ไม่ได้คัดลอกค่ามาไว้ที่นี่):
//   ledger/design-ai-team/gen_glass_airy.py  → กฎ `.ao{…}` (ไล่สี radial 4 ชั้นที่ใช้ --c1/--c2 + เงาใน + ขอบ) และ `.o1 … .o6` (สีของแต่ละแผนก)
//   ledger/design-ai-team/gen_airy_dark.py   → กฎ `.ao{border-color…;box-shadow…}` ของโหมดมืด
//   o1 sales · o2 chat · o3 account · o4 content · o5 member · o6 custom
// วิธี: chromium headless วาด HTML ชั่วคราว (page.setContent — ไม่มีไฟล์ชั่วคราว ไม่มีเครือข่าย: ทุก request ถูกตัดทิ้ง) แล้วถ่ายทีละลูกบนพื้นโปร่งใส
//   · ลูกแก้วของ mockup โปร่งแสง (เห็นพื้นจอทะลุ) → รองด้วยวงกลมสีพื้นจอของโหมดนั้น (.screen: สว่าง #fbfbfd · มืด #0e0e15) ⇒ กลางลูกทึบ มุมภาพโปร่งใส
//   · เงา "นอก" ของ .ao ไม่ได้อบลงภาพ (ภาพสี่เหลี่ยมจะตัดเงาขาด) — คอมโพเนนต์ Orb ใส่เองจาก colors.orbShadow · เงา "ใน" (inset) + ขอบ อยู่ในภาพ
//   · ขนาดอ้างอิง REF_CSS px: ขอบ 2px และเงาในของ CSS เป็นค่าคงที่ไม่ย่อตามขนาดลูก — เลือก 80 px (กลางระหว่างลูกในแถว 48 กับลูกใหญ่ 138)
//     × SCALE 4 = ภาพ 320×320 px (≥ 3 เท่าของลูกใหญ่สุดในแอป 100 pt)
// รัน (งาน chromium ต้องต่อคิวล็อกเครื่อง):  bash scripts/iso.sh bash scripts/with-gate-lock.sh node scripts/ai-team-render-orbs.mjs
// ผลซ้ำได้: รันใหม่บน generator เดิม = ภาพเดิม · แก้สี orb ใน mockup → รันสคริปต์นี้ใหม่แล้ว commit PNG
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "apps/mobile/assets/team/orbs");
const GEN_LIGHT = join(ROOT, "ledger/design-ai-team/gen_glass_airy.py");
const GEN_DARK = join(ROOT, "ledger/design-ai-team/gen_airy_dark.py");
const REF_CSS = 80;
const SCALE = 4;
const DEPARTMENTS = ["sales", "chat", "account", "content", "member", "custom"]; // = o1 … o6
const SCREEN_BG = { light: "#fbfbfd", dark: "#0e0e15" };

const fail = (msg) => {
  console.error(`ai-team-render-orbs: ${msg}`);
  process.exit(1);
};
const lightSrc = readFileSync(GEN_LIGHT, "utf8");
const darkSrc = readFileSync(GEN_DARK, "utf8");
const aoRule = /\.ao\{[^}]*\}/.exec(lightSrc)?.[0] ?? fail("gen_glass_airy.py: no .ao{…} rule");
const palette = DEPARTMENTS.map((_, i) => new RegExp(`\\.o${i + 1}\\{(--c1:[^}]*)\\}`).exec(lightSrc)?.[1] ?? fail(`gen_glass_airy.py: no .o${i + 1}{--c1…} rule`));
const aoDark = /\n\.ao\{([^}]*)\}/.exec(darkSrc)?.[1] ?? fail("gen_airy_dark.py: no .ao{…} rule");

/** ตัดเงานอกออกจาก box-shadow (เหลือเฉพาะชั้น inset) — แยกด้วย , ที่ไม่อยู่ในวงเล็บ */
const insetOnly = (css) =>
  css.replace(/box-shadow:([^;}]*)/g, (_m, v) => {
    const layers = String(v).split(/,(?![^(]*\))/).map((s) => s.trim());
    const kept = layers.filter((s) => s.startsWith("inset"));
    return `box-shadow:${kept.length ? kept.join(",") : "none"}`;
  });

const cells = [];
for (const mode of ["light", "dark"]) {
  DEPARTMENTS.forEach((d, i) => cells.push({ id: `${d}-${mode}`, mode, cls: `o${i + 1}` }));
}
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent}
${insetOnly(aoRule)}
${palette.map((p, i) => `.o${i + 1}{${p}}`).join("\n")}
.dark .ao{${insetOnly(aoDark)}}
.cell{position:absolute;width:${REF_CSS}px;height:${REF_CSS}px;border-radius:50%}
.cell .ao{width:${REF_CSS}px;height:${REF_CSS}px}
</style></head><body>
${cells.map((c, i) => `<div id="${c.id}" class="cell ${c.mode}" style="left:${(i % 6) * (REF_CSS + 20) + 10}px;top:${Math.floor(i / 6) * (REF_CSS + 20) + 10}px;background:${SCREEN_BG[c.mode]}"><div class="ao ${c.cls}"></div></div>`).join("\n")}
</body></html>`;

// โปรไฟล์ chromium ต้องถูกลบหลังปิด (snap chromium เห็น /tmp ของตัวเอง)
const UDD = `/tmp/chr-ai-orbs-${process.pid}`;
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, timeout: 180_000, protocolTimeout: 300_000, args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=${UDD}`] });
let written = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 6 * (REF_CSS + 20) + 20, height: 2 * (REF_CSS + 20) + 20, deviceScaleFactor: SCALE });
  await page.setRequestInterception(true);
  page.on("request", (req) => (req.url().startsWith("data:") || req.url() === "about:blank" ? req.continue() : req.abort()));
  await page.setContent(html, { waitUntil: "load" });
  mkdirSync(OUT, { recursive: true });
  for (const c of cells) {
    const box = await page.evaluate((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    }, c.id);
    const png = await page.screenshot({ type: "png", omitBackground: true, clip: box });
    writeFileSync(join(OUT, `${c.id}.png`), png);
    written++;
  }
} finally {
  await browser.close().catch(() => {});
  for (const d of [UDD, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-ai-orbs-${process.pid}`]) rmSync(d, { recursive: true, force: true });
}
console.log(`ai-team-render-orbs: wrote ${written} PNG (${REF_CSS * SCALE}×${REF_CSS * SCALE}) → apps/mobile/assets/team/orbs`);
process.exit(written === cells.length ? 0 : 1);
