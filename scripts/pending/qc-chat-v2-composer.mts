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

try { process.loadEnvFile?.(".env"); } catch {}

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const j = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const section = (id: string, name: string, fn: () => void) => {
  console.log(name);
  try { fn(); } catch (e) { chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }
};

const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1");
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

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT V2 COMPOSER =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
