// QC — WO-CV7 คอลัมน์บริบทลูกค้า (เดสก์ท็อป `.dcol3`) + ปิดหนี้ G11 · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ตรวจแล้ว 1 ก.ย. 2026 ไม่มีชื่อนี้ในรีโป
// ⚠️ static ล้วน (fs) + import ฟังก์ชัน pure 1 ตัว — ไม่ต่อ DB ไม่ต่อเน็ต · 🔴 ตัดคอมเมนต์ก่อน grep เสมอ
// ⚠️ contract-first: เขียนก่อนโค้ด (สาย F รอบ 3) → ต้องแดงอย่างถูกต้อง ห้าม skip เงียบ
// ⚠️ วัดพฤติกรรม ไม่ล็อกชื่อไฟล์ — ยกเว้น 2 ชื่อที่เป็น "สัญญาระหว่างสาย" ซึ่ง Fable กำหนดเอง:
//    `context-panel.tsx` (export `ContextPanel` — สาย E วางไว้ในคอลัมน์ 3 แล้ว) และ
//    `page-label.ts` (export `pageLabelFromPath` — สาย E สร้าง สาย F ใช้) · เปลี่ยนชื่อ = สายอื่นพัง
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-V2 §3 WO-CV7 · มติ D1 · D6 · หนี้ G11) ═══════
// CX-1) หัวคอลัมน์: avatar 60px มุม 18px + แบดจ์ช่องทาง · ชื่อ · บรรทัด "ช่องทาง · ภาษา · สถานะสมาชิก"
//       · ชิป "ผูกกับสมาชิก" (ไอคอน userplus) ที่ **ใช้ action ผูกสมาชิกตัวเดิม** ไม่เขียนซ้ำ
// CX-2) การ์ด "บริบทตอนนี้": กำลังดูหน้า · เข้ามาจาก · ทักครั้งแรก · ตอบครั้งแรกใน
//       🔴 มติ D1: `meta.pageUrl` เป็น path → แปลงผ่านทะเบียน `pageLabelFromPath` · แปลงไม่ได้แสดง path
//          · **ไม่มีค่า = ซ่อนบรรทัด ห้ามป้ายเปล่า** · ห้ามพึ่ง `pageTitle`
//       · "ตอบครั้งแรกใน" = firstResponseAt − firstCustomerMessageAt · สีเขียวเมื่อเร็ว · ยังไม่ตอบต้องบอก
//       · เวลาเป็นเขตเวลาไทย (กับดัก getDay()/toDateString() บน UTC)
// CX-3) ป้ายกำกับ: ชิป tag + "เพิ่ม" — ใช้ action ของสาย D (`quick-reply-actions.ts`) ห้ามเขียนซ้ำ
// CX-4) "คำตอบที่ทีมใช้บ่อยกับคำถามนี้" จากคลัง `ChatAnswerExample` (WO-CW3) · กดแล้ววางลงกล่องพิมพ์
//       ผ่าน `onInsertText` · ไม่มีรายการ = ซ่อนทั้งหมวด
// CX-5) ประวัติ: ประวัติการจองของสมาชิกที่ผูก · ไม่ผูก/ไม่เคยจอง = "ยังไม่เคยจอง — ทักครั้งแรก…"
// CX-6) ขาอ่านบริบทต้องผ่านด่าน `chat.conversation.read` (ข้อมูลอ่อนไหวที่สุดของโมดูล)
// CX-7) ไม่มี emoji · ไอคอนจากทะเบียน `<Icon name>` เท่านั้น · ไม่ฮาร์ดโค้ดวันที่
// CX-8) ทะเบียน `pageLabelFromPath` เป็น pure: null→null · ไม่รู้จัก→คืน path · `/new`→ชื่อไทย
// G11) `AppNotification` ต้องมีช่องผู้รับ · ผู้สร้าง (announceInbound) เขียนรายผู้รับที่มีสิทธิ์จริง
//      · ขาอ่าน (`listNotifications` + หน้า `/app/notifications`) กรองผู้รับ · แล้วจึง **คืนตัวอย่างข้อความ**
//      ที่เคยตัดออกชั่วคราว (31 ส.ค.) กลับมา · migration ต้อง additive

