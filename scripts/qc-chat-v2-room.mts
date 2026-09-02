// QC — WO-CV4: ห้องแชท V2 (แบบร่างจอ 2/3 + `.dcol2`) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ตรวจแล้ว 1 ก.ย. 2026 ไม่มีชื่อนี้ในรีโป
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
// ⚠️ static ล้วน (fs) — ไม่ต่อ DB ไม่ต่อเน็ต · 🔴 ตัดคอมเมนต์ก่อน grep เสมอ
// ⚠️ contract-first: ของหลายอย่างยังไม่มี (สาย E รอบ 3) → ต้องแดงอย่างถูกต้อง ห้าม skip เงียบ
//
// 🔴 หมายเหตุเรื่องการล็อกชื่อ: ข้อที่จับ `Icon name="…"` ล็อก **รูป API ของทะเบียนไอคอน**
//    ซึ่งเป็นสัญญาที่ WO-CV1 กำหนดไว้เอง (`export <Icon name="…"/>` ชุดเดียวทั้งโมดูล)
//    เจตนาคือ "ไอคอนตัวนี้ต้องมาจากทะเบียน ไม่ใช่ emoji/SVG เขียนสด" ไม่ใช่การบังคับสไตล์โค้ด
//    ถ้าวันหนึ่งชื่อไอคอนถูกส่งผ่านตัวแปร ให้แจ้ง Fable ปรับวิธีวัด — ห้ามแก้ข้อสอบเอง
//
// 🔴 **รายการเมนู ⋮ อ่านจากแบบร่างจริง** (`docs/design/chat-v2/mockup.html` บล็อก `.pop`)
//    ไม่ใช่ลิสต์ที่พิมพ์ไว้ในข้อสอบ — แบบร่างคือสัญญา (มติ V3) แบบร่างเปลี่ยนข้อสอบตามทันที
//
// ⚠️ **ข้อขัดแย้งที่ต้องรู้**: แบบร่างเขียนเมนูว่า "แปลอัตโนมัติในห้องนี้" แต่ **มติ W3 (31 ส.ค.)**
//    บอกว่าการแปลต้องเป็น "กดแปลเมื่อต้องการ" ไม่ใช่อัตโนมัติ (คุมค่า AI ~$0.008/ข้อความ)
//    ⇒ ด่านนี้จึงรับได้ทั้ง 2 คำ (ขอแค่มีรายการเรื่อง "แปล" อยู่ในเมนู) และ **รายงานความขัดแย้งไว้ที่นี่**
//    ให้ Fable ตัดสิน — ห้ามให้ข้อสอบเป็นตัวบังคับให้ทำผิดมติเรื่องค่าใช้จ่าย
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-V2 §3 WO-CV4) ═══════
// RM-1) หัวห้องเหลือ 6 ชิ้น: ‹ · avatar · ชื่อ · บรรทัดบริบท · ⌕ · ⋮
//       (ปุ่ม 5 ตัวเดิมย้ายเข้าเมนู ⋮ **ครบ** — ย้ายแล้วต้องไม่เหลือคู่แฝดอยู่บนหัว)
//       🔴 "นับชิ้นบนหัวจริง ๆ" วัดได้จากจอเท่านั้น → อยู่ใน `visual-qc-chat-v2.mts` (VR-2)
//          ที่นี่วัดสิ่งที่ซอร์สพิสูจน์ได้: รายการในเมนูครบ และป้ายเดิมไม่ถูกวาดซ้ำสองที่
// RM-2) เมนู ⋮ ครบ 8 รายการตามแบบร่าง
// RM-3) จัดกลุ่มข้อความ: คนเดียวกันภายใน 3 นาที = ก้อนเดียว · ชื่อผู้ส่งขึ้นครั้งเดียวต่อก้อน
// RM-4) ฟอง 5 ชนิด: ขาเข้า(ขาว) · ขาออก(`--out`) · รูป · **เสียง** (ปุ่มเล่น+คลื่น+เวลา) · โน้ต(เหลือง+กุญแจ)
// RM-5) ตัวคั่นวันที่แบบเม็ดยา (วันนี้/เมื่อวาน) — เขตเวลาไทย
// RM-6) กำลังพิมพ์ = 3 จุด
// RM-7) ค้นหาในห้อง — ต้องค้นในข้อความของ **ห้องนั้น** จริงที่ชั้นข้อมูล ไม่ใช่กรองเฉพาะที่โหลดมาแล้ว
// RM-8) บรรทัดบริบทใต้ชื่อ = "กำลังดูหน้า …" จาก `ChatConversation.meta.pageUrl`
//       🔴 ฟิลด์นี้ถูก **เขียนไว้แล้วแต่ไม่เคยถูกแสดง** (service.ts) — ข้อนี้คือตัวพิสูจน์ว่าถูกปลุกจริง
// RM-9) โทเคนฟอง: มุม 14px · มุมติดหาง 4px · ขาออกใช้ `--out` (ค่าจริงที่เบราว์เซอร์คำนวณ = visual VR-3)
// RM-10) ฟองโน้ตมีป้าย "โน้ตภายใน · ลูกค้าไม่เห็น" + ไอคอนกุญแจจากทะเบียน
// RM-11) ฟองเสียงบอกความยาวได้โดยไม่ต้องโหลดไฟล์ (อ่านจาก `ChatAttachment.durationMs`)
// RM-12) ห้ามฮาร์ดโค้ดวันที่/ปี

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
const strip = (s: string) => s.replace(/([a-z])\/\*/g, "$1/\u0000").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\u0000/g, "*").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1"); // 🔴 D24: กัน `image/*` `audio/*` ในสตริงถูกนับเป็นเปิดคอมเมนต์ (เคยกินโค้ดหาย 12k ตัวอักษร)
function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return /\.tsx?$/.test(abs) ? [rel] : [];
  const out: string[] = [];
  for (const e of readdirSync(abs)) out.push(...walk(join(rel, e)));
  return out;
}

