// QC — WO-CV3 + WO-CV10: รายการแชท V2 (ตามแบบร่าง จอ 1 + เดสก์ท็อปคอลัมน์ซ้าย) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ตรวจแล้ว 1 ก.ย. 2026 ไม่มีชื่อนี้ในรีโป
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
// ⚠️ static ล้วน (fs) — ไม่ต่อ DB ไม่ต่อเน็ต · 🔴 ตัดคอมเมนต์ก่อน grep เสมอ
// ⚠️ contract-first: ของหลายอย่างยังไม่มี (สาย C รอบ 2) → ต้องแดงอย่างถูกต้อง ห้าม skip เงียบ
//
// 🔴 หมายเหตุเรื่องการล็อกชื่อ: ข้อที่จับ `Icon name="…"` ล็อก **รูป API ของทะเบียนไอคอน**
//    ซึ่งเป็นสัญญาที่ WO-CV1 กำหนดไว้เอง (`export <Icon name="…"/>` ชุดเดียวทั้งโมดูล)
//    เจตนาคือ "ไอคอนตัวนี้ต้องมาจากทะเบียน ไม่ใช่ emoji/SVG เขียนสด" ไม่ใช่การบังคับสไตล์โค้ด
//    ถ้าวันหนึ่งชื่อไอคอนถูกส่งผ่านตัวแปร ให้แจ้ง Fable ปรับวิธีวัด — ห้ามแก้ข้อสอบเอง
//
// 🔴 ทำไมไม่ล็อกชื่อไฟล์: สาย C/E อาจแตก `inbox-client.tsx` เป็นหลายไฟล์ (ควรทำด้วยซ้ำ — 906 บรรทัดแล้ว)
//    ⇒ ด่านนี้อ่าน **ทั้งโมดูลแชท** แล้ววัดว่า "ของอยู่ครบไหม" ไม่ใช่ "อยู่ไฟล์ไหน"
//    (บทเรียน 31 ส.ค.: qc-chat-inbox-ui เคยล็อกว่า action ต้องอยู่ `actions.ts` แล้วบังคับผิดที่)
//
// ═══════ สัญญาที่คุม (mockup.html จอ 1 + `.dcol1` · PLAN-CHAT-V2 §3 WO-CV3/CV10) ═══════
// LS-1) หัวรายการ: ชื่อ "แชทลูกค้า" · ปุ่มกรอง · เมนู ⋮ · ช่องค้นหา placeholder "ค้นหาชื่อ เบอร์ หรือข้อความ"
// LS-2) ชิปกรองครบตามแบบร่าง: ทั้งหมด · ยังไม่อ่าน · ของฉัน · **ยังไม่มีคนรับ** (ของใหม่) + ตัวเลขกำกับ
// LS-3) 🔴 ชิป "ยังไม่มีคนรับ" ต้องกรองได้จริงที่ชั้นข้อมูล (`assigneeUserId: null`)
//       ไม่ใช่ปุ่มที่กดแล้วได้รายการเดิม — ชิปหลอกคือบั๊กชนิด "ถึงระบบแล้วแต่ใช้งานไม่ได้"
// LS-4) หัวข้อกลุ่ม: **ปักหมุด** / วันนี้ / เมื่อวาน · 🔴 จัดกลุ่มวันต้องใช้เขตเวลาไทย
//       (บทเรียน: `getDay()`/`toDateString()` บนเครื่อง UTC เพี้ยนไป 1 วัน)
// LS-5) avatar 46px มุม 14px + แบดจ์ช่องทางมุมล่างขวา (แบดจ์ 22px ตามที่ WO-CV1 ปรับให้อ่านออก)
// LS-6) แถวที่ทีมตอบล่าสุดขึ้น "คุณ:" + ติ๊กสถานะส่ง (ไอคอนจากทะเบียน ไม่ใช่ ✓ ตัวหนังสือ)
// LS-7) ห้องที่มีคนรับขึ้นชื่อผู้รับผิดชอบในแถว
// LS-8) ไอคอนสรุปชนิดข้อความ: รูปภาพ / ข้อความเสียง + ความยาว (0:12) — ต้องมาจากทะเบียนไอคอน
// LS-9) ห้องปิดเสียง = ไอคอนกระดิ่งขีด · ห้องปิดแล้ว = ไอคอนวงกลมติ๊ก
// LS-10) ปักหมุด (P1): `pinnedAt`/`pinnedByUserId` ในสคีมา · **ระดับร้าน** (ทีมเห็นตรงกัน)
//        · เรียงห้องปักหมุดขึ้นก่อนจริงในคำสั่ง query · ปุ่มผูกกับ action ที่มีจริง
// LS-11) ปิดเสียง (P2): ตารางใหม่ `ChatConversationPref` · unique(conversationId,userId) · `mutedUntil`
//        🔴 **รายคน** ไม่ใช่ระดับร้าน — ถ้าไม่มี `userId` ในกุญแจ = ปิดเสียงให้คนหนึ่งแล้วทั้งร้านเงียบ
//        · ต้องลงทะเบียนใน `core/scope.ts` (ตารางใหม่ที่ไม่ลงทะเบียน = ข้อมูลข้ามร้านได้)
// LS-12) ตัวนับยังไม่อ่านเป็นเม็ดยาสีหลัก + เวลาของห้องที่ยังไม่อ่านเป็นสีหลัก
// LS-13) ห้ามฮาร์ดโค้ดวันที่/ปีในไฟล์หน้าจอ
// LS-14) 🔴 ปิดเสียงต้องมีผลกับ "การแจ้งเตือนจริง" ไม่ใช่แค่ไอคอนบนรายการ
//        (ถ้าไม่เช็คในเส้นทาง push = ไอคอนบอกว่าเงียบ แต่มือถือยังเด้ง)

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
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1");
function walk(rel: string, ext = /\.tsx?$/): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return ext.test(abs) ? [rel] : [];
  const out: string[] = [];
  for (const e of readdirSync(abs)) out.push(...walk(join(rel, e), ext));
  return out;
}