try { process.loadEnvFile?.(".env"); } catch {}

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
const section = (id: string, name: string, fn: () => void | Promise<void>) => {
  console.log(name);
  return Promise.resolve()
    .then(fn)
    .catch((e) => chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)));
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
/** ตัดตัวฟังก์ชันชื่อ `name` ออกมา (นับปีกกา) — "" ถ้าไม่เจอ
 *  🔴 ข้ามวงเล็บพารามิเตอร์ก่อน — ไม่งั้น `function f(args: { a: string }) {` จะได้แค่ตัว type ของพารามิเตอร์
 *     (สาย F เจอ 1 ก.ย.: G11.4–6 แดงทั้งที่โค้ดถูก) */
function bodyOf(src: string, name: string): string {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`).exec(src);
  if (!m) return "";
  const paren = src.indexOf("(", m.index);
  if (paren < 0) return "";
  let pd = 0, i = paren;
  for (; i < src.length; i++) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")" && --pd === 0) break;
  }
  const open = src.indexOf("{", i);
  if (open < 0) return "";
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return src.slice(open, k + 1);
  }
  return "";
}
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
const HARD_DATE = /\b20\d{2}-\d{2}-\d{2}\b/;

const PANEL_PATH = "src/lib/modules/chat/context-panel.tsx";
const PANEL_RAW = read(PANEL_PATH);
const PANEL = strip(PANEL_RAW);
const PAGE_LABEL_PATH = "src/lib/modules/chat/page-label.ts";
const PAGE_LABEL = strip(read(PAGE_LABEL_PATH));
const INBOX_ACTIONS = strip(read("src/lib/modules/chat/inbox-actions.ts"));
const INBOX_CLIENT = strip(read("src/lib/modules/chat/inbox-client.tsx"));
const SERVICE = strip(read("src/lib/modules/chat/service.ts"));
const AUTOMATION = strip(read("src/lib/automation/service.ts"));
const NOTIF_PAGE = strip(read("src/app/app/notifications/page.tsx"));
const SCHEMA_AUTOMATION = read("prisma/schema/automation.prisma");
const MOCKUP = read("docs/design/chat-v2/mockup.html");
const MIGRATIONS = existsSync(join(ROOT, "prisma/migrations")) ? readdirSync(join(ROOT, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d)) : [];
const CHAT_FILES = walk("src/lib/modules/chat");

// หมวดตามแบบร่าง `.dcol3` (อ่านจาก mockup จริง — แบบร่างเปลี่ยน ข้อสอบตาม)
const DCOL3 = MOCKUP.match(/<div class="dcol3">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/body>/)?.[1] ?? "";
const DSEC = [...DCOL3.matchAll(/<div class="dsec">([^<]+)<\/div>/g)].map((m) => m[1]!.trim());
const KV_LABELS = [...DCOL3.matchAll(/<div class="kv"><span>([^<]+)<\/span>/g)].map((m) => m[1]!.trim());

const isStub = PANEL_RAW.includes("โครงชั่วคราว") || PANEL.length < 1500;

await section("CX-0", "CX-0 คู่บวก — อ่านซอร์ส + แบบร่างได้จริง:", () => {
  chk("CX-0.1", "🟢 อ่านคอลัมน์ขวาจากแบบร่างได้ (หัวข้อหมวด ≥4)", DSEC.length >= 4, "≥4", `${DSEC.length}: ${j(DSEC)}`);
  chk("CX-0.2", "🟢 อ่านป้าย kv ในการ์ดบริบทได้ 4 ป้าย", KV_LABELS.length === 4, "4", `${KV_LABELS.length}: ${j(KV_LABELS)}`);
  chk("CX-0.3", "🟢 `context-panel.tsx` ไม่ใช่โครงชั่วคราวแล้ว (สาย F แทนที่ทั้งตัว)", !isStub, "ตัวจริง ≥1500 ตัวอักษร", isStub ? `โครง (${PANEL.length} ตัวอักษร)` : "ตัวจริง");
  chk("CX-0.4", "🟢 `ContextPanel` ยังถูก export ด้วยชื่อ+props เดิม (สัญญากับสาย E)",
    /export function ContextPanel\(/.test(PANEL) && /systemId/.test(PANEL) && /conversationId/.test(PANEL) && /onInsertText/.test(PANEL),
    "export function ContextPanel + systemId/conversationId/onInsertText", "ไม่ครบ");
});

await section("CX-1", "CX-1 หัวคอลัมน์ (โปรไฟล์ + ผูกสมาชิก):", () => {
  chk("CX-1.1", "avatar 60px มุม 18px ตามแบบร่าง", /60px|w-\[60px\]|size-\[60px\]|size-15\b|h-15\b/.test(PANEL) && /18px|rounded-\[18px\]/.test(PANEL), "60px + 18px", "ไม่พบ");
  chk("CX-1.2", "แบดจ์ช่องทางบน avatar (ใช้คอมโพเนนต์แบดจ์จากทะเบียน channel-icon)", /from ["']\.\/channel-icon["']/.test(PANEL), 'import จาก "./channel-icon"', "ไม่พบ");
  chk("CX-1.3", "ชิป \"ผูกกับสมาชิก\" + ไอคอน userplus จากทะเบียน", /ผูกกับสมาชิก/.test(PANEL) && /name=["']userplus["']/.test(PANEL), "ป้าย + Icon userplus", "ไม่พบ");
  chk("CX-1.4", "🔴 ผูกสมาชิกใช้ action ตัวเดิม (`linkCustomerAction` ใน chat/actions.ts) ไม่เขียนซ้ำ",
    /linkCustomerAction/.test(PANEL) || /linkCustomerAction/.test(INBOX_CLIENT) && /onLinkMember|linkMember/.test(PANEL),
    "linkCustomerAction ถูกใช้", "ไม่พบ");
  chk("CX-1.5", "บรรทัดสถานะสมาชิกมีคำว่า \"ยังไม่ผูกสมาชิก\" (สถานะเมื่อยังไม่ผูก)", /ยังไม่ผูกสมาชิก/.test(PANEL), "มี", "ไม่พบ");
});

await section("CX-2", "CX-2 การ์ด \"บริบทตอนนี้\" (มติ D1):", () => {
  chk("CX-2.1", "หัวหมวด \"บริบทตอนนี้\"", /บริบทตอนนี้/.test(PANEL), "มี", "ไม่พบ");
  for (const [i, label] of KV_LABELS.entries()) {
    chk(`CX-2.${i + 2}`, `ป้าย "${label}" อยู่ในการ์ด`, PANEL.includes(label), "มี", "ไม่พบ");
  }
  chk("CX-2.6", "🔴 D1: แปลง path ด้วยทะเบียน `pageLabelFromPath` (ไม่มีทะเบียนที่ 2 ในไฟล์นี้)",
    /import\s*\{[^}]*pageLabelFromPath[^}]*\}\s*from\s*["']\.\/page-label["']/.test(PANEL) && !/["']\/new["']\s*:/.test(PANEL),
    "import จาก ./page-label และไม่มี map path ซ้ำ", "ไม่ตรง");
  chk("CX-2.7", "🔴 D1: ห้ามพึ่ง `pageTitle` (ฝั่งลูกค้าไม่ได้ส่งมา)", !/pageTitle/.test(PANEL) && !/pageTitle/.test(INBOX_ACTIONS), "ไม่มี pageTitle", "พบ pageTitle");
  chk("CX-2.8", "ขาอ่านดึง firstCustomerMessageAt + firstResponseAt + meta มาให้คอลัมน์",
    /firstCustomerMessageAt/.test(INBOX_ACTIONS) && /firstResponseAt/.test(INBOX_ACTIONS) && /meta/.test(INBOX_ACTIONS),
    "select ครบ 3 ช่องใน inbox-actions.ts", "ไม่ครบ");
  chk("CX-2.9", "\"ตอบครั้งแรกใน\" มีสีเขียวเมื่อเร็ว (โทเคน #15803d ตามแบบร่าง)", /#15803d|text-green-7|text-emerald-7/.test(PANEL), "#15803d", "ไม่พบ");
  chk("CX-2.10", "ยังไม่ได้ตอบต้องบอก ไม่ใช่โชว์ตัวเลขผิด", /ยังไม่ได้ตอบ|ยังไม่มีการตอบ|ยังไม่ตอบ/.test(PANEL), "ข้อความ 'ยังไม่ได้ตอบ'", "ไม่พบ");
  chk("CX-2.11", "เวลาเขตเวลาไทย (Asia/Bangkok หรือ helper กลางของโมดูล) ไม่ใช่ getDay()/toDateString()",
    (/Asia\/Bangkok/.test(PANEL) || /from ["']\.\/(list-filters|labels|dates?|time)["']/.test(PANEL)) && !/\.getDay\(\)|toDateString\(\)/.test(PANEL),
    "Asia/Bangkok หรือ helper · ไม่มี getDay/toDateString", "ไม่ตรง", "MAJOR");
});

await section("CX-3", "CX-3 ป้ายกำกับ (ใช้ของสาย D):", () => {
  chk("CX-3.1", "หัวหมวด \"ป้ายกำกับ\" + ชิป tag + ปุ่ม \"เพิ่ม\" (Icon plus)",
    /ป้ายกำกับ/.test(PANEL) && /name=["']tag["']/.test(PANEL) && /name=["']plus["']/.test(PANEL), "ครบ 3", "ไม่ครบ");
  chk("CX-3.2", "🔴 ติด/ถอดป้ายผ่าน action ของ quick-reply-actions.ts (ห้ามเขียนซ้ำ)",
    /from ["']\.\/quick-reply-actions["']/.test(PANEL) || /from ["']\.\/tags-ui["']/.test(PANEL),
    "import จาก ./quick-reply-actions หรือ ./tags-ui", "ไม่พบ");
  chk("CX-3.3", "ไม่มี action ติดป้ายตัวใหม่ใน inbox-actions.ts (ของสาย D มีแล้ว)",
    !/export async function \w*[Tt]ag\w*Action/.test(INBOX_ACTIONS), "ไม่มี", "พบ action ป้ายซ้ำ", "MAJOR");
});

await section("CX-4", "CX-4 คำตอบที่ทีมใช้บ่อยกับคำถามนี้:", () => {
  chk("CX-4.1", "หัวหมวดตามแบบร่าง + Icon quick", /คำตอบที่ทีมใช้บ่อย/.test(PANEL) && /name=["']quick["']/.test(PANEL), "ครบ", "ไม่ครบ");
  chk("CX-4.2", "ดึงจากคลัง ChatAnswerExample (ผ่าน learning.ts หรือ tenantDb) ฝั่ง server",
    /from ["']\.\/learning["']/.test(INBOX_ACTIONS) || /chatAnswerExample/.test(INBOX_ACTIONS), "learning.ts/chatAnswerExample ใน inbox-actions", "ไม่พบ");
  chk("CX-4.3", "กดแล้ววางลงกล่องพิมพ์ผ่าน onInsertText", /onInsertText\?\.\(|onInsertText\(/.test(PANEL), "เรียก onInsertText", "ไม่พบ");
  chk("CX-4.4", "ไม่มีรายการ = ซ่อนทั้งหมวด (ไม่โชว์หัวข้อเปล่า)", /length\s*>\s*0\s*&&|length\s*?\s*[^:]+:\s*null|\.length\s*===\s*0\s*\?\s*null/.test(PANEL), "เงื่อนไขซ่อนเมื่อว่าง", "ไม่พบ", "MAJOR");
});

await section("CX-5", "CX-5 ประวัติการจอง:", () => {
  chk("CX-5.1", "หัวหมวด \"ประวัติ\" + Icon history", /ประวัติ/.test(PANEL) && /name=["']history["']/.test(PANEL), "ครบ", "ไม่ครบ");
  chk("CX-5.2", "ข้อความเมื่อยังไม่เคยจอง ตามแบบร่าง", /ยังไม่เคยจอง/.test(PANEL), "'ยังไม่เคยจอง'", "ไม่พบ");
  chk("CX-5.3", "ฝั่ง server อ่านประวัติจากโมดูลจองจริง (appointment/hotel/rental/clinic/ticket) ผ่าน tenantDb",
    /appointment|hotelReservation|rentalBooking|clinicAppointment|ticketOrder|posSale/i.test(INBOX_ACTIONS) && !/\bprisma\.\w+\.find/.test(INBOX_ACTIONS),
    "โมเดลจอง + ไม่มี raw prisma", "ไม่ตรง", "MAJOR");
});

await section("CX-6", "CX-6 ด่านสิทธิ์ขาอ่านบริบท:", () => {
  const ctxFns = [...INBOX_ACTIONS.matchAll(/export async function (\w*[Cc]ontext\w*)\(/g)].map((m) => m[1]!);
  chk("CX-6.1", "มี server action อ่านบริบทห้อง (ชื่อมีคำว่า Context)", ctxFns.length > 0, "≥1", j(ctxFns));
  for (const fn of ctxFns) {
    const body = bodyOf(INBOX_ACTIONS, fn);
    chk(`CX-6.${fn}`, `\`${fn}\` ผ่านด่าน chat.conversation.read ก่อนอ่าน (requireChatRead หรือ assertCan read)`,
      /requireChatRead\(|chat\.conversation\.read|CHAT_READ_ACTION|assertConversationVisible\(/.test(body), "มีด่านในตัวฟังก์ชัน", "ไม่พบ");
  }
});