const FILES = [...walk("src/lib/modules/chat"), ...walk("src/app/app/sys/[id]/chat")];
const SCREEN = FILES.filter((f) => f.endsWith(".tsx")).map((f) => strip(read(f))).join("\n");
const SERVER = FILES.filter((f) => f.endsWith(".ts")).map((f) => strip(read(f))).join("\n");
const SCHEMA = read("prisma/schema/chat.prisma");
const MOCKUP = read("docs/design/chat-v2/mockup.html");

/** ตัดคำว่า "…"/"..." ท้ายป้าย + ช่องว่างซ้ำ เพื่อเทียบป้ายแบบไม่จับผิดเรื่องจุดไข่ปลา */
const normLabel = (s: string) => s.replace(/[.…]+$/u, "").replace(/\s+/g, " ").trim();

// ── รายการเมนู ⋮ ตามแบบร่าง (อ่านจาก mockup.html บล็อก `.pop`) ──
const MENU_LABELS = (() => {
  const pop = MOCKUP.match(/<div class="pop">([\s\S]*?)<\/div>\s*<div class="wall">/);
  if (!pop) return [];
  return [...pop[1]!.matchAll(/<div class="pi[^"]*">([\s\S]*?)<\/div>/g)]
    .map((m) => normLabel(m[1]!.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "")))
    .filter(Boolean);
})();
// ป้ายที่ยอมให้เขียนต่างจากแบบร่างได้ + เหตุผลที่ยอม (ห้ามยอมโดยไม่มีเหตุผล)
const ALT: Record<string, RegExp> = {
  // มติ W3: แปล = "กดเมื่อต้องการ" ⇒ ถ้าสายงานเขียนว่า "แปลข้อความในห้องนี้" ถือว่าตรงเจตนา
  "แปลอัตโนมัติในห้องนี้": /แปล[^<\n"]{0,20}ห้องนี้|แปลอัตโนมัติ/,
};

try {
  section("RM-0", "RM-0 คู่บวก — อ่านซอร์ส + แบบร่างได้จริง:", () => {
    chk("RM-0.1", "🟢 เจอไฟล์หน้าจอของโมดูลแชท", SCREEN.length > 5000, "≥5000 ตัวอักษร", `${SCREEN.length}`);
    chk("RM-0.2", "🟢 อ่านรายการเมนู ⋮ จากแบบร่างได้ครบ 8 รายการ",
      MENU_LABELS.length === 8, "8 รายการ", `${MENU_LABELS.length}: ${j(MENU_LABELS)}`);
  });

  // ═════════ RM-1/2 · หัวห้อง + เมนู ⋮ ═════════
  section("RM-1", "RM-1/2 หัวห้อง + เมนู ⋮:", () => {
    chk("RM-1.1", "ปุ่มย้อนกลับ (ไอคอน back จากทะเบียน)", /name=["']back["']/.test(SCREEN), 'Icon name="back"', "ไม่พบ");
    chk("RM-1.2", "ปุ่มค้นหาในห้อง (ไอคอน search)", /name=["']search["']/.test(SCREEN), 'Icon name="search"', "ไม่พบ");
    chk("RM-1.3", "เมนู ⋮ (ไอคอน more)", /name=["']more["']/.test(SCREEN), 'Icon name="more"', "ไม่พบ");
    for (const [i, label] of MENU_LABELS.entries()) {
      const hit = SCREEN.includes(label) || (ALT[label]?.test(SCREEN) ?? false);
      chk(`RM-2.${i + 1}`, `เมนู ⋮ มีรายการ "${label}"`, hit, "มีในหน้าจอ",
        ALT[label] ? "ไม่พบ (รับคำใกล้เคียงได้แล้วยังไม่พบ)" : "ไม่พบ");
    }
    // ย้ายเข้าเมนูแล้วต้องไม่เหลือปุ่มแฝดบนหัว — ป้ายเดียวกันโผล่หลายที่ = ผู้ใช้เจอ 2 ทางที่ทำงานไม่เหมือนกัน
    const dupes = MENU_LABELS.filter((l) => (SCREEN.split(l).length - 1) > 2);
    chk("RM-1.4", "🔴 ป้ายของเมนู ⋮ ไม่ถูกวาดซ้ำหลายที่ (ปุ่มเดิมบนหัวต้องถูก **ย้าย** ไม่ใช่ก๊อป)",
      dupes.length === 0, "ไม่มีป้ายซ้ำเกิน 2 ครั้ง", j(dupes), "MAJOR");
  });

  // ═════════ RM-3 · จัดกลุ่มข้อความ ═════════
  section("RM-3", "RM-3 จัดกลุ่มข้อความ (คนเดียวกัน ภายใน 3 นาที = ก้อนเดียว):", () => {
    chk("RM-3.1", "มีค่าคงที่ช่วงจัดกลุ่ม 3 นาที (180000 / 3*60*1000 / 180_000)",
      /180_?000|3\s*\*\s*60\s*\*\s*1000|3\s*\*\s*60_?000/.test(SCREEN), "พบค่า 3 นาที", "ไม่พบ — ยังไม่จัดกลุ่ม");
    chk("RM-3.2", "จัดกลุ่มดูทั้ง 'คนเดียวกัน' และ 'ช่วงเวลา' (ไม่ใช่รวมทุกข้อความของฝั่งเดียวกันเป็นก้อนเดียว)",
      /(senderUserId|senderName|direction)/.test(SCREEN) && /(group|grp|bundle|cluster)/i.test(SCREEN),
      "มีเงื่อนไขผู้ส่ง + การจัดก้อน", "ไม่ครบ", "MAJOR");
    chk("RM-3.3", "ชื่อผู้ส่งขึ้นครั้งเดียวต่อก้อน (แบบร่าง `.who` อยู่นอกฟอง)",
      /senderName/.test(SCREEN), "มีการแสดงชื่อผู้ส่ง", "ไม่พบ", "MAJOR");
  });

  // ═════════ RM-4 · ฟอง 5 ชนิด ═════════
  section("RM-4", "RM-4 ฟองข้อความครบ 5 ชนิด:", () => {
    chk("RM-4.1", "ฟองขาเข้า/ขาออกแยกกันด้วยทิศทางข้อความ", /direction/.test(SCREEN), "มี", "ไม่พบ");
    chk("RM-4.2", "ฟองรูปภาพ (แสดงรูปในฟอง ไม่ใช่ลิงก์เปล่า)", /<img|Image\b/.test(SCREEN) && /IMAGE/.test(SCREEN), "มี", "ไม่พบ");
    chk("RM-4.3", "🔴 ฟองเสียง: ปุ่มเล่น + คลื่น + เวลา (แบบร่าง `.voice`)",
      /AUDIO/.test(SCREEN) && /name=(?:["']play["']|\{[^}]*"play"[^}]*\})/.test(SCREEN), "มีฟองเสียง + ปุ่มเล่นจากทะเบียน",
      "ไม่พบ — ข้อความเสียงจะกลายเป็นไฟล์แนบธรรมดา");
    chk("RM-4.4", "ฟองโน้ตภายในแยกหน้าตาชัด (ไม่ใช่แค่เส้นประ)", /isInternal/.test(SCREEN), "มี", "ไม่พบ");
    chk("RM-4.5", "ฟองโน้ตมีป้าย 'โน้ตภายใน · ลูกค้าไม่เห็น' + ไอคอนกุญแจจากทะเบียน",
      /ลูกค้าไม่เห็น/.test(SCREEN) && /name=["']lock["']/.test(SCREEN), "ครบ", "ไม่ครบ");
    chk("RM-4.6", "มุมติดหาง 4px (แบบร่าง `border-top-*-radius:4px`)",
      /rounded-t[lr]-\[4px\]|borderTop(Left|Right)Radius/.test(SCREEN), "มีมุมหาง 4px", "ไม่พบ", "MAJOR");
    chk("RM-11.1", "🔴 ความยาวคลิปเสียงอ่านจาก durationMs (ไม่ต้องโหลดไฟล์มาวัดเอง)",
      /durationMs/.test(SCHEMA) && /durationMs/.test(SCREEN + SERVER), "สคีมามี + หน้าจออ่านจริง",
      `สคีมา=${/durationMs/.test(SCHEMA)} · หน้าจอ/เซิร์ฟเวอร์=${/durationMs/.test(SCREEN + SERVER)}`);
  });

  // ═════════ RM-5/6 · ตัวคั่นวัน + กำลังพิมพ์ ═════════
  section("RM-5", "RM-5/6 ตัวคั่นวันที่ + กำลังพิมพ์:", () => {
    chk("RM-5.1", "ตัวคั่นวันที่ วันนี้/เมื่อวาน", /วันนี้/.test(SCREEN) && /เมื่อวาน/.test(SCREEN), "มี", "ไม่ครบ");
    chk("RM-5.2", "🔴 คิดวันด้วยเขตเวลาไทย (เซิร์ฟเวอร์ UTC → เพี้ยน 1 วันทั้งวัน)",
      /timeZone/.test(SCREEN) && !/\.toDateString\(\)|\.getDay\(\)/.test(SCREEN), "ใช้ timeZone", "ใช้เวลาเครื่อง");
    chk("RM-6.1", "ตัวบอก 'กำลังพิมพ์' มีจริงในห้อง", /(กำลังพิมพ์|typing)/i.test(SCREEN), "มี", "ไม่พบ");
    chk("RM-6.2", "แสดงเป็น 3 จุดตามแบบร่าง (ไม่ใช่ข้อความยาว ๆ)",
      /(typing|กำลังพิมพ์)/i.test(SCREEN) && /(animate|dot|จุด)/i.test(SCREEN), "มีจุดเคลื่อนไหว", "ไม่พบ", "MAJOR");
  });

  // ═════════ RM-7 · ค้นหาในห้อง ═════════
  section("RM-7", "RM-7 ค้นหาในห้อง — ต้องค้นถึงข้อความเก่าจริง:", () => {
    chk("RM-7.1", "มีช่อง/โหมดค้นหาในห้อง", /(ค้นหาในห้อง|ค้นในบทสนทนา|searchInThread|searchMessages)/i.test(SCREEN + SERVER),
      "มี", "ไม่พบ");
    // 🔴 กรองเฉพาะข้อความที่โหลดมาแล้ว = "ค้นหาปลอม" — ห้องที่มี 500 ข้อความจะหาของเก่าไม่เจอเลย
    //    ต้องเห็น `conversationId` กับ `contains` **อยู่ในคำสั่งเดียวกัน** ไม่ใช่คนละที่ในไฟล์
    //    (ของเดิมมี `contains` อยู่แล้วสำหรับค้น "ชื่อ/เบอร์" ในรายการ = เขียวหลอกถ้าจับแยกกัน)
    const inRoomQuery = (SERVER.match(/where\s*:\s*\{[\s\S]{0,600}?\}/g) ?? [])
      .some((w) => /conversationId/.test(w) && /contains/.test(w));
    chk("RM-7.2", "🔴 ค้นที่ชั้นข้อมูลด้วย conversationId + contains ในคำสั่งเดียวกัน (ไม่ใช่กรองเฉพาะที่โหลดมาแล้ว)",
      inRoomQuery, "query ค้นในข้อความของห้องนั้น",
      "ไม่พบ — ค้นได้เฉพาะข้อความที่อยู่บนจอ");
    chk("RM-7.3", "การค้นหาไม่ทำให้โน้ตภายในหลุดถึงลูกค้า (ค้นฝั่งทีมเท่านั้น ผ่านด่านสิทธิ์)",
      /assertChatCan|requireChatRead/.test(SERVER), "มีด่านสิทธิ์ในเส้นทางอ่าน", "ไม่มีด่าน");
  });

  // ═════════ RM-8 · บรรทัดบริบท (ปลุก meta.pageUrl) ═════════
  section("RM-8", "RM-8 บรรทัดบริบทใต้ชื่อ — ปลุก meta.pageUrl ที่เขียนไว้แล้วแต่ไม่เคยแสดง:", () => {
    // 🔴 แก้ข้อสมมติของแผน (Fable/Opus 1 ก.ย.): แผน §1.1 เขียนว่า service.ts "เขียน meta.pageUrl ไว้แล้ว"
    //    ของจริงคือ SHARK รับ `context` เป็น object อิสระแล้ว **merge ทั้งก้อน** ลง `meta`
    //    ⇒ ไม่มีบรรทัดไหนในรีโปนี้เอ่ยชื่อ `pageUrl` เลย · คีย์นั้นมาถึงก็ต่อเมื่อฝั่งลูกค้า (siamdive2) ส่งมา
    //    ⇒ คู่บวกที่ถูกต้องคือ "ทางรับบริบทยังเปิดอยู่" ไม่ใช่ "grep เจอคำว่า pageUrl"
    chk("RM-8.1", "🟢 คู่บวก: ทางรับบริบทลูกค้ายังเปิดอยู่ (รับ context แล้ว merge ลง meta)",
      /args\.context/.test(SERVER) && /meta\s*:/.test(SERVER), "รับ context → meta",
      "ทางรับบริบทหายไป — บรรทัด 'กำลังดูหน้า' จะไม่มีวันมีข้อมูล");
    chk("RM-8.2", "🔴 หน้าจอเอาบริบทมาแสดงเป็นบรรทัด 'กำลังดูหน้า …'",
      /กำลังดูหน้า/.test(SCREEN), "มีบรรทัดบริบท", "ยังไม่แสดง — ข้อมูลที่เก็บไว้ยังไม่มีใครได้ใช้");
    chk("RM-8.3", "หน้าจออ่านคีย์ pageUrl จาก meta จริง (ไม่ใช่ข้อความปลอมที่พิมพ์ตายตัว)",
      /pageUrl/.test(SCREEN + SERVER), "อ่าน meta.pageUrl", "ไม่มีใครอ่านคีย์นี้เลย");
    chk("RM-8.4", "🔴 ไม่มีบริบท = ไม่ขึ้นบรรทัดนี้ (ห้ามโชว์ undefined/ค่าว่างให้ทีมเห็น)",
      /กำลังดูหน้า/.test(SCREEN) && /(pageUrl\s*\?|pageUrl\s*&&|\?\.\s*pageUrl|pageUrl\s*!=)/.test(SCREEN),
      "มีการกันกรณีไม่มีค่า",
      /กำลังดูหน้า/.test(SCREEN) ? "แสดงตรง ๆ โดยไม่กัน — ห้องที่ไม่มีบริบทจะขึ้นคำว่า undefined" : "ยังไม่มีบรรทัดบริบท (ตามหลัง RM-8.2)", "MAJOR");
    chk("RM-8.5", "แสดงเป็นชื่อหน้าที่คนอ่านออก (แบบร่าง: 'ทริปสิมิลัน') ไม่ใช่ URL ดิบยาว ๆ",
      /กำลังดูหน้า/.test(SCREEN) && /(pageTitle|pathname|new URL\(|hostname)/.test(SCREEN),
      "มี pageTitle หรือย่อ URL",
      /กำลังดูหน้า/.test(SCREEN) ? "โชว์ URL ดิบ — หัวห้องจะล้นและอ่านไม่ออก" : "ยังไม่มีบรรทัดบริบท (ตามหลัง RM-8.2)", "MAJOR");
    chk("RM-8.6", "มีจุดสถานะ (dot) หน้าบรรทัดบริบทตามแบบร่าง",
      /กำลังดูหน้า/.test(SCREEN) && /(rounded-full[^"]*bg-|dot)/.test(SCREEN), "มี", "ไม่พบ", "MINOR");
  });

  // ═════════ RM-9/12 · โทเคน + สุขอนามัย ═════════
  section("RM-9", "RM-9/12 โทเคนฟอง + สุขอนามัย:", () => {
    chk("RM-9.1", "ฟองมุม 14px ตามแบบร่าง", /rounded-\[14px\]/.test(SCREEN), "14px", "ไม่พบ", "MAJOR");
    chk("RM-9.2", "ฟองขาออกใช้โทเคนของ V2 (`--out` / #e9eefc) ไม่ใช่สีเดิมของระบบ",
      /--(color-)?out\b|#e9eefc/i.test(SCREEN), "ใช้โทเคน --out", "ยังใช้สีเดิม (surface-2)", "MAJOR");
    chk("RM-9.3", "พื้นหลังห้องใช้โทเคน `--wall` (#f3f4f7) ตามแบบร่าง",
      /--(color-)?wall\b|#f3f4f7/i.test(SCREEN), "ใช้โทเคน --wall", "ไม่พบ", "MAJOR");
    chk("RM-9.4", "ฟองโน้ตใช้โทเคนโน้ต (`--note` #fffaed / เส้น #ecd9a4)",
      /--(color-)?note\b|#fffaed/i.test(SCREEN), "ใช้โทเคนโน้ต", "ไม่พบ", "MAJOR");
    const dates = SCREEN.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
    chk("RM-12.1", "🔴 ไม่มีวันที่/ปีฮาร์ดโค้ดในหน้าจอห้องแชท", dates.length === 0, "ไม่มี", j(dates.slice(0, 5)));
  });
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT V2 ROOM =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