const CHAT_TSX = [...walk("src/lib/modules/chat"), ...walk("src/app/app/sys/[id]/chat")].filter((p) => p.endsWith(".tsx"));
const CHAT_TS = [...walk("src/lib/modules/chat")].filter((p) => p.endsWith(".ts"));
/** ทุกหน้าจอของโมดูลแชท (ผู้เขียนจะแตกไฟล์ยังไงก็ได้ ขอให้ของอยู่ครบ) */
const SCREEN = CHAT_TSX.map((f) => strip(read(f))).join("\n");
/** ฝั่งเซิร์ฟเวอร์ของโมดูลแชท (service/actions/inbox-actions/ของใหม่ที่แตกออกมา) */
const SERVER = CHAT_TS.map((f) => strip(read(f))).join("\n");
const SCHEMA = read("prisma/schema/chat.prisma");
const SCOPE = strip(read("src/lib/core/scope.ts"));
const PERMS = strip(read("src/lib/core/permissions.ts"));
// 🔴 Fable 1 ก.ย. — "เส้นทางแจ้งเตือน" กระจายอยู่ 3 ไฟล์โดยตั้งใจ:
//    `notify.ts` = การตัดสินใจแบบ pure (ห้ามแตะ prisma เพื่อให้ข้อสอบยิงตรงได้)
//    `push.ts`   = การอ่านข้อมูลจริง + ยิง Expo  ·  `service.ts` = จุดเรียก
//    ⇒ ต้องอ่านทั้ง 3 ไม่งั้นสรุปผิดว่า "ไม่มีด่านปิดเสียง" ทั้งที่มีอยู่คนละไฟล์
const NOTIFY = [
  strip(read("src/lib/modules/chat/notify.ts")),
  strip(read("src/lib/modules/chat/service.ts")),
  strip(read("src/lib/core/push.ts")),
].join("\n");

/**
 * ตัดตัวฟังก์ชันที่ export ออกมาทั้งก้อน (ตั้งแต่ชื่อจนถึง `export` ตัวถัดไป)
 * 🔴 ใช้แทนการ grep ทั้งไฟล์ — ไม่งั้น "ผ่านเพราะไฟล์นี้มี assertCan อยู่ที่อื่น" = ไม้บรรทัดที่โกหก
 */
