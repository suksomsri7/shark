// QC — WO-CV1: ระบบไอคอนของกล่องแชท V2 (มติ V2 "ห้ามมี emoji") · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ตรวจแล้ว 1 ก.ย. 2026 ไม่มีชื่อนี้ในรีโป
//    (มีของเดิม `qc-chat-inbox-ui.mts` ที่คุมรอบ WhatsApp อยู่ — ชุดนี้ **ไม่ทับ** ของนั้น)
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
//
// ⚠️ ชุดนี้เป็น **static ล้วน** (อ่านไฟล์ด้วย fs) ไม่ต่อ DB ไม่ต่อเน็ต
//    🔴 ตัดคอมเมนต์ก่อน grep เสมอ — คอมเมนต์ในรีโปนี้เต็มไปด้วย 🔴 ⚠️ ✅ ซึ่ง **ไม่ใช่ไอคอนบนหน้าจอ**
//       ถ้าไม่ตัด ด่านนี้จะแดงตลอดกาลด้วยเหตุผลที่ผิด (ผลบวกปลอม)
//
// ⚠️ contract-first: `chat/icons.tsx` ยังไม่มี ณ เวลาที่เขียนข้อสอบ (สาย A รอบ 1 เป็นคนสร้าง)
//    ข้อที่ยังไม่มีโค้ด **ต้องแดงอย่างถูกต้อง** ห้าม skip เงียบ
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-V2 §2 · §3 WO-CV1 · มติ V2) ═══════
// IC-1) ทะเบียนไอคอนเดียวของโมดูลแชท (`chat/icons.tsx` หรือ `chat/icons.ts`) มีจริง และ export ตัวเรียกใช้
// IC-2) 🔴 ชื่อไอคอนครบตาม **แบบร่าง** — อ่านรายชื่อจาก `docs/design/chat-v2/mockup.html`
//       (`<symbol id="i-*">`) ไม่ใช่ลิสต์ที่พิมพ์ไว้ในข้อสอบ · แบบร่างเปลี่ยน ข้อสอบตามทันที
//       เทียบแบบ **ตัดขีด/ตัวพิมพ์ทิ้ง** (`bell-off` = `bellOff` = `belloff`) — ล็อกของที่มี ไม่ล็อกสไตล์การตั้งชื่อ
// IC-3) โทเคนไอคอนตรง §2: `viewBox="0 0 24 24"` · stroke-width 1.7 (ตัวเล็ก 1.9) · linecap/linejoin round
//       · `stroke="currentColor"` · `fill="none"` เป็นค่าตั้งต้น (glyph ที่ต้องทึบใช้ `currentColor` ได้)
//       🔴 ห้ามฝังสีคงที่ (hex) ในทะเบียนไอคอนทั่วไป — สีมาจาก currentColor เท่านั้น
//          (สีแบรนด์ของช่องทางเป็นคนละเรื่อง อยู่ในทะเบียนช่องทาง = อนุญาต)
// IC-4) 🔴 **ห้ามมี emoji เหลือในโมดูลแชท** (มติ V2) — วันนี้ใช้ 📎 📷 ✨ 🌐 🕐 ✓ ✗ ทั่วทั้งโมดูล
//       วัดหลังตัดคอมเมนต์ · มี **คู่บวก** พิสูจน์ว่าตัวสแกนเจอ emoji จริงได้ และไม่ตีข้อความไทยเป็น emoji
// IC-5) ไม่มีใครวาด SVG เองกระจัดกระจาย — `<svg` ปรากฏได้เฉพาะในไฟล์ทะเบียน
// IC-6) 🔴 ปิดหนี้ H4: ลิสต์ป้ายช่องทางต้องเหลือ **ทะเบียนเดียว**
//       (วันนี้ยังมี `CHANNEL_LABEL_TH` ใน chat/service.ts และ `CHAT_CHANNEL_TH` ใน ai/tools.ts)
//       และทะเบียนต้องมี ป้ายไทย + สี + **`isSupported`** (ไอคอนมี ≠ ช่องทางใช้ได้)
// IC-7) ทะเบียนช่องทางครอบทุกค่าใน enum `ChatChannelType` (อ่าน enum จากสคีมาจริง)
// IC-8) ไม่ดึงไอคอนจาก CDN ภายนอก (โหลดช้า/หายได้/บอกบุคคลที่สามว่าร้านไหนเปิดแชทอยู่)
// IC-9) ห้ามฮาร์ดโค้ดวันที่/ปีในไฟล์ไอคอน (ข้อสอบ/โค้ดที่ผูกวันที่ตายตัวเน่าตามเวลา)
//
// 🔴 สิ่งที่ชุดนี้ **วัดไม่ได้** และต้องพึ่ง `visual-qc-chat-v2.mts`:
//    ค่าที่เบราว์เซอร์คำนวณจริง (คลาสที่เขียนไว้แล้วถูกทับ grep จับไม่ได้ — §6 ข้อ 2)

