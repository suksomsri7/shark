// QC — WO-CV5: กล่องพิมพ์ V2 + แผ่นเครื่องมือ ＋ (แบบร่างจอ 3/4 + `.dcol2` ล่าง) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ตรวจแล้ว 1 ก.ย. 2026 ไม่มีชื่อนี้ในรีโป
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
// ⚠️ static ล้วน (fs) · 🔴 ตัดคอมเมนต์ก่อน grep เสมอ
// ⚠️ contract-first: แผ่น ＋ ยังไม่มี (สาย E รอบ 3) → ต้องแดงอย่างถูกต้อง ห้าม skip เงียบ
//
// 🔴 หมายเหตุเรื่องการล็อกชื่อ: ข้อที่จับ `Icon name="…"` ล็อก **รูป API ของทะเบียนไอคอน**
//    ซึ่งเป็นสัญญาที่ WO-CV1 กำหนดไว้เอง (`export <Icon name="…"/>` ชุดเดียวทั้งโมดูล)
//    เจตนาคือ "ไอคอนตัวนี้ต้องมาจากทะเบียน ไม่ใช่ emoji/SVG เขียนสด" ไม่ใช่การบังคับสไตล์โค้ด
//    ถ้าวันหนึ่งชื่อไอคอนถูกส่งผ่านตัวแปร ให้แจ้ง Fable ปรับวิธีวัด — ห้ามแก้ข้อสอบเอง
//
// 🔴 **รายชื่อเครื่องมือในแผ่น ＋ อ่านจากแบบร่างจริง** (`mockup.html` บล็อก `.sheet .gt`)
//    ไม่ใช่ลิสต์ที่พิมพ์ไว้ในข้อสอบ — แบบร่างคือสัญญา (มติ V3)
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-V2 §3 WO-CV5) ═══════
// CM-1) แผ่น ＋ มีเครื่องมือครบ 8 ตัวตามแบบร่าง
// CM-2) 🔴 ทุกเครื่องมือ **ผูกกับของจริง** ไม่ใช่ปุ่มหลอก (บทเรียน 29 ส.ค.: เมนูที่ไม่มีลิงก์ · ปุ่มที่ไม่มี)
// CM-3) แถบกล่องพิมพ์: ＋ · ช่องพิมพ์ · ไมค์ · ➤ (ไอคอนจากทะเบียนทั้งหมด)
// CM-4) 🔴 โหมดโน้ตภายใน = **เปลี่ยนสีทั้งกล่อง + แถบเตือน** ไม่ใช่ช่องติ๊กเล็ก ๆ
//       (ของเดิมเป็น checkbox = พลาดง่าย · ส่งโน้ตออกไปหาลูกค้าคือความเสียหายที่กู้ไม่ได้)
// CM-5) ปุ่มส่งเทาเมื่อว่าง ติดสีเมื่อพร้อม (ปุ่มที่กดได้ตลอดเวลาแต่ไม่ทำอะไร = โกหกผู้ใช้)
// CM-6) Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่
// CM-7) พิมพ์ `/` เรียกคำตอบสำเร็จรูป (รายละเอียดของตัวคลังอยู่ `qc-chat-v2-quickreply.mts`)
// CM-8) ร่าง + ไฟล์ที่เลือกไว้ต้องรอดทุกรอบ poll (ห้าม `router.refresh()` ในลูป)
// CM-9) 🔴 เส้นทางกดส่งห้าม `redirect()` และต้องคืนผลลัพธ์ให้จอตัดสิน
//       (บั๊กจริง 1 ก.ย. 2026: จอขึ้นแดง "ส่งไม่สำเร็จ" ทั้งที่ส่งสำเร็จ → ผู้ใช้กดซ้ำ = ข้อความซ้ำ)
//       ข้อนี้เป็น **ด่านกันถอยหลัง** ของกล่องพิมพ์ตัวใหม่ ไม่ใช่การซ้ำกับ qc-chat-inbox-ui:
//       ตัวนั้นวัดกล่องเดิม ตัวนี้วัดว่ากล่องใหม่ไม่พาบั๊กเดิมกลับมา
// CM-10) ตรวจขนาด/ชนิดไฟล์ **ก่อน** อัป (ไม่ใช่ปล่อยให้อัปเสร็จแล้วเด้ง error)
// CM-11) ไมค์อยู่ในแถบตามแบบร่าง — เงื่อนไข "ช่องทางไม่รองรับเสียง" อยู่ `qc-chat-v2-voice.mts`
// CM-W) 🔴 WO-CV14 (ก) `.wav` เลือกได้จริงในหน้าต่างแนบไฟล์ + ตรวจชนิด **ก่อน** รับเข้า list
//       เหตุ: `<input accept>` เป็น MIME ล้วน ⇒ OS/เบราว์เซอร์ที่จับคู่ด้วย **นามสกุล**
//       (Windows Explorer / GTK / Android) ทำให้ `.wav` `.m4a` กลายเป็นสีเทา เลือกไม่ได้เลย
//       และไฟล์ wav บางเครื่องคืน `File.type` ว่าง / `audio/wave` / `audio/vnd.wave`
//       ⇒ accept ต้องมี **ทั้ง MIME และนามสกุล** และต้องสร้างจากทะเบียน ไม่พิมพ์มือ
//       ⇒ ชนิดที่ไม่รู้จักต้องถูกปฏิเสธ **ก่อนอัป** พร้อมข้อความไทยที่ไม่โทษผู้ใช้ (กติกาเดียวกับ CM-10)

