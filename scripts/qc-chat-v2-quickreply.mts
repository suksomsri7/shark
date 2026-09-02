// QC — WO-CV6: ปลุกตาราง `ChatQuickReply` ที่ตายมาตั้งแต่ต้น · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ตรวจแล้ว 1 ก.ย. 2026 ไม่มีชื่อนี้ในรีโป
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
// ⚠️ **ห้ามแตะ DB จริง** → ทับ `DATABASE_URL` เป็นค่าตายก่อน import อะไรทั้งสิ้น
//    (PrismaClient ถูกสร้างตอน import แต่ยังไม่ต่อจนกว่าจะมี query — ทับ URL จึงปลอดภัย)
// ⚠️ contract-first: `chat/quick-reply.ts` ยังไม่มี (สาย D รอบ 2) → ต้องแดงอย่างถูกต้อง ห้าม skip เงียบ
//
// ═══════ ทำไมชุดนี้ถึงมี ═══════
// `ChatQuickReply` มีสคีมาครบตั้งแต่วันแรก (shortcut/title/body/channelTypes/usageCount)
// แต่ **grep ทั้ง `src/` เจอแค่บรรทัดลงทะเบียนใน `core/scope.ts` บรรทัดเดียว** — ไม่มีโค้ดไหนอ่านหรือเขียนเลย
// ⇒ ด่านนี้คือตัวพิสูจน์ว่ามันถูกปลุกจริง ไม่ใช่ "มีตารางแล้วถือว่ามีฟีเจอร์"
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-V2 §3 WO-CV6) ═══════
// QR-1) ตารางถูกใช้จริงทั้งขาอ่านและขาเขียน (ไม่ใช่มีแต่ในทะเบียน scope)
// QR-2) มีหน้า/action จัดการคลัง + **สิทธิ์ของมันเองในทะเบียนกลาง** (ไม่ยืมสิทธิ์ "ตอบลูกค้า" มาใช้
//       — คลังคำตอบเป็นแหล่งอ้างอิงถาวรของทั้งร้าน คนละน้ำหนักกับการตอบ 1 ครั้ง · แนวเดียวกับ `chat.example.manage`)
// QR-3) 🔴 ทุกคำสั่งที่แตะตารางต้องมี `systemId` ในเงื่อนไข — คลังของร้าน A ห้ามโผล่ในร้าน B
// QR-4) คำตอบที่ถูกเก็บเข้ากรุ (`archivedAt`) ต้องไม่ถูกเสนออีก
// QR-5) `channelTypes` — `[]` = ทุกช่องทาง · ระบุแล้วไม่ตรงช่องทางของห้อง = ไม่เสนอ
// QR-6) แทนที่ตัวแปรตามที่สคีมาเขียนไว้: `{{contact.name}}` `{{staff.name}}` `{{unit.name}}`
// QR-7) 🔴 ตัวแปรที่ไม่มีค่า/ไม่รู้จัก **ห้ามหลุดเป็น `{{...}}` ถึงลูกค้า**
//       (ข้อความที่ส่งออกไปแล้วแก้ไม่ได้ — ลูกค้าเห็น `{{contact.name}}` = ร้านดูไม่มืออาชีพ)
// QR-8) 🔴 `usageCount` ต้องบวกแบบ atomic ในคำสั่งเดียว (`{ increment: 1 }`)
//       บทเรียน: อ่านมาบวกแล้วเขียนกลับ จะนับพลาดเมื่อพนักงาน 2 คนกดพร้อมกัน และ DB จำลองจับไม่ได้
// QR-9) `usageCount` ต้องไม่ถูกบวกในฟังก์ชัน "อ่านรายการ" (เปิดหน้าทีเดียวยอดพุ่ง = ตัวเลขที่โกหก)
// QR-10) หน้าจอ: เรียกด้วย `/` ในกล่องพิมพ์ · จัดการคลังในหน้า "เชื่อมช่องทาง"
//
// 🔴 เรื่องชื่อ: ข้อ QR-6/7 ต้องเรียกฟังก์ชันจริงจึงจะวัดพฤติกรรมได้ ⇒ **จำเป็น**ต้องรู้ชื่อ
//    ด่านนี้จึงรับหลายชื่อ/หลายที่อยู่ (ดู CANDIDATES) และล้มพร้อมข้อความบอกสัญญาที่ต้องการ
//    ถ้าสายงานเลือกชื่ออื่น ให้แจ้ง Fable เพิ่มชื่อลงลิสต์ — ห้ามแก้ข้อสอบเอง