try { process.loadEnvFile?.(".env"); } catch {}

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// 🔴 Fable 1 ก.ย. — หา "รากรีโป" โดยเดินขึ้นจนเจอ package.json แทนการนับชั้นตายตัว
//    ของเดิม `resolve(import.meta.dirname, "..")` ถูกเมื่ออยู่ใน `scripts/` แต่พังทันทีที่ย้ายมา
//    `scripts/pending/` (ชี้ไป `scripts/` → `read()` คืนสตริงว่าง → **แดงหลอก 13 ข้อทั้งที่โค้ดถูก**)
//    ⇒ ชุดนี้ต้องรันได้เหมือนกันทั้งตอนพักและตอนย้ายเข้าเป็นด่านจริง (มติ D5)
const ROOT = (() => {
  let d = import.meta.dirname;
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(d, "package.json"))) return d;
    d = resolve(d, "..");
  }
  throw new Error("หารากรีโปไม่เจอ (เดินขึ้นไป 6 ชั้นแล้วไม่เจอ package.json)");
})();

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const j = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const section = (id: string, name: string, fn: () => void) => {
  console.log(name);
  try { fn(); } catch (e) { chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }
};

const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
// 🔴 ตัดคอมเมนต์ก่อน grep เสมอ (คง `://` ของ URL ไว้)
const strip = (s: string) => s.replace(/([a-z])\/\*/g, "$1/\u0000").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\u0000/g, "*").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1"); // 🔴 D24: กัน `image/*` `audio/*` ในสตริงถูกนับเป็นเปิดคอมเมนต์ (เคยกินโค้ดหาย 12k ตัวอักษร)

/** ไล่ไฟล์ .ts/.tsx ทั้งโฟลเดอร์ (ใช้กับโมดูลแชท + หน้าแชท) */
function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return /\.tsx?$/.test(abs) ? [rel] : [];
  const out: string[] = [];
  for (const e of readdirSync(abs)) out.push(...walk(join(rel, e)));
  return out;
}

// ───────── ไฟล์ที่ถือว่าเป็น "โมดูลแชท" (ที่คนใช้งานเห็น) ─────────
const CHAT_FILES = [
  ...walk("src/lib/modules/chat"),
  ...walk("src/app/app/sys/[id]/chat"),
  "src/app/app/sys/[id]/page.tsx",
].filter((p, i, a) => a.indexOf(p) === i && existsSync(join(ROOT, p)));

// ทะเบียนไอคอน — รับได้ทั้ง .tsx และ .ts (ล็อกที่ "มีที่เดียว" ไม่ใช่ที่นามสกุล)
const ICONS_PATH = ["src/lib/modules/chat/icons.tsx", "src/lib/modules/chat/icons.ts"].find((p) => existsSync(join(ROOT, p))) ?? "";
const ICONS_RAW = ICONS_PATH ? read(ICONS_PATH) : "";
const ICONS = strip(ICONS_RAW);
const CHANNEL_ICON_RAW = read("src/lib/modules/chat/channel-icon.tsx");
const CHANNEL_ICON = strip(CHANNEL_ICON_RAW);
const REGISTRY_FILES = new Set([ICONS_PATH, "src/lib/modules/chat/channel-icon.tsx"].filter(Boolean));

const SCHEMA = read("prisma/schema/chat.prisma");
const CHANNEL_ENUM = (() => {
  const m = SCHEMA.match(/enum ChatChannelType \{([\s\S]*?)\n\}/);
  if (!m) return [];
  return m[1]!.split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter((l) => /^[A-Z_]+$/.test(l));
})();