try { process.loadEnvFile?.(".env"); } catch {}
// 🔴 ชุดนี้ static ล้วน — ทับ DATABASE_URL เป็น host ที่ต่อไม่ติดตั้งแต่ต้น เพราะหมวด CM-W
//    ต้อง `import` ทะเบียนจริงจาก `src/lib/storage/service.ts` (ซึ่งลาก `core/db` ติดมาด้วย)
//    ห้ามมีทางที่ข้อสอบไปแตะฐานข้อมูลจริงของร้าน (.env ของเครื่องนี้ชี้ prod)
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db";

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
function fnBody(src: string, re: RegExp): string {
  const m = src.match(re);
  if (!m || m.index === undefined) return "";
  const rest = src.slice(m.index);
  const next = rest.slice(10).search(/\nexport\s/);
  return next < 0 ? rest : rest.slice(0, next + 10);
}

const FILES = [...walk("src/lib/modules/chat"), ...walk("src/app/app/sys/[id]/chat")];
const SCREEN = FILES.filter((f) => f.endsWith(".tsx")).map((f) => strip(read(f))).join("\n");
const SERVER = FILES.filter((f) => f.endsWith(".ts")).map((f) => strip(read(f))).join("\n");
const MOCKUP = read("docs/design/chat-v2/mockup.html");

// เครื่องมือในแผ่น ＋ ตามแบบร่าง
// (`.gt` = ป้ายใต้ไอคอนของแผ่น ＋ · ปรากฏเฉพาะในบล็อก `.sheet` ของแบบร่าง จึงอ่านทั้งไฟล์ได้เลย
//  — เคยลองตัดเฉพาะบล็อก `.sheet` ด้วย regex ปิด </div> แล้วได้ 7 ตัวเพราะตัวสุดท้ายถูกตัดทิ้ง)
const SHEET_TOOLS = [...MOCKUP.matchAll(/<div class="gt">([^<]+)<\/div>/g)].map((m) => m[1]!.trim());
// ข้อความบอกวิธีใช้ที่แบบร่างเขียนไว้ใต้กล่องพิมพ์ (`.hint`)
const HINT = MOCKUP.match(/<div class="hint">([^<]+)<\/div>/)?.[1]?.trim() ?? "";