try { process.loadEnvFile(".env"); } catch {}
// 🔴 ต้องทับ **ก่อน** import โค้ดแอป — .env ของรีโปนี้ชี้ DB prod จริง
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db";
process.env.CHAT_CREDENTIALS_KEY ??= "0".repeat(64);

const { readFileSync, existsSync, readdirSync, statSync } = await import("node:fs");
const { join, resolve } = await import("node:path");

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
const section = async (id: string, name: string, fn: () => void | Promise<void>) => {
  console.log(name);
  try { await fn(); } catch (e) { chk(`${id}.CRASH`, `${name} ล้มกลางคัน`, false, "รันจบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }
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

const SRC_FILES = [...walk("src/lib/modules/chat"), ...walk("src/app/app/sys/[id]/chat"), ...walk("src/lib/ai")];
const SRC = SRC_FILES.map((f) => strip(read(f))).join("\n");
const SCREEN = SRC_FILES.filter((f) => f.endsWith(".tsx")).map((f) => strip(read(f))).join("\n");
const SERVER = SRC_FILES.filter((f) => f.endsWith(".ts")).map((f) => strip(read(f))).join("\n");
const PERMS = strip(read("src/lib/core/permissions.ts"));
const SCHEMA = read("prisma/schema/chat.prisma");

// ที่อยู่/ชื่อที่ยอมรับสำหรับตัวแทนที่ตัวแปร (ดูเหตุผลหัวไฟล์)
const CANDIDATES = [
  "@/lib/modules/chat/quick-reply",
  "@/lib/modules/chat/quickreply",
  "@/lib/modules/chat/quick-replies",
];
const RENDER_NAMES = ["renderQuickReply", "renderQuickReplyBody", "applyQuickReplyVars", "fillQuickReply"];
const MATCH_NAMES = ["quickReplyMatchesChannel", "matchesChannel", "isQuickReplyForChannel"];

let mod: Record<string, unknown> | null = null;
for (const p of CANDIDATES) {
  mod = (await import(p as string).catch(() => null)) as Record<string, unknown> | null;
  if (mod) break;
}
const pick = (names: string[]) => {
  for (const n of names) if (mod && typeof mod[n] === "function") return mod[n] as (...a: unknown[]) => unknown;
  return null;
};

try {
  await section("QR-0", "QR-0 คู่บวก — สภาพตั้งต้น:", () => {
    chk("QR-0.1", "🟢 อ่านซอร์สของโมดูลแชทได้", SRC.length > 5000, "≥5000", `${SRC.length}`);
    chk("QR-0.2", "🟢 สคีมา ChatQuickReply ยังมีอยู่ครบ (shortcut/body/channelTypes/usageCount)",
      /model ChatQuickReply/.test(SCHEMA) && /usageCount/.test(SCHEMA) && /channelTypes/.test(SCHEMA),
      "มีครบ", "สคีมาเปลี่ยน — ต้องทบทวนข้อสอบ");
  });

  // ═════════ QR-1 · ตารางถูกปลุกจริง ═════════
  await section("QR-1", "QR-1 ตารางถูกปลุกจริง (ไม่ใช่มีแค่ในทะเบียน scope):", () => {
    const reads = (SERVER.match(/chatQuickReply\.(findMany|findFirst|findUnique|count)/g) ?? []).length;
    const writes = (SERVER.match(/chatQuickReply\.(create|update|updateMany|delete|deleteMany|upsert)/g) ?? []).length;
    chk("QR-1.1", "มีขาอ่านตาราง ChatQuickReply", reads > 0, "≥1", `${reads}`);
    chk("QR-1.2", "มีขาเขียนตาราง ChatQuickReply (สร้าง/แก้/เก็บเข้ากรุ)", writes > 0, "≥1", `${writes}`);
    chk("QR-1.3", "มีโมดูลรวมตรรกะคำตอบสำเร็จรูป (ไม่กระจายอยู่ในหน้าจอ)",
      mod !== null, `ไฟล์ใดไฟล์หนึ่งใน ${j(CANDIDATES)}`, "ไม่พบโมดูล — ยังไม่ถูกสร้าง");
  });

  // ═════════ QR-2 · สิทธิ์ ═════════
  await section("QR-2", "QR-2 สิทธิ์จัดการคลังคำตอบ:", () => {
    const act = PERMS.match(/"(chat\.(?:quickreply|quickReply|quick_reply)\.[a-zA-Z]+)"/)?.[1] ?? "";
    chk("QR-2.1", "🔴 มี action ของตัวเองในทะเบียนสิทธิ์กลาง (ไม่ยืมสิทธิ์ 'ตอบลูกค้า' มาใช้)",
      act.length > 0, "เช่น chat.quickreply.manage", "ไม่มีในทะเบียน — ใครก็แก้คลังของทั้งร้านได้");
    chk("QR-2.2", "action ถูกบังคับใช้จริงในเส้นทางแก้คลัง (assertChatCan/assertCan)",
      act.length > 0 && new RegExp(act.replace(/\./g, "\\.")).test(SERVER), "ถูกอ้างในโค้ดจริง",
      act ? "ประกาศไว้แต่ไม่มีใครเรียก — สิทธิ์หลอก" : "ยังไม่มี action");
  });

  // ═════════ QR-3/4 · ขอบเขต + ของที่เก็บเข้ากรุ ═════════
  await section("QR-3", "QR-3/4 ขอบเขตร้าน + ของที่เก็บเข้ากรุ:", () => {
    const calls = [...SERVER.matchAll(/chatQuickReply\.\w+\(/g)].map((m) => SERVER.slice(m.index!, m.index! + 400));
    const noScope = calls.filter((c) => !/systemId/.test(c));
    chk("QR-3.1", "🔴 ทุกคำสั่งที่แตะตารางมี systemId ในเงื่อนไข (คลังร้าน A ห้ามโผล่ในร้าน B)",
      calls.length > 0 && noScope.length === 0, "ทุกคำสั่งมี systemId",
      calls.length === 0 ? "ยังไม่มีคำสั่งไหนแตะตารางเลย" : `${noScope.length} คำสั่งไม่มี systemId`);
    // 🔴 ต้องอยู่ใน **คำสั่งของตารางนี้** — ของเดิมมี `archivedAt: null` อยู่แล้วสำหรับ ChatAnswerExample
    //    ถ้าจับทั้งไฟล์จะได้เขียวหลอกทันทีโดยที่คลังคำตอบยังไม่มีการกรองเลย
    chk("QR-4.1", "รายการที่เสนอกรอง archivedAt: null ในคำสั่งของ ChatQuickReply เอง",
      calls.some((c) => /archivedAt\s*:\s*null/.test(c)), "มีเงื่อนไข archivedAt: null",
      calls.length === 0 ? "ยังไม่มีคำสั่งไหนแตะตารางเลย" : "ไม่มี — ของที่ถอดแล้วยังโผล่");
  });

  // ═════════ QR-5/6/7 · พฤติกรรมจริง (เรียกฟังก์ชัน) ═════════
  await section("QR-5", "QR-5..7 พฤติกรรมจริงของการแทนที่ตัวแปร + ตัวกรองช่องทาง:", async () => {
    const render = pick(RENDER_NAMES);
    const match = pick(MATCH_NAMES);
    chk("QR-5.0", `🟢 คู่บวก: หา ตัวแทนที่ตัวแปร เจอ (รับชื่อ ${j(RENDER_NAMES)})`,
      render !== null, "เจอฟังก์ชัน", mod ? `โมดูลมี export: ${j(Object.keys(mod))}` : "ยังไม่มีโมดูล");

    if (render) {
      const vars = { contact: { name: "คุณกานต์" }, staff: { name: "มุก" }, unit: { name: "สาขาป่าตอง" } };
      const out1 = String(render("สวัสดีครับ {{contact.name}} · ทีมงาน {{staff.name}} จาก {{unit.name}}", vars));
      chk("QR-6.1", "แทนที่ {{contact.name}} ด้วยชื่อลูกค้าจริง", out1.includes("คุณกานต์"), "มีชื่อลูกค้า", out1.slice(0, 120));
      chk("QR-6.2", "แทนที่ {{staff.name}} ด้วยชื่อพนักงาน", out1.includes("มุก"), "มีชื่อพนักงาน", out1.slice(0, 120));
      chk("QR-6.3", "แทนที่ {{unit.name}} ด้วยชื่อสาขา", out1.includes("สาขาป่าตอง"), "มีชื่อสาขา", out1.slice(0, 120));
      chk("QR-6.4", "🔴 ไม่เหลือเครื่องหมาย {{…}} ในผลลัพธ์", !/\{\{|\}\}/.test(out1), "ไม่เหลือ", out1.slice(0, 120));

      // 🔴 ฉากที่ทำให้ลูกค้าเห็นของหลุด: ลูกค้าที่ยังไม่มีชื่อ + ตัวแปรที่ไม่รู้จัก
      const out2 = String(render("สวัสดีครับ {{contact.name}} {{promo.code}}", { contact: { name: null } }));
      chk("QR-7.1", "🔴 ตัวแปรที่ไม่มีค่า/ไม่รู้จัก ต้องไม่หลุดเป็น {{…}} ถึงลูกค้า",
        !/\{\{|\}\}/.test(out2), "ไม่เหลือ {{…}}", out2.slice(0, 120));
      chk("QR-7.2", "ผลลัพธ์ยังเป็นประโยคที่อ่านรู้เรื่อง (ไม่กลายเป็นค่าว่างทั้งข้อความ)",
        out2.trim().length > 0, "ยังมีข้อความ", j(out2));
      chk("QR-7.3", "ไม่โยน error เมื่อไม่มีตัวแปรเลย (ทีมกำลังตอบลูกค้าอยู่ ห้ามพัง)",
        (() => { try { String(render("สวัสดีครับ {{contact.name}}", {})); return true; } catch { return false; } })(),
        "ไม่ throw", "throw");
      chk("QR-7.4", "ข้อความที่ไม่มีตัวแปรเลย ต้องออกมาเหมือนเดิมทุกตัวอักษร",
        String(render("เลขบัญชี 123-4-56789 ชื่อบัญชี ร้านค้า", vars)) === "เลขบัญชี 123-4-56789 ชื่อบัญชี ร้านค้า",
        "เหมือนเดิม", String(render("เลขบัญชี 123-4-56789 ชื่อบัญชี ร้านค้า", vars)));
    } else {
      for (const id of ["QR-6.1", "QR-6.2", "QR-6.3", "QR-6.4", "QR-7.1", "QR-7.2", "QR-7.3", "QR-7.4"]) {
        chk(id, "วัดไม่ได้เพราะยังไม่มีตัวแทนที่ตัวแปร", false, "มีฟังก์ชันให้เรียก",
          "ยังไม่มีโค้ด — contract-first: ข้อนี้ต้องแดงจนกว่าจะเขียนเสร็จ");
      }
    }

    chk("QR-5.1", `🟢 คู่บวก: หา ตัวกรองช่องทาง เจอ (รับชื่อ ${j(MATCH_NAMES)})`,
      match !== null, "เจอฟังก์ชัน", mod ? `โมดูลมี export: ${j(Object.keys(mod))}` : "ยังไม่มีโมดูล", "MAJOR");
    if (match) {
      chk("QR-5.2", "channelTypes = [] แปลว่าใช้ได้ทุกช่องทาง",
        match({ channelTypes: [] }, "LINE") === true, "true", j(match({ channelTypes: [] }, "LINE")));
      chk("QR-5.3", "ระบุช่องทางแล้วตรง = ใช้ได้",
        match({ channelTypes: ["LINE"] }, "LINE") === true, "true", j(match({ channelTypes: ["LINE"] }, "LINE")));
      chk("QR-5.4", "🔴 ระบุช่องทางแล้วไม่ตรง = ไม่เสนอ (ข้อความของ LINE ไปโผล่ในห้อง IG = ผิดบริบท)",
        match({ channelTypes: ["LINE"] }, "INSTAGRAM") === false, "false", j(match({ channelTypes: ["LINE"] }, "INSTAGRAM")));
    } else {
      for (const id of ["QR-5.2", "QR-5.3", "QR-5.4"]) {
        chk(id, "วัดไม่ได้เพราะยังไม่มีตัวกรองช่องทาง", false, "มีฟังก์ชันให้เรียก", "ยังไม่มีโค้ด", "MAJOR");
      }
    }
  });

  // ═════════ QR-8/9 · ตัวนับการใช้งาน ═════════
  await section("QR-8", "QR-8/9 ตัวนับการใช้งาน:", () => {
    const incIdx = SERVER.search(/usageCount\s*:\s*\{\s*increment\s*:\s*1/);
    chk("QR-8.1", "🔴 บวก usageCount แบบ atomic ในคำสั่งเดียว ({ increment: 1 })",
      incIdx >= 0, "{ increment: 1 }", "ไม่พบ — ถ้าอ่านมาบวกแล้วเขียนกลับ จะนับพลาดตอนกดพร้อมกัน");
    const readBack = /const\s+\w+\s*=\s*await\s+[\w.]*chatQuickReply\.find[\s\S]{0,400}?usageCount\s*:\s*[\w.]+\s*\+\s*1/.test(SERVER);
    chk("QR-8.2", "🔴 ไม่ใช้ท่าอ่านมาบวกแล้วเขียนกลับ (นับพลาดเมื่อ 2 คนกดพร้อมกัน · DB จำลองจับไม่ได้)",
      !readBack, "ไม่มีท่าอ่าน-บวก-เขียน", "พบท่าอ่านมาบวกแล้วเขียนกลับ");
    // ฟังก์ชันที่ครอบการบวกอยู่ — ถ้าเป็นฟังก์ชัน "อ่านรายการ" ตัวเลขจะพุ่งทุกครั้งที่เปิดหน้า
    const owner = incIdx < 0 ? "" : (SERVER.slice(0, incIdx).match(/function\s+(\w+)/g) ?? []).pop() ?? "";
    chk("QR-9.1", "ตัวนับไม่ถูกบวกในฟังก์ชันอ่านรายการ (เปิดหน้าทีเดียวยอดพุ่ง = ตัวเลขที่โกหก)",
      incIdx < 0 ? false : !/function\s+(list|get|load|fetch)/i.test(owner),
      "บวกในเส้นทางใช้งานจริง", incIdx < 0 ? "ยังไม่มีตัวนับ" : `บวกอยู่ใน ${owner}`, "MAJOR");
  });

  // ═════════ QR-10 · หน้าจอ ═════════
  await section("QR-10", "QR-10 คนใช้งานไปถึงได้จริง:", () => {
    chk("QR-10.1", "กล่องพิมพ์เรียกคลังด้วย `/`", /startsWith\(["']\/["']\)|slashCommand|quickReply/i.test(SCREEN), "มี", "ไม่พบ");
    chk("QR-10.2", "มีหน้าจอจัดการคลัง (สร้าง/แก้/เก็บเข้ากรุ) ที่คนกดถึงได้",
      /คำตอบสำเร็จรูป/.test(SCREEN) && /(chatQuickReply|QuickReply)/.test(SCREEN), "มีหน้าจอจัดการ", "ไม่พบ");
    chk("QR-10.3", "ตัวเลือกโชว์ทางลัด (shortcut) + หัวเรื่อง ให้ทีมเลือกถูกตัว",
      /shortcut/.test(SCREEN), "โชว์ shortcut", "ไม่โชว์ — ทีมต้องเดา", "MAJOR");
  });
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT V2 QUICKREPLY =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