// ───────── ตัวสแกน emoji ─────────
// ช่วงที่นับว่าเป็น "ไอคอนรูปภาพ": pictographs · dingbats/misc symbols · geometric+misc · VS16
// 🔴 จงใจ **ไม่** รวมลูกศร (U+2190–U+21FF) เพราะ → ← ใช้ในข้อความอธิบายเป็นเครื่องหมายวรรคตอน
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2049}\u{203C}]/gu;
const scanEmoji = (s: string): string[] => [...s.matchAll(EMOJI_RE)].map((m) => m[0]!);

// ───────── ชื่อไอคอนที่แบบร่างสัญญาไว้ (อ่านจาก mockup.html จริง) ─────────
const MOCKUP = read("docs/design/chat-v2/mockup.html");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const WANT_ICONS = [...MOCKUP.matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map((m) => m[1]!);
const WANT_CHANNEL_GLYPHS = [...MOCKUP.matchAll(/<symbol id="c-([a-z0-9-]+)"/g)].map((m) => m[1]!);

/** ชื่อที่ "ทะเบียนรู้จัก" — เก็บจากทุกรูปแบบที่คนเขียนจริง (คีย์อ็อบเจกต์ · id · name · case) */
function knownNames(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/^[ \t]*["']?([A-Za-z][\w-]*)["']?\s*:/gm)) out.add(norm(m[1]!));
  for (const m of src.matchAll(/\b(?:id|name)\s*[=:]\s*["'`]([A-Za-z][\w-]*)["'`]/g)) out.add(norm(m[1]!));
  for (const m of src.matchAll(/case\s+["']([A-Za-z][\w-]*)["']/g)) out.add(norm(m[1]!));
  return out;
}

try {
  // ═════════ IC-1 · ทะเบียนไอคอนเดียว ═════════
  section("IC-1", "IC-1 ทะเบียนไอคอนเดียวของโมดูลแชท:", () => {
    chk("IC-1.1", "มีไฟล์ทะเบียนไอคอน src/lib/modules/chat/icons.tsx (หรือ .ts)",
      ICONS.length > 0, "มีไฟล์", "ยังไม่มี — สาย A (WO-CV1) ยังไม่สร้าง");
    chk("IC-1.2", "export ตัวเรียกใช้ไอคอนตัวเดียว (`Icon`) ให้ทุกหน้าจอใช้ร่วมกัน",
      /export\s+(function|const)\s+Icon\b/.test(ICONS), "export Icon", ICONS ? "ไม่พบ export Icon" : "ยังไม่มีไฟล์");
    chk("IC-1.3", "ชื่อไอคอนถูกผูกเป็น type (พิมพ์ชื่อผิด = typecheck แดง ไม่ใช่ไอคอนหาย)",
      /(IconName|keyof typeof)/.test(ICONS), "มี IconName / keyof typeof", ICONS ? "รับ string ดิบ — พิมพ์ผิดแล้วเงียบ" : "ยังไม่มีไฟล์", "MAJOR");
  });

  // ═════════ IC-2 · ชื่อไอคอนครบตามแบบร่าง ═════════
  section("IC-2", "IC-2 ชื่อไอคอนครบตามแบบร่าง (อ่านจาก mockup.html):", () => {
    chk("IC-2.1", "🟢 คู่บวก: อ่านรายชื่อ <symbol id=\"i-*\"> จากแบบร่างได้จริง",
      WANT_ICONS.length >= 25, "≥25 ชื่อ", `${WANT_ICONS.length} ชื่อ — แบบร่างหาย/รูปเปลี่ยน ให้แก้ข้อสอบ`);
    const have = knownNames(ICONS);
    const missing = WANT_ICONS.filter((n) => !have.has(norm(n)));
    chk("IC-2.2", `🔴 ทะเบียนมีไอคอนครบทุกตัวที่แบบร่างใช้ (${WANT_ICONS.length} ตัว) — ขาดตัวไหน = ช่องว่างบนหน้าจอจริง`,
      ICONS.length > 0 && missing.length === 0, "ครบทุกชื่อ", ICONS ? `ขาด ${j(missing)}` : "ยังไม่มีไฟล์ทะเบียน");
    // แบบร่างมี glyph ช่องทางแยกอีกชุด (`<symbol id="c-*">`) — ของพวกนั้นเป็น **โลโก้แบรนด์**
    // ต้องอยู่ทะเบียนช่องทาง (`channel-icon.tsx`) เท่านั้น ไม่ใช่ปนในทะเบียนไอคอน UI
    // 🔴 วัดว่า "ไม่ปน" ไม่ใช่วัดชื่อ — ครบทุกช่องทางหรือไม่ วัดที่ IC-7.2 จาก enum จริง
    const brandInUi = ["LINE", "WhatsApp", "Instagram", "TikTok", "Messenger", "Shopee", "Lazada"]
      .filter((b) => new RegExp(`\\b${b}\\b`, "i").test(ICONS));
    chk("IC-2.3", `แบบร่างมี glyph ช่องทางแยก ${WANT_CHANNEL_GLYPHS.length} ตัว — โลโก้แบรนด์ห้ามปนในทะเบียนไอคอน UI`,
      WANT_CHANNEL_GLYPHS.length > 0 && brandInUi.length === 0, "โลโก้แบรนด์อยู่ channel-icon.tsx อย่างเดียว",
      `พบโลโก้แบรนด์ใน icons.tsx: ${j(brandInUi)}`, "MAJOR");
  });

  // ═════════ IC-3 · โทเคนของไอคอน ═════════
  section("IC-3", "IC-3 โทเคนไอคอนตรง §2 (เส้นบาง minimal · ห้ามฝังสี):", () => {
    chk("IC-3.1", 'viewBox="0 0 24 24" ทุกตัว (ขนาดคุมจากภายนอกได้ตัวเดียวจบ)',
      ICONS.length > 0 && /viewBox=["']0 0 24 24["']/.test(ICONS) && !/viewBox=["'](?!0 0 24 24)/.test(ICONS),
      "viewBox 24 อย่างเดียว", ICONS ? j([...ICONS.matchAll(/viewBox=["']([^"']+)["']/g)].map((m) => m[1]).filter((v) => v !== "0 0 24 24")) : "ยังไม่มีไฟล์");
    chk("IC-3.2", "stroke-width 1.7 (ตัวเล็ก 1.9) ตามโทเคน",
      /1\.7/.test(ICONS) && /1\.9/.test(ICONS), "พบทั้ง 1.7 และ 1.9", ICONS ? "ไม่ครบ — โทเคนเส้นไม่ตรงแบบร่าง" : "ยังไม่มีไฟล์");
    chk("IC-3.3", "linecap/linejoin = round (มติ V2 'เส้นบาง minimal clean')",
      /round/.test(ICONS) && /(strokeLinecap|stroke-linecap)/.test(ICONS) && /(strokeLinejoin|stroke-linejoin)/.test(ICONS),
      "round ทั้ง cap และ join", ICONS ? "ไม่ครบ" : "ยังไม่มีไฟล์");
    // 🔴 ยอมรับทั้งค่าคงที่ (`fill="none"`) และนิพจน์ (`fill={filled ? "currentColor" : "none"}`)
    //    เจตนาคือ "สีมาจาก currentColor และไม่ทาสีทึบโดยไม่ตั้งใจ" ไม่ใช่รูปแบบการเขียน
    chk("IC-3.4", "stroke = currentColor + fill = none เป็นค่าตั้งต้น",
      /stroke\s*=\s*[{"'][^\n]*currentColor/.test(ICONS) && /fill\s*=\s*[{"'][^\n]*none/.test(ICONS),
      "currentColor + fill none", ICONS ? "ไม่ครบ" : "ยังไม่มีไฟล์");
    const hexes = [...ICONS.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]!);
    chk("IC-3.5", "🔴 ไม่มีสี hex ฝังในทะเบียนไอคอนทั่วไป — สีต้องมาจาก currentColor (สีแบรนด์อยู่ทะเบียนช่องทาง)",
      ICONS.length > 0 && hexes.length === 0, "0 hex", ICONS ? j(hexes.slice(0, 6)) : "ยังไม่มีไฟล์");
  });

  // ═════════ IC-4 · ห้ามมี emoji (มติ V2) ═════════
  section("IC-4", "IC-4 🔴 ห้ามมี emoji เหลือในโมดูลแชท (มติ V2):", () => {
    // 🟢 คู่บวกของตัวสแกนเอง — ข้อ "ต้องไม่เกิด X" ที่ไม่มีคู่บวกคือไม้บรรทัดที่โกหก
    chk("IC-4.0a", "🟢 คู่บวก: ตัวสแกนเจอ emoji จริงได้ (📎 📷 ✨ 🌐 🕐 ✓)",
      scanEmoji("ทดสอบ 📎 📷 ✨ 🌐 🕐 ✓").length >= 6, "≥6", `${scanEmoji("ทดสอบ 📎 📷 ✨ 🌐 🕐 ✓").length}`);
    chk("IC-4.0b", "🟢 คู่บวก: ตัวสแกนไม่ตีตัวอักษรไทย/อังกฤษ/ตัวเลขเป็น emoji (กันผลบวกปลอม)",
      scanEmoji("แชทลูกค้า Sarah M. 09:41 · ราคา 24,900 บาท").length === 0, "0", j(scanEmoji("แชทลูกค้า Sarah M. 09:41 · ราคา 24,900 บาท")));
    chk("IC-4.0c", "🟢 คู่บวก: หาไฟล์ของโมดูลแชทเจอ (ถ้าลิสต์ว่าง ข้อล่างจะเขียวหลอก)",
      CHAT_FILES.length >= 10, "≥10 ไฟล์", `${CHAT_FILES.length} ไฟล์`);

    const offenders: string[] = [];
    for (const f of CHAT_FILES) {
      const found = scanEmoji(strip(read(f)));
      if (found.length) offenders.push(`${f.replace("src/lib/modules/chat/", "chat/")}=${[...new Set(found)].join("")}`);
    }
    chk("IC-4.1", "🔴 ไม่มี emoji เหลือในโค้ดของโมดูลแชท (นับหลังตัดคอมเมนต์)",
      offenders.length === 0, "0 ไฟล์", j(offenders));
    // ล็อกตัวที่แผนเรียกชื่อมาตรง ๆ เพื่อให้ข้อความ error ชี้จุดได้ทันที
    const all = CHAT_FILES.map((f) => strip(read(f))).join("\n");
    for (const [id, e, name] of [
      ["IC-4.2", "📎", "คลิปหนีบ"], ["IC-4.3", "📷", "กล้อง"], ["IC-4.4", "✨", "AI"],
      ["IC-4.5", "🌐", "แปลภาษา"], ["IC-4.6", "🔒", "โน้ตภายใน"], ["IC-4.7", "🔔", "แจ้งเตือน"],
      ["IC-4.8", "🕐", "กำลังส่ง"], ["IC-4.9", "✓", "ติ๊กสถานะส่ง"],
    ] as const) {
      chk(id, `เลิกใช้ ${e} (${name}) แล้ว — ต้องเป็นไอคอนจากทะเบียน`, !all.includes(e), `ไม่มี ${e}`, `ยังพบ ${e}`);
    }
  });

  // ═════════ IC-5 · ไม่มีใครวาด SVG เองนอกทะเบียน ═════════
  section("IC-5", "IC-5 SVG อยู่ในทะเบียนเท่านั้น (ไม่กระจัดกระจาย):", () => {
    const strays = CHAT_FILES.filter((f) => !REGISTRY_FILES.has(f) && /<svg[\s>]/i.test(strip(read(f))));
    chk("IC-5.1", "🔴 ไม่มี <svg> เขียนสดนอกไฟล์ทะเบียน (ทุกไอคอนผ่าน <Icon/> ตัวเดียว)",
      strays.length === 0, "0 ไฟล์", j(strays));
    chk("IC-5.2", "🟢 คู่บวก: ไฟล์ทะเบียนเองมี <svg> จริง (ไม่ใช่ผ่านเพราะไม่มีไอคอนเลย)",
      /<svg[\s>]/i.test(ICONS + CHANNEL_ICON), "ทะเบียนมี <svg>", "ทะเบียนว่างเปล่า");
  });

  // ═════════ IC-6 · ทะเบียนช่องทางเดียว (ปิดหนี้ H4) ═════════
  section("IC-6", "IC-6 🔴 ปิดหนี้ H4 — ป้ายช่องทางต้องมีทะเบียนเดียว:", () => {
    const svc = strip(read("src/lib/modules/chat/service.ts"));
    const tools = strip(read("src/lib/ai/tools.ts"));
    const ui = strip(read("src/lib/modules/chat/ui.tsx"));
    chk("IC-6.1", "chat/service.ts เลิกพิมพ์ลิสต์ CHANNEL_LABEL_TH เอง (ใช้ทะเบียนกลาง)",
      !/CHANNEL_LABEL_TH\s*[:=]/.test(svc), "ไม่มีลิสต์ซ้ำ", "ยังมี CHANNEL_LABEL_TH ใน service.ts");
    chk("IC-6.2", "ai/tools.ts เลิกพิมพ์ลิสต์ CHAT_CHANNEL_TH เอง (ใช้ทะเบียนกลาง)",
      !/CHAT_CHANNEL_TH\s*[:=]/.test(tools), "ไม่มีลิสต์ซ้ำ", "ยังมี CHAT_CHANNEL_TH ใน ai/tools.ts");
    chk("IC-6.3", "chat/ui.tsx ไม่มีลิสต์ป้ายช่องทางพิมพ์มือ",
      !/const CHANNEL_LABEL\b/.test(ui), "ไม่มี", "ยังมี CHANNEL_LABEL ใน ui.tsx");
    chk("IC-6.4", "ทะเบียนช่องทางมีป้ายไทย + สีแบรนด์ ครบในที่เดียว",
      /label\s*:/.test(CHANNEL_ICON) && /color\s*:/.test(CHANNEL_ICON), "มี label + color", "ไม่ครบ");
    chk("IC-6.5", "🔴 ทะเบียนบอกได้ด้วยว่าช่องทางนั้น 'ใช้ได้จริงไหม' (isSupported) — ไอคอนมี ≠ ช่องทางใช้ได้",
      /isSupported/.test(CHANNEL_ICON), "อ้าง isSupported จาก adapter registry",
      "ทะเบียนไม่รู้จักสถานะจริง — หน้าจอจะหลอกว่าเชื่อม WhatsApp/IG/TikTok ได้แล้ว");
  });

  // ═════════ IC-7 · ครบทุกค่าใน enum ═════════
  section("IC-7", "IC-7 ทะเบียนช่องทางครอบทุกค่าใน enum จริง:", () => {
    chk("IC-7.1", "🟢 คู่บวก: อ่าน enum ChatChannelType จากสคีมาได้", CHANNEL_ENUM.length >= 9, "≥9 ค่า", j(CHANNEL_ENUM));
    const miss = CHANNEL_ENUM.filter((c) => !new RegExp(`\\b${c}\\b`).test(CHANNEL_ICON));
    chk("IC-7.2", "ทะเบียนครบทุกค่าใน enum (ขาดค่าไหน = ป้ายว่างบนหน้าจอจริง)",
      CHANNEL_ICON.length > 0 && miss.length === 0, "ครบ", j(miss));
    chk("IC-7.3", "ผูกกับ Record<ChatChannelType, …> เต็มรูป (เพิ่ม enum แล้วลืม = typecheck แดง)",
      /Record<\s*ChatChannelType/.test(CHANNEL_ICON), "Record<ChatChannelType,…>", "เป็น Record<string,…> — ลืมแล้วเงียบ");
  });

  // ═════════ IC-8/9 · สุขอนามัยของไฟล์ ═════════
  section("IC-8", "IC-8/9 สุขอนามัยของไฟล์ไอคอน:", () => {
    const both = ICONS + "\n" + CHANNEL_ICON;
    chk("IC-8.1", "ไม่ดึงไอคอนจาก URL ภายนอก (CDN)",
      !/https?:\/\//.test(both.replace(/xmlns="[^"]*"/g, "")), "ไม่มี URL ภายนอก",
      j((both.replace(/xmlns="[^"]*"/g, "").match(/https?:\/\/\S+/g) ?? []).slice(0, 3)));
    chk("IC-9.1", "🔴 ไม่มีวันที่/ปีฮาร์ดโค้ดในไฟล์ทะเบียน (ของที่ผูกวันที่ตายตัวเน่าตามเวลา)",
      !/\b20\d{2}-\d{2}-\d{2}\b/.test(both), "ไม่มี", j((both.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? []).slice(0, 3)));
  });
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT V2 ICONS =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