await section("CX-7", "CX-7 สุขอนามัย (emoji · ไอคอน · วันที่):", () => {
  const files = [PANEL_PATH, PAGE_LABEL_PATH];
  for (const f of files) {
    const src = strip(read(f));
    chk(`CX-7.emoji:${f.split("/").pop()}`, `ไม่มี emoji ใน ${f.split("/").pop()}`, !EMOJI.test(src), "ไม่มี", "พบ emoji");
    chk(`CX-7.date:${f.split("/").pop()}`, `ไม่ฮาร์ดโค้ดวันที่ใน ${f.split("/").pop()}`, !HARD_DATE.test(src), "ไม่มี", "พบ", "MAJOR");
  }
  chk("CX-7.1", "ไอคอนทุกตัวมาจากทะเบียน (import Icon จาก ./icons · ไม่มี <svg เขียนสด)",
    /from ["']\.\/icons["']/.test(PANEL) && !/<svg[\s>]/.test(PANEL), "import ./icons · ไม่มี <svg", "ไม่ตรง");
  const emojiFiles = CHAT_FILES.filter((f) => EMOJI.test(strip(read(f))));
  chk("CX-7.2", "ทั้งโมดูลแชทไม่มี emoji เหลือ (มติ V2 — ร่วมกับสาย E)", emojiFiles.length === 0, "0 ไฟล์", j(emojiFiles), "MAJOR");
});

await section("CX-8", "CX-8 ทะเบียน pageLabelFromPath (pure · รันจริง):", async () => {
  chk("CX-8.1", "มีไฟล์ page-label.ts และ export pageLabelFromPath", /export function pageLabelFromPath/.test(PAGE_LABEL), "มี", "ไม่พบ");
  if (!/export function pageLabelFromPath/.test(PAGE_LABEL)) return;
  chk("CX-8.2", "ไฟล์ทะเบียนไม่ import อะไร (pure · ใช้ได้ทั้ง server/client/ข้อสอบ)", !/^\s*import\s/m.test(PAGE_LABEL), "ไม่มี import", "มี import", "MAJOR");
  const mod = await import(pathToFileURL(join(ROOT, PAGE_LABEL_PATH)).href) as { pageLabelFromPath: (p: string | null | undefined) => string | null };
  const f = mod.pageLabelFromPath;
  chk("CX-8.3", "null/undefined/ว่าง → null (ไม่มีค่า = ซ่อนบรรทัด)", f(null) === null && f(undefined) === null && f("") === null, "null", j([f(null), f(undefined), f("")]));
  chk("CX-8.4", "path ที่ไม่รู้จัก → คืน path เดิม (D1: แปลงไม่ได้ก็แสดง path)", f("/zz-unknown-9") === "/zz-unknown-9", "/zz-unknown-9", j(f("/zz-unknown-9")));
  const nw = f("/new");
  chk("CX-8.5", "`/new` (ค่าจริงที่พบบน prod 10/13 ห้อง) → ชื่อไทยที่อ่านออก ไม่ใช่ path", typeof nw === "string" && nw !== "/new" && /[ก-๙]/.test(nw), "ชื่อไทย", j(nw));
  chk("CX-8.6", "ค่าขยะ (เช่น 'qc') ไม่ทำให้พัง", typeof f("qc") === "string" || f("qc") === null, "string|null", j(f("qc")));
});

await section("G11", "G11 AppNotification ต้องมีผู้รับ (ปิดหนี้ PDPA 31 ส.ค.):", () => {
  const model = SCHEMA_AUTOMATION.match(/model AppNotification \{[\s\S]*?\n\}/)?.[0] ?? "";
  const RECIP = /(recipientUserId|targetUserId|userId)\s+String\?/;
  chk("G11.1", "สคีมา AppNotification มีช่องผู้รับ (nullable = ประกาศทั้งร้านยังทำได้)", RECIP.test(model), "recipientUserId String?", "ไม่พบ");
  const field = model.match(RECIP)?.[1] ?? "recipientUserId";
  chk("G11.2", `มี index ที่ครอบ ${field} (ขาอ่านกรองรายคน)`, new RegExp(`@@index\\(\\[[^\\]]*${field}`).test(model), "@@index มีช่องผู้รับ", "ไม่พบ", "MAJOR");
  const mig = MIGRATIONS.map((d) => ({ d, sql: read(`prisma/migrations/${d}/migration.sql`) })).filter((m) => /"AppNotification"/.test(m.sql) && new RegExp(`"${field}"`).test(m.sql));
  chk("G11.3", "มี migration เพิ่มช่องผู้รับ และเป็น additive (ไม่มี DROP / NOT NULL)",
    mig.length > 0 && mig.every((m) => !/DROP|NOT NULL(?! DEFAULT)/.test(m.sql.replace(/--.*$/gm, ""))), "additive", mig.length ? j(mig.map((m) => m.d)) : "ไม่พบ migration");
  const ann = bodyOf(SERVICE, "announceInbound");
  chk("G11.4", "announceInbound เลือกผู้รับด้วยสิทธิ์จริง (selectChatNotifyRecipients — กติกาเดียวกับ push)", /selectChatNotifyRecipients/.test(ann), "ใช้ selectChatNotifyRecipients", "ไม่พบ");
  chk("G11.5", `announceInbound เขียน AppNotification รายผู้รับ (${field})`, /appNotification\.(create|createMany)/.test(ann) && new RegExp(field).test(ann), "create/createMany + ช่องผู้รับ", "ไม่พบ");
  chk("G11.6", "🔴 คืน previewText (ตัวอย่างข้อความลูกค้า) กลับมาใน body — เพราะกรองผู้รับได้แล้ว",
    /appNotification[\s\S]{0,400}previewText/.test(ann), "previewText อยู่ใน data ของ appNotification", "ยังถูกตัดอยู่");
  // 🔴 ปรับ 1 ก.ย. — ยอมให้เงื่อนไขกรองอยู่ใน helper ตัวเดียว (สาย F รายงานว่าข้อเดิมลงโทษการยุบโค้ดซ้ำ
  //    ซึ่งจำเป็น: list กับ count ต้องใช้เงื่อนไขเดียวกัน ไม่งั้นป้าย "3 ใหม่" เปิดเข้าไปเจอ 1)
  //    วัด: มี "แหล่งเดียว" ในไฟล์ที่เขียน OR[null, me] ด้วยช่องผู้รับ · และทั้ง list กับ count เรียกแหล่งนั้น
  const list = bodyOf(AUTOMATION, "listNotifications");
  const count = bodyOf(AUTOMATION, "countUnread");
  const helperName = [...AUTOMATION.matchAll(/function\s+(\w+)\s*\([^)]*\)[^{]*\{[\s\S]{0,400}?OR:\s*\[[^\]]*null[^\]]*\]/g)]
    .map((m) => m[1]!).find((n) => new RegExp(field).test(bodyOf(AUTOMATION, n)));
  const usesFilter = (b: string) => (helperName ? new RegExp(`\\b${helperName}\\(`).test(b) : false) || (new RegExp(field).test(b) && /null/.test(b) && /userId/.test(b));
  chk("G11.7", `listNotifications + countUnread กรองผู้รับด้วยเงื่อนไขเดียวกัน: ${field} = null (ทั้งร้าน) หรือ = ฉัน`,
    usesFilter(list) && usesFilter(count), `OR [null, me] (helper=${helperName ?? "-"})`, `list=${usesFilter(list)} count=${usesFilter(count)}`);
  chk("G11.8", "หน้า /app/notifications ส่ง userId ของคนดูเข้า listNotifications", /listNotifications\(\{[^}]*userId/.test(NOTIF_PAGE), "userId ใน args", "ไม่ส่ง");
  chk("G11.9", "ทุกจุดที่สร้าง AppNotification นอกแชท (automation ฯลฯ) ยังทำงานได้ — ช่องผู้รับเป็น optional (ไม่บังคับ)",
    /(recipientUserId|targetUserId|userId)\s+String\?/.test(model), "nullable", "บังคับ", "MAJOR");
});

// ═════════ สรุป ═════════
const failed = cks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: chat V2 — คอลัมน์บริบท + G11 =====");
console.log(`ผ่าน ${cks.length - failed.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: cks.length, passed: cks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