try {
  section("CM-0", "CM-0 คู่บวก — อ่านซอร์ส + แบบร่างได้จริง:", () => {
    chk("CM-0.1", "🟢 เจอไฟล์หน้าจอของโมดูลแชท", SCREEN.length > 5000, "≥5000 ตัวอักษร", `${SCREEN.length}`);
    chk("CM-0.2", "🟢 อ่านรายชื่อเครื่องมือในแผ่น ＋ จากแบบร่างได้ครบ 8 ตัว",
      SHEET_TOOLS.length === 8, "8 ตัว", `${SHEET_TOOLS.length}: ${j(SHEET_TOOLS)}`);
    chk("CM-0.3", "🟢 อ่านข้อความบอกวิธีใช้ (.hint) จากแบบร่างได้", HINT.length > 10, "มีข้อความ", j(HINT));
  });

  // ═════════ CM-1 · แผ่น ＋ ครบ 8 ═════════
  section("CM-1", "CM-1 แผ่นเครื่องมือ ＋ ครบตามแบบร่าง:", () => {
    chk("CM-1.0", "มีแผ่นเครื่องมือ ＋ (ปุ่ม plus จากทะเบียนไอคอน)", /name=["']plus["']/.test(SCREEN), 'Icon name="plus"', "ไม่พบ");
    for (const [i, t] of SHEET_TOOLS.entries()) {
      chk(`CM-1.${i + 1}`, `เครื่องมือ "${t}" มีในแผ่น ＋`, SCREEN.includes(t), "มี", "ไม่พบ");
    }
  });

  // ═════════ CM-2 · ทุกเครื่องมือผูกกับของจริง ═════════
  section("CM-2", "CM-2 🔴 เครื่องมือทุกตัวผูกกับของจริง (ไม่ใช่ปุ่มหลอก):", () => {
    chk("CM-2.1", "รูปภาพ → input file ที่รับเฉพาะชนิดที่ระบบอนุญาต",
      /type=["']file["']/.test(SCREEN) && /accept=/.test(SCREEN), "มี input file + accept", "ไม่ครบ");
    chk("CM-2.2", '🔴 ถ่ายรูป → capture="environment" (มือถือเปิดกล้องจริง เดสก์ท็อปตกเป็นเลือกไฟล์)',
      /capture=["']environment["']/.test(SCREEN), 'capture="environment"', "ไม่มี — ปุ่ม 'ถ่ายรูป' จะกลายเป็นปุ่มเลือกไฟล์เฉย ๆ");
    chk("CM-2.3", "ไฟล์ → เส้นทางแนบไฟล์เดิมยังอยู่ (ไม่ทำของเดิมหายตอนรื้อหน้าจอ)",
      /(uploadChatAttachment|attachments)/i.test(SERVER), "เส้นทางไฟล์แนบยังอยู่", "หายไป");
    // แผนที่ร้าน = ของใหม่ล้วน · ต้องดึงที่อยู่/พิกัดจากข้อมูลร้านจริง ไม่ใช่ลิงก์ที่พิมพ์ตายตัว
    chk("CM-2.4", "🔴 แผนที่ร้าน → ส่งพิกัด/ลิงก์ของ **ร้านนั้นจริง** ไม่ใช่ลิงก์ฮาร์ดโค้ด",
      /แผนที่ร้าน/.test(SCREEN) && /(mapUrl|latitude|lat\b|address|googleMap|maps\.)/i.test(SCREEN + SERVER),
      "ดึงข้อมูลที่อยู่ของร้าน", "ไม่พบแหล่งข้อมูลแผนที่ของร้าน");
    chk("CM-2.5", "AI ช่วยร่าง → มี server action จริง",
      /export async function (suggestReply|aiSuggest)\w*Action/.test(SERVER), "มี action", "ไม่มี — ปุ่มหลอก");
    chk("CM-2.6", "แปลก่อนส่ง → มี server action จริง",
      /export async function translate\w*Action/.test(SERVER), "มี action", "ไม่มี — ปุ่มหลอก");
    chk("CM-2.7", "คำตอบสำเร็จรูป → มีเส้นทางอ่านคลังจริง (ตาราง ChatQuickReply)",
      /chatQuickReply/.test(SERVER), "แตะตาราง ChatQuickReply", "ยังเป็นตารางตาย — ดู qc-chat-v2-quickreply");
    chk("CM-2.8", "โน้ตภายใน → สลับโหมดได้จริง (ผูกกับ isInternal ที่ส่งไปเซิร์ฟเวอร์)",
      /isInternal/.test(SCREEN) && /isInternal/.test(SERVER), "ครบทั้ง 2 ฝั่ง", "ไม่ครบ");
  });

  // ═════════ CM-3/5 · แถบกล่องพิมพ์ ═════════
  section("CM-3", "CM-3/5 แถบกล่องพิมพ์ตามแบบร่าง:", () => {
    chk("CM-3.1", "ปุ่มไมค์อยู่ในแถบ (ไอคอน mic จากทะเบียน)", /name=["']mic["']/.test(SCREEN), 'Icon name="mic"', "ไม่พบ");
    chk("CM-3.2", "ปุ่มส่งใช้ไอคอน send จากทะเบียน (ไม่ใช่ตัวหนังสือ/emoji)",
      /name=["']send["']/.test(SCREEN), 'Icon name="send"', "ไม่พบ");
    chk("CM-3.3", "ช่องพิมพ์เป็น textarea (ต้องขึ้นบรรทัดใหม่ได้ตาม CM-6)", /<textarea/.test(SCREEN), "มี textarea", "ไม่พบ");
    chk("CM-5.1", "🔴 ปุ่มส่งถูกปิดเมื่อไม่มีอะไรจะส่ง (ปุ่มกดได้แต่ไม่ทำอะไร = โกหกผู้ใช้)",
      /disabled=\{/.test(SCREEN), "มี disabled ผูกกับสถานะร่าง", "ปุ่มกดได้ตลอด");
  });

  // ═════════ CM-4 · โหมดโน้ตภายใน ═════════
  section("CM-4", "CM-4 🔴 โหมดโน้ตภายใน — ต้องพลาดยาก:", () => {
    chk("CM-4.1", "เปลี่ยนหน้าตาทั้งกล่อง (ใช้โทเคนโน้ต --note / #fffaed)",
      /--(color-)?note\b|#fffaed/i.test(SCREEN), "กล่องเปลี่ยนสีทั้งกล่อง", "ยังไม่เปลี่ยนสีทั้งกล่อง");
    chk("CM-4.2", "มีแถบเตือนบอกชัดว่าลูกค้าจะไม่เห็น",
      /ลูกค้าจะไม่เห็น|ลูกค้าไม่เห็น/.test(SCREEN), "มีแถบเตือน", "ไม่มี");
    // 🔴 ของเดิมเป็น <input type="checkbox"> เล็ก ๆ — แบบร่างสั่งให้เลิก
    const noteArea = SCREEN.match(/[^\n]*โน้ตภายใน[\s\S]{0,400}/g)?.join("\n") ?? "";
    chk("CM-4.3", "🔴 เลิกใช้ช่องติ๊กเล็ก ๆ สำหรับสลับโหมด (พลาดง่าย = โน้ตหลุดถึงลูกค้า)",
      !/type=["']checkbox["']/.test(noteArea), "ไม่ใช่ checkbox", "ยังเป็น checkbox ตามของเดิม");
    chk("CM-4.4", "ไอคอนกุญแจจากทะเบียนกำกับโหมดโน้ต", /name=["']lock["']/.test(SCREEN), 'Icon name="lock"', "ไม่พบ", "MAJOR");
  });

  // ═════════ CM-6/7 · แป้นพิมพ์ + คำใบ้ ═════════
  section("CM-6", "CM-6/7 แป้นพิมพ์และคำใบ้:", () => {
    chk("CM-6.1", "Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่",
      /shiftKey/.test(SCREEN) && /["']Enter["']/.test(SCREEN), "มีทั้ง Enter และ shiftKey", "ไม่ครบ");
    chk("CM-7.1", "พิมพ์ `/` เรียกคำตอบสำเร็จรูป",
      /startsWith\(["']\/["']\)|["']\/["']\s*===|slashCommand|quickReplyOpen/.test(SCREEN),
      "มีการดักเครื่องหมาย /", "ไม่พบ");
    chk("CM-7.2", "มีคำใบ้ใต้กล่องพิมพ์ตามแบบร่าง (Enter/Shift+Enter/พิมพ์ /)",
      /Shift\+Enter/.test(SCREEN) && /คำตอบสำเร็จรูป/.test(SCREEN), "มีคำใบ้", "ไม่มี — ผู้ใช้ไม่มีทางรู้ว่ามีทางลัด", "MAJOR");
  });

  // ═════════ CM-8/9/10 · ความถูกต้องของเส้นทางส่ง ═════════
  section("CM-8", "CM-8/9/10 ความถูกต้องของเส้นทางส่ง (ด่านกันถอยหลัง):", () => {
    chk("CM-8.1", "🔴 ไม่มี router.refresh() ในหน้าจอแชท (ร่าง + ไฟล์ที่เลือกไว้จะหายกลางคัน)",
      !/router\.refresh\(\)/.test(SCREEN), "ไม่มี", "ยังเรียก router.refresh()");
    chk("CM-8.2", "ร่างเก็บใน state ของ client (รอดทุกรอบ poll)",
      /useState/.test(SCREEN) && /(draft|text|body)/i.test(SCREEN), "มี state ของร่าง", "ไม่พบ");
    const sendFn = fnBody(SERVER, /export async function sendReplyAction/);
    chk("CM-9.1", "🟢 คู่บวก: หา sendReplyAction เจอ", sendFn.length > 100, "เจอฟังก์ชัน", `ยาว ${sendFn.length}`);
    chk("CM-9.2", "🔴 เส้นทางส่งไม่ redirect (Next ใช้การโยน error เป็นกลไก → จอตีความว่าล้ม)",
      sendFn.length > 100 && !/\bredirect\s*\(/.test(sendFn), "ไม่มี redirect(", "พบ redirect( ในเส้นทางส่ง");
    chk("CM-9.3", "จอตัดสินจากค่าที่ action คืนมา ไม่ใช่เดาจาก exception",
      /await sendReplyAction\(/.test(SCREEN) && /\.ok\b/.test(SCREEN), "อ่านค่าที่คืนมา", "ไม่พบการอ่านผลลัพธ์");
    chk("CM-10.1", "🔴 ตรวจขนาดไฟล์ก่อนอัป (ไม่ใช่อัปเสร็จแล้วค่อยเด้ง error)",
      /CHAT_ATTACHMENT_MAX_BYTES|10\s*\*\s*1024\s*\*\s*1024/.test(SCREEN), "ตรวจฝั่งหน้าจอ", "ไม่ตรวจ");
  });
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

// ═════════ CM-W · WO-CV14 (ก) `.wav` ในหน้าต่างแนบไฟล์ ═════════
// หมวดนี้ต่างจากหมวดอื่นตรงที่ **เรียกฟังก์ชันจริง** ไม่ใช่ grep อย่างเดียว —
// เพราะสัญญาคือ "accept ต้องสร้างจากทะเบียน" ซึ่งพิสูจน์ด้วยการ grep หาสตริงไม่ได้
// (grep เจอ `.wav` ก็แปลว่าพิมพ์มือ ซึ่งเป็นสิ่งที่ข้อนี้ห้าม)
try {
  console.log("CM-W 🔴 หน้าต่างแนบไฟล์ต้องเลือก .wav ได้ + ตรวจชนิดก่อนรับเข้า list:");

  const storage = (await import("@/lib/storage/service" as string).catch(() => null)) as
    | { ALLOWED_UPLOAD_TYPES?: Record<string, string>; normalizeUploadType?: (r: unknown) => string }
    | null;
  const helper = (await import("@/lib/storage/upload-accept" as string).catch(() => null)) as
    | {
        buildAcceptAttr?: (t: Record<string, string>, f?: (m: string) => boolean) => string;
        inferUploadType?: (f: { name: string; type?: string | null }, t: Record<string, string>) => string | null;
        normalizeUploadTypeName?: (r: unknown) => string;
        uploadExtensions?: (t: Record<string, string>) => string[];
        withUploadType?: (f: File, mime: string) => File;
      }
    | null;

  const TYPES = storage?.ALLOWED_UPLOAD_TYPES ?? {};
  chk("CM-W.0", "🟢 คู่บวก: อ่านทะเบียนชนิดไฟล์จริง (ALLOWED_UPLOAD_TYPES) ได้ และมี audio/wav อยู่",
    Object.keys(TYPES).length > 5 && TYPES["audio/wav"] === "wav", "มีทะเบียน + audio/wav→wav", j(TYPES["audio/wav"] ?? null));
  chk("CM-W.0b", "🟢 คู่บวก: มีตัวช่วยกลาง `src/lib/storage/upload-accept.ts` (pure — คอมโพเนนต์ client ใช้ได้)",
    !!helper?.buildAcceptAttr && !!helper?.inferUploadType, "มี buildAcceptAttr + inferUploadType", helper ? j(Object.keys(helper)) : "import ไม่ผ่าน");

  const accAll = helper?.buildAcceptAttr?.(TYPES) ?? "";
  const accImg = helper?.buildAcceptAttr?.(TYPES, (m) => m.startsWith("image/")) ?? "";
  const parts = accAll.split(",").map((x) => x.trim()).filter(Boolean);

  chk("CM-W.1", "🔴 accept ของช่อง “ไฟล์” มีทั้ง MIME และนามสกุลของ wav (OS ที่จับคู่ด้วยนามสกุลต้องเลือกได้)",
    parts.includes("audio/wav") && parts.includes(".wav"), "มีทั้ง audio/wav และ .wav", j(parts.filter((x) => x.includes("wav"))));
  chk("CM-W.2", "accept ครบทุกนามสกุลในทะเบียน (ไม่ตกหล่นแม้แต่ตัวเดียว → ไม่มีชนิดที่เซิร์ฟเวอร์รับแต่เลือกไม่ได้)",
    Object.values(TYPES).every((ext) => parts.includes(`.${ext}`)) && Object.keys(TYPES).every((m) => parts.includes(m)),
    "ครบทุก mime + ทุกนามสกุล",
    j(Object.entries(TYPES).filter(([m, e]) => !parts.includes(m) || !parts.includes(`.${e}`)).map(([m]) => m)));
  chk("CM-W.3", "accept ของช่องรูป/กล้อง = เฉพาะรูป (มีนามสกุลรูปด้วย · ต้องไม่มี .wav/.pdf ปน)",
    accImg.includes("image/jpeg") && accImg.includes(".jpg") && !accImg.includes(".wav") && !accImg.includes(".pdf"),
    "image MIME + นามสกุลรูป เท่านั้น", j(accImg));

  const composerSrc = strip(read("src/lib/modules/chat/composer.tsx"));
  chk("CM-W.4", "🔴 accept สร้างจากทะเบียน ไม่ใช่พิมพ์รายชื่อไว้ในคอมโพเนนต์ (พิมพ์มือ = เพี้ยนจากเซิร์ฟเวอร์วันใดวันหนึ่ง)",
    /buildAcceptAttr\s*\(/.test(composerSrc) && !/["'][^"']*\.wav[^"']*["']/.test(composerSrc),
    "เรียก buildAcceptAttr และไม่มีลิสต์นามสกุลพิมพ์มือ",
    /buildAcceptAttr\s*\(/.test(composerSrc) ? "ยังมีสตริง .wav พิมพ์มือ" : "ไม่เรียก buildAcceptAttr");

  const nz = helper?.normalizeUploadTypeName;
  const nzServer = storage?.normalizeUploadType;
  chk("CM-W.5", "ตัว normalize ฝั่งจอให้ผลตรงกับ normalizeUploadType ของเซิร์ฟเวอร์ (ไม่มีกติกาที่สอง)",
    !!nz && !!nzServer && ["audio/webm;codecs=opus", "AUDIO/WAV", " audio/mp4 ", "", "audio/wav"].every((x) => nz(x) === nzServer(x)),
    "ตรงกันทุกตัวอย่าง", !nz || !nzServer ? "เรียกไม่ได้" : j(["audio/webm;codecs=opus", "AUDIO/WAV"].map((x) => [nz(x), nzServer(x)])));

  const inf = helper?.inferUploadType;
  chk("CM-W.6", "🔴 File.type ว่าง (wav บางเครื่องเป็นแบบนี้) → อนุมานจากนามสกุลได้",
    inf?.({ name: "เสียงลูกค้า.WAV", type: "" }, TYPES) === "audio/wav", "audio/wav", j(inf?.({ name: "เสียงลูกค้า.WAV", type: "" }, TYPES) ?? null));
  chk("CM-W.7", "ชื่อพ้องของ wav (audio/wave · audio/vnd.wave) ถูกแปลงเป็นชื่อในทะเบียน",
    inf?.({ name: "a.wav", type: "audio/wave" }, TYPES) === "audio/wav" &&
    inf?.({ name: "a.wav", type: "audio/vnd.wave" }, TYPES) === "audio/wav",
    "audio/wav ทั้งคู่", j([inf?.({ name: "a.wav", type: "audio/wave" }, TYPES), inf?.({ name: "a.wav", type: "audio/vnd.wave" }, TYPES)]));
  chk("CM-W.8", "🔴 fail-closed: ชนิดนอกทะเบียนคืนค่าว่าง ไม่เดาให้ผ่าน (ทั้งกรณีมี mime และไม่มี)",
    inf?.({ name: "setup.exe", type: "application/x-msdownload" }, TYPES) === null &&
    inf?.({ name: "setup.exe", type: "" }, TYPES) === null &&
    inf?.({ name: "ไม่มีนามสกุล", type: "" }, TYPES) === null,
    "null ทั้ง 3 กรณี", j([inf?.({ name: "setup.exe", type: "application/x-msdownload" }, TYPES), inf?.({ name: "setup.exe", type: "" }, TYPES), inf?.({ name: "ไม่มีนามสกุล", type: "" }, TYPES)]));

  const inboxSrc = strip(read("src/lib/modules/chat/inbox-client.tsx"));
  const addFn = inboxSrc.slice(Math.max(0, inboxSrc.indexOf("const addFiles")), inboxSrc.indexOf("const addFiles") + 2200);
  chk("CM-W.9", "🔴 addFiles ตรวจ **ชนิด** ก่อนรับเข้า list (ของเดิมตรวจแต่ขนาด ⇒ รู้ว่าไฟล์ผิดชนิดหลังอัปเสร็จ)",
    inboxSrc.indexOf("const addFiles") >= 0 && /inferUploadType\s*\(/.test(addFn), "เรียก inferUploadType ใน addFiles", "ไม่ตรวจชนิด");
  chk("CM-W.9b", "ปฏิเสธแล้วบอกเป็นภาษาไทยแบบไม่โทษผู้ใช้ · inline ไม่ใช่ alert()",
    /[ก-๙]/.test(addFn) && /setFileErr\s*\(/.test(addFn) && !/\balert\s*\(/.test(addFn) && !/ผิดพลาด|ไม่ถูกต้อง|ห้าม/.test(addFn),
    "ข้อความไทย inline", "ยังใช้ alert หรือถ้อยคำโทษผู้ใช้");
  chk("CM-W.9c", "ข้อความบอก “ชนิดที่แนบได้” สร้างจากทะเบียน ไม่พิมพ์มือ",
    /uploadExtensions\s*\(/.test(addFn) && Array.isArray(helper?.uploadExtensions?.(TYPES)) && (helper!.uploadExtensions!(TYPES)).includes("wav"),
    "ดึงนามสกุลจากทะเบียน", j(helper?.uploadExtensions?.(TYPES) ?? null));
  // 🔴 วัด 2 ทอด ไม่ใช่ทอดเดียว: (ก) ตัวห่อทำงานถูกจริง (เรียกฟังก์ชันตรง ๆ)
  //    (ข) `addFiles` ส่งชนิดที่ **อนุมานได้** เข้าตัวห่อจริง — ไม่ใช่มีตัวห่อไว้เฉย ๆ แล้ว push ไฟล์ดิบ
  const wrap = helper?.withUploadType;
  const mkFile = (name: string, type: string) => new File(["เนื้อไฟล์"], name, { type });
  chk("CM-W.10", "🔴 อนุมานชนิดได้แต่ File.type เดิมว่าง → ห่อ File ใหม่ให้มี mime (ไม่งั้นเซิร์ฟเวอร์ที่อ่าน f.type ยังปฏิเสธเหมือนเดิม)",
    wrap?.(mkFile("เสียง.wav", ""), "audio/wav").type === "audio/wav" && /withUploadType\(/.test(addFn) && /\.push\([^)\n]*mime/.test(addFn),
    "ห่อได้ + addFiles ส่ง mime ที่อนุมานได้เข้าตัวห่อ",
    j({ wrapped: wrap?.(mkFile("เสียง.wav", ""), "audio/wav").type ?? null, usedInAddFiles: /withUploadType\(/.test(addFn) }));
  chk("CM-W.10b", "🔴 type ที่มีพารามิเตอร์ห้อย/ชื่อพ้อง/พิมพ์ใหญ่ ก็ต้องถูกทำให้ตรงทะเบียน (ด่านเซิร์ฟเวอร์เทียบ f.type ดิบ)",
    wrap?.(mkFile("a.webm", "audio/webm;codecs=opus"), "audio/webm").type === "audio/webm" &&
    wrap?.(mkFile("a.wav", "audio/wave"), "audio/wav").type === "audio/wav" &&
    wrap?.(mkFile("a.wav", "AUDIO/WAV"), "audio/wav").type === "audio/wav",
    "ได้ชื่อในทะเบียนทุกกรณี",
    j([wrap?.(mkFile("a.webm", "audio/webm;codecs=opus"), "audio/webm").type ?? null, wrap?.(mkFile("a.wav", "audio/wave"), "audio/wav").type ?? null]));
  chk("CM-W.10c", "🟢 คู่บวก: type ตรงทะเบียนอยู่แล้ว → คืนไฟล์เดิม (ไม่ก๊อป bytes ซ้ำโดยไม่จำเป็น) และเนื้อไฟล์ไม่หาย",
    (() => { const f0 = mkFile("a.wav", "audio/wav"); const w = wrap?.(mkFile("a.wav", ""), "audio/wav"); return wrap?.(f0, "audio/wav") === f0 && w?.size === f0.size && w?.name === "a.wav"; })(),
    "คืนตัวเดิม + ขนาด/ชื่อคงเดิม", "ไฟล์ถูกแปลงจนเนื้อหาเพี้ยน");

  const serverGate = strip(read("src/lib/modules/chat/actions.ts"));
  chk("CM-W.11", "🔴 ด่านฝั่งเซิร์ฟเวอร์ยังอยู่ครบ (หน้าจอตรวจเพิ่ม ไม่ใช่ตรวจแทน)",
    /ALLOWED_UPLOAD_TYPES/.test(serverGate) && /CHAT_ATTACHMENT_MAX_BYTES/.test(serverGate),
    "actions.ts ยังตรวจทะเบียน + เพดานขนาด", "ด่านเซิร์ฟเวอร์ถูกลดทอน");
} catch (e) {
  chk("CM-W.CRASH", "หมวด CM-W ล้มกลางคัน", false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e));
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT V2 COMPOSER =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