function fnBody(src: string, re: RegExp): string {
  const m = src.match(re);
  if (!m || m.index === undefined) return "";
  const rest = src.slice(m.index);
  const next = rest.slice(10).search(/\nexport\s/);
  return next < 0 ? rest : rest.slice(0, next + 10);
}

try {
  section("LS-0", "LS-0 คู่บวก — อ่านซอร์สของโมดูลแชทได้จริง:", () => {
    chk("LS-0.1", "🟢 เจอไฟล์หน้าจอของโมดูลแชท (ถ้าลิสต์ว่าง ทุกข้อล่างจะแดงด้วยเหตุผลผิด)",
      CHAT_TSX.length >= 3 && SCREEN.length > 5000, `≥3 ไฟล์`, `${CHAT_TSX.length} ไฟล์ · ${SCREEN.length} ตัวอักษร`);
    chk("LS-0.2", "🟢 เจอไฟล์ฝั่งเซิร์ฟเวอร์ของโมดูลแชท", CHAT_TS.length >= 3 && SERVER.length > 5000,
      "≥3 ไฟล์", `${CHAT_TS.length} ไฟล์`);
  });

  // ═════════ LS-1 · หัวรายการ ═════════
  section("LS-1", "LS-1 หัวรายการตามแบบร่าง:", () => {
    chk("LS-1.1", 'ชื่อหน้า "แชทลูกค้า"', /แชทลูกค้า/.test(SCREEN), "มี", "ไม่พบ");
    chk("LS-1.2", 'ช่องค้นหา placeholder "ค้นหาชื่อ เบอร์ หรือข้อความ" (ข้อความตามแบบร่างเป๊ะ)',
      /ค้นหาชื่อ เบอร์ หรือข้อความ/.test(SCREEN), "ตรงแบบร่าง", "ข้อความไม่ตรง/ไม่มีช่องค้นหา", "MAJOR");
    chk("LS-1.3", "ปุ่มกรอง (ไอคอน filter จากทะเบียน)", /name=["']filter["']/.test(SCREEN), 'Icon name="filter"', "ไม่พบ", "MAJOR");
    chk("LS-1.4", "เมนู ⋮ ที่หัวรายการ (ไอคอน more จากทะเบียน)", /name=["']more["']/.test(SCREEN), 'Icon name="more"', "ไม่พบ", "MAJOR");
  });

  // ═════════ LS-2/3 · ชิปกรอง ═════════
  section("LS-2", "LS-2/3 ชิปกรอง — มีครบ และกรองได้จริง:", () => {
    for (const [id, label] of [["LS-2.1", "ทั้งหมด"], ["LS-2.2", "ยังไม่อ่าน"], ["LS-2.3", "ของฉัน"], ["LS-2.4", "ยังไม่มีคนรับ"]] as const) {
      chk(id, `ชิป "${label}" มีจริงบนหน้าจอ`, SCREEN.includes(label), "มี", "ไม่พบ");
    }
    chk("LS-2.5", "ชิปมีตัวเลขกำกับ (แบบร่างโชว์ 7 / 2 / 5) — ตัวเลขต้องมาจากข้อมูลจริง",
      /(unreadCount|counts?\.|filterCounts|badgeCount)/.test(SCREEN), "มีตัวนับต่อชิป", "ชิปไม่มีตัวเลข", "MAJOR");
    // 🔴 ชิปที่กดแล้วได้ผลเหมือนเดิม = ปุ่มหลอก → ต้องเห็นเงื่อนไขจริงในชั้นข้อมูล
    chk("LS-3.1", "🔴 ตัวกรอง 'ยังไม่มีคนรับ' ทำงานจริงที่ชั้นข้อมูล (assigneeUserId เป็น null)",
      /assigneeUserId\s*:\s*null/.test(SERVER), "พบเงื่อนไข assigneeUserId: null",
      "ไม่พบ — ชิปกดแล้วได้รายการเดิม");
    chk("LS-3.2", "🟢 คู่บวก: ตัวกรองเดิม (ยังไม่อ่าน/ของฉัน) ยังอยู่ครบ ไม่ถูกทำหายตอนเพิ่มของใหม่",
      /staffUnreadCount/.test(SERVER) && /assigneeUserId/.test(SERVER), "ครบ", "ตัวกรองเดิมหาย");
  });

  // ═════════ LS-4 · หัวข้อกลุ่ม ═════════
  section("LS-4", "LS-4 หัวข้อกลุ่มในรายการ:", () => {
    chk("LS-4.1", 'หัวข้อ "ปักหมุด" ในรายการ', /ปักหมุด/.test(SCREEN), "มี", "ไม่พบ");
    chk("LS-4.2", 'หัวข้อ "วันนี้" / "เมื่อวาน"', /วันนี้/.test(SCREEN) && /เมื่อวาน/.test(SCREEN), "มีทั้งคู่", "ไม่ครบ");
    // 🔴 กับดักที่เคยทำให้วันเพี้ยนไป 1 วันบนเครื่อง UTC
    const trap = /\.toDateString\(\)|\.getDay\(\)|\.getDate\(\)/.test(SCREEN);
    chk("LS-4.3", "🔴 จัดกลุ่มวันด้วยเขตเวลาไทย ไม่ใช่เวลาเครื่อง (เซิร์ฟเวอร์เป็น UTC → เพี้ยน 1 วัน)",
      /timeZone/.test(SCREEN) && !trap, "ใช้ timeZone · ไม่มี getDay()/toDateString()",
      trap ? "พบ getDay()/getDate()/toDateString() ในหน้าจอแชท" : "ไม่พบการระบุ timeZone");
  });

  // ═════════ LS-5..9 · องค์ประกอบของแถว ═════════
  section("LS-5", "LS-5..9 องค์ประกอบของแต่ละแถวตามแบบร่าง:", () => {
    chk("LS-5.1", "avatar มุม 14px (แบบร่าง `.av{border-radius:14px}`) ไม่ใช่วงกลม",
      /rounded-\[14px\]|borderRadius:\s*["']?14/.test(SCREEN), "มุม 14px", "ไม่พบ — ยังเป็นวงกลม/มุมอื่น", "MAJOR");
    chk("LS-5.2", "avatar ขนาด 46px ในรายการ", /46px|size-\[46px\]|h-\[46px\]/.test(SCREEN), "46px", "ไม่พบ", "MINOR");
    chk("LS-5.3", "แบดจ์ช่องทางบน avatar", /(ChannelBadge|ChannelIcon)/.test(SCREEN), "มีแบดจ์ช่องทาง", "ไม่พบ");
    chk("LS-6.1", '🔴 แถวที่ทีมตอบล่าสุดขึ้นคำนำหน้า "คุณ:" (แบบร่าง `.pv b`) — ไม่งั้นแยกไม่ออกว่าใครพูดล่าสุด',
      /คุณ:/.test(SCREEN), 'มี "คุณ:"', "ไม่พบ");
    chk("LS-6.2", "ติ๊กสถานะส่งในรายการมาจากทะเบียนไอคอน (check/check2) ไม่ใช่ตัวอักษร ✓",
      /name=["']check2?["']/.test(SCREEN), 'Icon name="check2"', "ไม่พบไอคอนติ๊กจากทะเบียน");
    chk("LS-7.1", "ห้องที่มีคนรับขึ้นชื่อผู้รับผิดชอบในแถว (แบบร่าง: 'มุก รับเรื่อง')",
      /รับเรื่อง/.test(SCREEN), "มี", "ไม่พบ", "MAJOR");
    chk("LS-8.1", "ไอคอนสรุปชนิดข้อความ: รูปภาพ", /name=["']image["']/.test(SCREEN), 'Icon name="image"', "ไม่พบ", "MAJOR");
    chk("LS-8.2", "ไอคอนสรุปชนิดข้อความ: ข้อความเสียง + ความยาว (0:12)",
      /name=["']mic["']/.test(SCREEN) && /ข้อความเสียง/.test(SCREEN), "มีทั้งไอคอนและป้าย", "ไม่ครบ", "MAJOR");
    chk("LS-9.1", "ห้องปิดเสียงขึ้นไอคอนกระดิ่งขีด", /name=["']belloff["']/i.test(SCREEN), 'Icon name="belloff"', "ไม่พบ", "MAJOR");
    chk("LS-9.2", "ห้องปิดแล้วขึ้นไอคอนวงกลมติ๊ก", /name=["']checkcircle["']/i.test(SCREEN), 'Icon name="checkcircle"', "ไม่พบ", "MAJOR");
    chk("LS-12.1", "ตัวนับยังไม่อ่านแสดงเป็นเม็ดยา", /staffUnreadCount/.test(SCREEN), "มีตัวนับในแถว", "ไม่พบ");
  });

  // ═════════ LS-10 · ปักหมุด ═════════
  section("LS-10", "LS-10 ปักหมุด (P1 · ระดับร้าน):", () => {
    chk("LS-10.1", "สคีมา ChatConversation มี pinnedAt", /pinnedAt\s+DateTime\?/.test(SCHEMA), "มี pinnedAt", "ยังไม่มีในสคีมา");
    chk("LS-10.2", "สคีมามี pinnedByUserId (รู้ว่าใครปัก — ทีมเห็นตรงกันต้องตรวจย้อนได้)",
      /pinnedByUserId\s+String\?/.test(SCHEMA), "มี pinnedByUserId", "ยังไม่มี", "MAJOR");
    chk("LS-10.3", "🔴 คำสั่งดึงรายการเรียงห้องปักหมุดขึ้นก่อน lastMessageAt",
      (() => {
        const m = SERVER.match(/orderBy\s*:\s*\[[^\]]*\]/g) ?? [];
        return m.some((o) => o.includes("pinnedAt") && o.indexOf("pinnedAt") < o.indexOf("lastMessageAt"));
      })(), "orderBy: [{pinnedAt}, {lastMessageAt}]", "ไม่พบการเรียงที่พาห้องปักหมุดขึ้นก่อน");
    // 🔴 กับดักของ Postgres: `ORDER BY x DESC` ตั้งต้นเป็น **NULLS FIRST**
    //    ⇒ `orderBy: { pinnedAt: "desc" }` เฉย ๆ จะดันห้องที่ **ไม่ได้ปักหมุด** ขึ้นบนสุด (กลับหัว)
    //    ข้อนี้จับบั๊กที่หน้าจอดู "เกือบถูก" จนกว่าจะมีคนปักหมุดจริงแล้วงง
    chk("LS-10.3b", "🔴 การเรียง pinnedAt ระบุ nulls last (ไม่งั้น Postgres ดันห้องที่ไม่ได้ปักหมุดขึ้นก่อน)",
      (() => {
        const i = SERVER.indexOf("pinnedAt");
        return i >= 0 && /nulls\s*:\s*["']last["']/.test(SERVER.slice(i, i + 200));
      })(), 'sort/nulls: "last"', "ไม่ระบุ nulls — ลำดับกลับหัวเมื่อมีห้องปักหมุดจริง");
    chk("LS-10.4", "ปุ่มปักหมุดผูกกับ server action ที่มีจริง (ไม่ใช่ปุ่มหลอก)",
      /export async function \w*[Pp]in\w*Action/.test(SERVER), "มี action ปักหมุด", "ไม่มี action — ปุ่มหลอก");
    // 🔴 วัดในตัวฟังก์ชันเอง ไม่ใช่ทั้งไฟล์ — ไฟล์นี้มี assertCan อยู่แล้วเป็นสิบที่
    const pinFn = fnBody(SERVER, /export async function \w*[Pp]in\w*Action/);
    chk("LS-10.5", "action ปักหมุด **ตัวมันเอง** ผ่านด่านสิทธิ์ (ไม่ใช่ไฟล์มี assertCan อยู่ที่อื่น)",
      pinFn.length > 0 && /assertChatCan|assertCan/.test(pinFn), "มีด่านสิทธิ์ในฟังก์ชัน",
      pinFn ? "ฟังก์ชันปักหมุดไม่มีด่านสิทธิ์" : "ยังไม่มี action ปักหมุด");
  });

  // ═════════ LS-11 · ปิดเสียงรายคน ═════════
  section("LS-11", "LS-11 ปิดเสียงแจ้งเตือน (P2 · รายคน):", () => {
    const model = SCHEMA.match(/model ChatConversationPref \{([\s\S]*?)\n\}/)?.[1] ?? "";
    chk("LS-11.1", "มีตาราง ChatConversationPref ในสคีมา", model.length > 0, "มีตาราง", "ยังไม่มี");
    chk("LS-11.2", "🔴 กุญแจเป็นคู่ (conversationId, userId) — ปิดเสียงเป็นเรื่อง **รายคน** ไม่ใช่ทั้งร้าน",
      /@@unique\(\[conversationId,\s*userId\]\)/.test(model), "@@unique([conversationId, userId])",
      model ? "ไม่มี unique คู่ — ปิดเสียงคนเดียวแล้วทั้งร้านเงียบ" : "ยังไม่มีตาราง");
    chk("LS-11.3", "มีช่อง mutedUntil (ปิดเสียงชั่วคราวได้ ไม่ใช่ปิดถาวรอย่างเดียว)",
      /mutedUntil\s+DateTime\?/.test(model), "มี mutedUntil", "ไม่มี");
    chk("LS-11.4", "🔴 ตารางใหม่ลงทะเบียนใน core/scope.ts แล้ว (ไม่ลงทะเบียน = ข้อมูลข้ามร้านได้เงียบ ๆ)",
      /ChatConversationPref\s*:/.test(SCOPE), "ลงทะเบียนแล้ว", "ยังไม่ลงทะเบียนใน scope.ts");
    chk("LS-11.5", "ปุ่มปิดเสียงผูกกับ server action ที่มีจริง",
      /export async function \w*[Mm]ute\w*Action/.test(SERVER), "มี action ปิดเสียง", "ไม่มี action — ปุ่มหลอก");
    // 🔴 ข้อที่สำคัญที่สุดของฟีเจอร์นี้ — ไอคอนบอกว่าเงียบ แต่มือถือยังเด้ง = โกหกผู้ใช้
    chk("LS-14.1", "🔴 ปิดเสียงมีผลกับเส้นทางแจ้งเตือนจริง (push/notify อ่านค่า mute ก่อนยิง)",
      // เข้มขึ้นกว่าเดิม: ต้อง **อ่านค่าจากตาราง** และ **ส่งเข้าตัวตัดสินใจ** ทั้งคู่
      // (อ่านมาแล้วไม่ได้ใช้ = โค้ดตายที่ดูเหมือนมีด่าน)
      /chatConversationPref|ChatConversationPref/.test(NOTIFY)
        && /mutedUntil/.test(NOTIFY)
        && /mutedUserIds/.test(NOTIFY),
      "อ่านค่าจากตาราง + ส่งเข้าตัวเลือกผู้รับ",
      "ไม่ครบ — ไอคอนบอกว่าเงียบ แต่มือถือยังเด้ง");
  });

  // ═════════ LS-13 · สุขอนามัย ═════════
  section("LS-13", "LS-13 สุขอนามัยของไฟล์หน้าจอ:", () => {
    const dates = SCREEN.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
    chk("LS-13.1", "🔴 ไม่มีวันที่/ปีฮาร์ดโค้ดในหน้าจอ (โค้ดที่ผูกวันที่ตายตัวเน่าตามเวลา)",
      dates.length === 0, "ไม่มี", j(dates.slice(0, 5)));
    chk("LS-13.2", "รายการยังสดอยู่ (มีรอบ poll) — ห้ามถอยหลังกลับไปรีเฟรชทั้งหน้า",
      /setInterval|setTimeout/.test(SCREEN) && !/<AutoRefresh\b/.test(SCREEN), "มี poll · ไม่มี AutoRefresh", "ถอยหลัง");
  });
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT V2 LIST =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
