// QC — WO-CW4: หน้าจอกล่องแชทแบบ WhatsApp + **เส้นทางที่คนใช้งานเดินจริง** · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ชื่อนี้ยังไม่มีในรีโป (ตรวจแล้ว 31 ส.ค. 2026)
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
//
// ⚠️ ชุดนี้เป็น **static ล้วน** (อ่านไฟล์ด้วย fs) — ไม่ต่อ DB ไม่ต่อเน็ต ไม่ import โค้ดแอป
//    เพราะสิ่งที่วัดคือ "หน้าจอ/เมนู/ปุ่มมีจริงไหม" ซึ่งพิสูจน์ได้จากซอร์ส แบบเดียวกับ qc-nav-functions.mts
//    🔴 ตัดคอมเมนต์ก่อน grep เสมอ — คอมเมนต์ที่เล่าอดีตถูกนับเป็นการใช้จริง = ผลลบปลอม
//
// ═══════ ทำไมชุดนี้ถึงมี (บทเรียน 29 ส.ค. 2026) ═══════
// บั๊ก 5 ตัวที่เจ้าของเจอเอง **ผ่านข้อสอบทั้ง 400+ ข้อ**: เมนูที่ไม่มีลิงก์ · รหัสลับที่ไม่เคยแสดง ·
// {sent:1} ที่โกหก · ปุ่มที่ไม่มี · ภาษาที่ถูกเขียนทับ
// ⇒ ข้อสอบทุกข้อวัด "โค้ดทำงานถูกไหม" แต่ไม่มีข้อไหนวัด **"คนใช้งานไปถึงได้ไหม"**
//    ชุดนี้คือชุดที่วัดข้อหลัง
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-WHATSAPP §6 · §2 กฎเหล็กข้อ 6) ═══════
// IU-1) เมนูกับแท็บต้องพูดตรงกัน: `chatTabs()` == `childrenFor("CHAT")` ใน app/layout.tsx
//       · ทุก href มี page.tsx จริง (dead link = 0)
// IU-2) 🔴 ลิงก์เก่า `/app/sys/<id>/chat?c=<id>` **ห้ามตาย** — push (`data.url`) และ AppNotification
//       ที่ส่งไปแล้วบนเครื่องลูกค้าใช้รูปนี้ · redirect ต้องพา `?c=` ไปด้วย ไม่งั้นแตะแจ้งเตือน
//       แล้วเปิดมาที่รายการเปล่า (บั๊กแบบ "ถึงระบบแล้วแต่ใช้งานไม่ได้")
// IU-3) หน้าภาพรวม `/app/sys/<id>` = กล่องแชทเต็มจอ ไม่ใช่การ์ด 2 ใบ (G1 · คำสั่งข้อ 1)
// IU-4) ไอคอนช่องทาง = **ทะเบียนเดียว** ครอบทุกค่าใน enum `ChatChannelType` (อ่าน enum จากสคีมาจริง
//       ไม่ใช่ลิสต์ที่พิมพ์ไว้ในข้อสอบ) · SVG inline ห้ามดึงจาก CDN ภายนอก
//       · ห้ามมีลิสต์ป้ายช่องทางพิมพ์ซ้ำที่อื่น (บทเรียน AS-6.1/6.3)
//       · `CHANNEL_LABEL_TH` ใน service.ts (ใช้ในข้อความแจ้งเตือน) ต้องครบทุกค่าเช่นกัน
// IU-5) composer มีจริง: 📎 แนบไฟล์ · 📷 ถ่ายรูป (`capture="environment"`) · ✨ AI แนะนำ ·
//       🌐 แปลก่อนส่ง · สลับโหมดโน้ตภายใน — และทุกปุ่ม **ผูกกับ action ที่มีจริง** ไม่ใช่ปุ่มหลอก
// IU-6) ความสด: เลิก `AutoRefresh` ทั้งหน้า · มี loadInboxAction/loadThreadAction · poll ~5 วิ
//       🔴 ห้ามถอยหลังจาก G2: ตัวใหม่ต้องพา **ข้อความ + ตัวนับ unread + ติ๊ก ✓✓** มาครบ
//       🔴 ห้ามเด้งคนที่กำลังพิมพ์ — ร่าง + ไฟล์ที่เลือกไว้ต้องรอดทุกรอบ poll
// IU-7) ติ๊ก ✓ / ✓✓ / ✗ + ปุ่มลองใหม่ · ✓✓ ต้องมาจากข้อมูล "ลูกค้าอ่านแล้ว" ที่มีอยู่จริง
// IU-8) ตัวคั่นวันที่ (วันนี้/เมื่อวาน) · badge ช่องทางบน avatar · แท็บกรอง 4 แบบ
// IU-9) ⚠️ ไอคอนมี ≠ ช่องทางใช้ได้ — หน้า "เชื่อมช่องทาง" ต้องบอกชัดว่าช่องทางไหน "ยังไม่เปิด"
//       (ห้ามทำให้เจ้าของเข้าใจว่าเชื่อม WhatsApp/Messenger/IG/TikTok ได้แล้ว)
// IU-10) 🔴 ห้ามฮาร์ดโค้ดวันที่/ปี ในไฟล์หน้าจอ — ข้อสอบและโค้ดที่ผูกวันที่ตายตัวเน่าตามเวลา

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
// 🔴 ตัดคอมเมนต์ก่อน grep เสมอ (บทเรียน: คอมเมนต์ที่เล่าอดีต = ผลลบปลอม)
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1");

const F = {
  layout: "src/app/app/layout.tsx",
  ui: "src/lib/modules/chat/ui.tsx",
  inboxClient: "src/lib/modules/chat/inbox-client.tsx",
  bubble: "src/lib/modules/chat/bubble.tsx",
  icon: "src/lib/modules/chat/channel-icon.tsx",
  actions: "src/lib/modules/chat/actions.ts",
  service: "src/lib/modules/chat/service.ts",
  sysPage: "src/app/app/sys/[id]/page.tsx",
  chatPage: "src/app/app/sys/[id]/chat/page.tsx",
  channelsPage: "src/app/app/sys/[id]/chat/channels/page.tsx",
  schema: "prisma/schema/chat.prisma",
};
const LAYOUT = strip(read(F.layout));
const UI = strip(read(F.ui));
const INBOX = strip(read(F.inboxClient));
const BUBBLE = strip(read(F.bubble));
const ICON = strip(read(F.icon));
// 🔴 Fable แก้ 31 ส.ค. — เดิมอ่านแค่ `chat/actions.ts` แล้วล็อกโดยบังเอิญว่า action ต้องอยู่ไฟล์เดียว
//    สาย F แยกตัวโหลด/ลองส่งใหม่ไป `chat/inbox-actions.ts` (actions.ts ยาวมากอยู่แล้ว) = การจัดไฟล์ที่สมเหตุผล
//    เจตนาของ IU-5/6/7 คือ **"ปุ่มต้องผูกกับ server action ที่มีจริง ไม่ใช่ปุ่มหลอก"** ไม่ใช่ที่อยู่ของไฟล์
//    ⇒ อ่านทั้ง 2 ไฟล์ · ความเข้มของด่านไม่ลดลงแม้แต่นิดเดียว
const ACTIONS = [strip(read(F.actions)), strip(read("src/lib/modules/chat/inbox-actions.ts"))].join("\n");
const SERVICE = strip(read(F.service));
const SYSPAGE = strip(read(F.sysPage));
const CHATPAGE = strip(read(F.chatPage));
const CHANNELS = strip(read(F.channelsPage));
const SCHEMA = read(F.schema);
// รวมทุกไฟล์ที่ประกอบเป็น "จอกล่องแชท" — ผู้เขียนจะแตกไฟล์ยังไงก็ได้ ขอให้ของอยู่ครบ
const SCREEN = [UI, INBOX, BUBBLE, ICON, SYSPAGE, CHATPAGE].join("\n");

// ── enum ChatChannelType จากสคีมาจริง (ห้ามพิมพ์ลิสต์ในข้อสอบ — ลิสต์พิมพ์มือเพี้ยนเสมอ) ──
const CHANNELS_ENUM = (() => {
  const m = SCHEMA.match(/enum ChatChannelType \{([\s\S]*?)\n\}/);
  if (!m) return [];
  return m[1]!.split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter((l) => /^[A-Z_]+$/.test(l));
})();

// ── map href → ไฟล์ page.tsx จริง (ยกวิธีจาก qc-nav-functions.mts) ──
function pageFileFor(rest: string): string {
  const base = "src/app/app/sys/[id]";
  const clean = rest.replace(/^\//, "");
  const direct = join(ROOT, base, clean, "page.tsx");
  if (existsSync(direct) || !clean) return direct;
  let dir = join(ROOT, base);
  for (const seg of clean.split("/")) {
    const exact = join(dir, seg);
    if (existsSync(exact)) { dir = exact; continue; }
    const dyn = existsSync(dir) ? readdirSync(dir).find((d) => d.startsWith("[") && statSync(join(dir, d)).isDirectory()) : undefined;
    if (!dyn) return direct;
    dir = join(dir, dyn);
  }
  return join(dir, "page.tsx");
}

// ── ดึงลิสต์ href/label ของ CHAT จาก layout.tsx และจาก chatTabs() ──
function hrefsFromBlock(text: string): string[] {
  return [...text.matchAll(/href:\s*(`[^`]*`|\bs\b)/g)].map((m) => (m[1] === "s" ? "" : m[1]!.replace(/^`|`$/g, "").replace("${s}", "").replace("${systemId}", "")));
}
const layoutChatBlock = (() => {
  const i = LAYOUT.indexOf('case "CHAT":');
  if (i < 0) return "";
  const rest = LAYOUT.slice(i);
  const end = rest.search(/\n\s{6}case\s+"|\n\s{6}default:/);
  return end > 0 ? rest.slice(0, end) : rest.slice(0, 600);
})();
const uiTabsBlock = (() => {
  const i = UI.indexOf("export function chatTabs");
  if (i < 0) return "";
  return UI.slice(i, i + 700);
})();

try {
  // ═════════ IU-1 · เมนูกับแท็บพูดตรงกัน + ไม่มี dead link ═════════
  section("IU-1", "IU-1 เมนู ↔ แท็บ ↔ ไฟล์จริง:", () => {
    chk("IU-1.1", "หา case \"CHAT\" ใน childrenFor ของ layout.tsx ได้", layoutChatBlock.length > 0, "พบบล็อก", "ไม่พบ");
    chk("IU-1.2", "หา chatTabs() ใน chat/ui.tsx ได้", uiTabsBlock.length > 0, "พบฟังก์ชัน", "ไม่พบ");
    const menu = hrefsFromBlock(layoutChatBlock);
    const tabs = hrefsFromBlock(uiTabsBlock);
    chk("IU-1.3", "🔴 แท็บในหน้ากับเมนูซ้ายตรงกันเป๊ะ (ลำดับด้วย) — แก้ที่เดียวแล้วอีกที่ค้าง = คนละเมนูสองที่",
      menu.length > 0 && j(menu) === j(tabs), `เมนู ${j(menu)}`, `แท็บ ${j(tabs)}`);
    const dead = menu.filter((h) => !existsSync(pageFileFor(h)));
    chk("IU-1.4", "ทุก href ของระบบแชทมี page.tsx จริง (dead link = 0)",
      menu.length > 0 && dead.length === 0, "0 dead link", j(dead));
    chk("IU-1.5", "จำนวนแท็บเหลือ 2 ตามแผน §6.1 (ภาพรวม=แชท + เชื่อมช่องทาง)",
      tabs.length === 2, "2 แท็บ", `${tabs.length} แท็บ: ${j(tabs)}`, "MAJOR");
  });

  // ═════════ IU-2 · ลิงก์เก่าห้ามตาย (ของจริงที่ส่งออกไปแล้ว) ═════════
  section("IU-2", "IU-2 🔴 ลิงก์เก่า /chat?c=<id> ที่ push ส่งออกไปแล้วห้ามตาย:", () => {
    chk("IU-2.1", "ไฟล์ /app/sys/[id]/chat/page.tsx ยังอยู่ (push + AppNotification ชี้มาที่นี่)",
      CHATPAGE.length > 0, "มีไฟล์", "ไฟล์หายไป — แตะแจ้งเตือนแล้ว 404");
    const notifyUrl = /\/app\/sys\/\$\{systemId\}\/chat\?c=/.test(SERVICE);
    chk("IU-2.2", "🟢 คู่บวก: ยืนยันว่า push/แจ้งเตือนยังใช้รูป `/chat?c=<id>` จริง (ไม่ใช่เดาเอา)",
      notifyUrl, "พบใน service.ts", "ไม่พบ — ถ้ารูป URL เปลี่ยนแล้วให้ปรับข้อสอบ");
    chk("IU-2.3", "หน้า /chat กลายเป็น redirect ไปหน้าเดียวกับภาพรวม (ไม่ใช่หน้าซ้ำสองที่)",
      /redirect\(/.test(CHATPAGE), "มี redirect()", "ยังเป็นหน้าเต็มของตัวเอง");
    chk("IU-2.4", "🔴 redirect ต้องพา `?c=` ไปด้วย — ทิ้งไปเท่ากับแตะแจ้งเตือนแล้วเปิดมาที่รายการเปล่า",
      /redirect\(/.test(CHATPAGE) && /c\s*\?/.test(CHATPAGE) && /\?c=/.test(CHATPAGE),
      "redirect พา c ไปด้วย", "redirect ทิ้ง ?c=");
  });

  // ═════════ IU-3 · หน้าภาพรวม = กล่องแชทเต็มจอ ═════════
  section("IU-3", "IU-3 หน้าภาพรวมระบบแชท = กล่องแชท ไม่ใช่การ์ด 2 ใบ (G1):", () => {
    chk("IU-3.1", "🔴 หน้า /app/sys/<id> ไม่เรียก ChatHub (การ์ด 2 ใบ) อีกแล้ว",
      !/<ChatHub\b/.test(SYSPAGE), "ไม่มี <ChatHub", "ยังเป็นการ์ด 2 ใบ (G1)");
    chk("IU-3.2", "หน้า /app/sys/<id> เรนเดอร์กล่องแชทจริง",
      /<Chat(Inbox|Screen|Box)[A-Za-z]*\b/.test(SYSPAGE), "มีคอมโพเนนต์กล่องแชท", "ไม่พบ");
    chk("IU-3.3", "มีไฟล์ inbox แบบ client (2 คอลัมน์ + สถานะฝั่งผู้ใช้)",
      INBOX.length > 0 && /"use client"/.test(read(F.inboxClient)), "มี inbox-client.tsx + use client", INBOX ? "ไม่ใช่ client component" : "ยังไม่มีไฟล์");
    chk("IU-3.4", "มีไฟล์ฟองข้อความแยก (bubble) ตามแผน §6",
      BUBBLE.length > 0, "มี bubble.tsx", "ยังไม่มีไฟล์", "MAJOR");
  });

  // ═════════ IU-4 · ทะเบียนไอคอนช่องทาง ═════════
  section("IU-4", "IU-4 ไอคอนช่องทาง — ทะเบียนเดียว ครอบทุกค่าใน enum:", () => {
    chk("IU-4.1", "อ่าน enum ChatChannelType จากสคีมาจริงได้", CHANNELS_ENUM.length >= 7, "≥7 ค่า", j(CHANNELS_ENUM));
    chk("IU-4.2", "มีไฟล์ทะเบียนไอคอน src/lib/modules/chat/channel-icon.tsx", ICON.length > 0, "มีไฟล์", "ยังไม่มี (สาย F ยังไม่เขียน)");
    const missing = CHANNELS_ENUM.filter((c) => !new RegExp(`\\b${c}\\b`).test(ICON));
    chk("IU-4.3", "🔴 ทะเบียนครอบทุกค่าใน enum (ขาดค่าไหน = ป้ายว่างบนหน้าจอลูกค้าจริง)",
      ICON.length > 0 && missing.length === 0, "ครบทุกค่า", `ขาด ${j(missing)}`);
    chk("IU-4.4", "APP และ TIKTOK อยู่ใน enum แล้ว (N1 — คำสั่งข้อ 4 ของเจ้าของ)",
      CHANNELS_ENUM.includes("APP") && CHANNELS_ENUM.includes("TIKTOK"), "มีทั้งคู่", j(CHANNELS_ENUM));
    chk("IU-4.5", "ไอคอนเป็น SVG inline ไม่ดึงจาก CDN ภายนอก (โหลดช้า/หายได้/ส่งข้อมูลออกนอก)",
      ICON.length > 0 && /<svg/i.test(ICON) && !/https?:\/\//.test(ICON.replace(/xmlns="[^"]*"/g, "")),
      "มี <svg> + ไม่มี URL ภายนอก", ICON ? "พบ URL ภายนอกหรือไม่มี svg" : "ยังไม่มีไฟล์");
    chk("IU-4.6", "🔴 ไม่มีลิสต์ป้ายช่องทางพิมพ์ซ้ำใน chat/ui.tsx (บทเรียน AS-6.1: ลิสต์ซ้ำเพี้ยนเสมอ)",
      !/const CHANNEL_LABEL\b/.test(UI), "ไม่มี CHANNEL_LABEL ใน ui.tsx", "ยังมีลิสต์พิมพ์มือซ้ำอยู่");
    // 🔴 Fable แก้ 1 ก.ย. — ข้อนี้เคยล็อกว่า "ต้องมี object ชื่อ `CHANNEL_LABEL_TH` อยู่ใน service.ts"
    //    ซึ่ง **คือความซ้ำที่หนี้ H4 สั่งให้ยุบ** ⇒ ทำตาม H4 แล้วข้อสอบจะแดง = คำสั่ง 2 อันขัดกันเอง
    //    เจตนาเดิมไม่เปลี่ยน: **ป้ายไทยเต็มประโยคต้องครบทุกค่าใน enum และมีที่เดียว**
    //    ⇒ ย้ายไปวัดที่ทะเบียนจริง (`CHANNEL_META` ใน channel-icon.tsx) + service.ts ต้องเรียกใช้ ไม่พิมพ์ซ้ำ
    //    บทเรียนซ้ำรอบที่ 4 ของรีโปนี้: **ข้อสอบต้องวัดพฤติกรรม ไม่ใช่ล็อกชื่อตัวแปร/ชื่อไฟล์**
    const metaBlock = ICON.match(/CHANNEL_META[^=]*=\s*\{([\s\S]*?)\n\};/);
    const missingTh = metaBlock
      ? CHANNELS_ENUM.filter((c) => !new RegExp(`\\b${c}\\b[^\\n]*sentence:`).test(metaBlock[1]!))
      : CHANNELS_ENUM;
    chk("IU-4.7", "ป้ายไทยเต็มประโยคครบทุกค่าในทะเบียนเดียว + service.ts เรียกใช้ (ไม่พิมพ์ซ้ำ)",
      metaBlock !== null && missingTh.length === 0
        && !/const CHANNEL_LABEL_TH/.test(SERVICE) && /channelSentenceLabel\(/.test(SERVICE),
      "ครบทุกค่า + ไม่มีลิสต์ซ้ำ",
      metaBlock ? `ขาด ${j(missingTh)} · ยังมีลิสต์ซ้ำ=${/const CHANNEL_LABEL_TH/.test(SERVICE)}` : "ไม่พบ CHANNEL_META");
  });

  // ═════════ IU-5 · ปุ่มในกล่องพิมพ์ต้องมีจริงและผูกกับของจริง ═════════
  section("IU-5", "IU-5 🔴 ปุ่มที่คนต้องกดเอง — มีจริงและผูกกับ action ที่มีจริง:", () => {
    chk("IU-5.1", "ปุ่มแนบไฟล์ (input type=file)", /type=["']file["']/.test(SCREEN), "มี input file", "ไม่มีปุ่มแนบไฟล์");
    chk("IU-5.2", "🔴 ปุ่มถ่ายรูป — ต้องมี capture=\"environment\" (มือถือเปิดกล้องจริง เดสก์ท็อปตกเป็นเลือกไฟล์)",
      /capture=["']environment["']/.test(SCREEN), 'capture="environment"', "ไม่มี — ข้อ 6 ของเจ้าของทำไม่ได้");
    chk("IU-5.3", "รับเฉพาะชนิดไฟล์ที่ระบบอนุญาต (accept) ไม่ใช่เปิดรับทุกอย่างแล้วค่อยเด้ง error",
      /accept=/.test(SCREEN), "มี accept", "ไม่มี", "MAJOR");
    chk("IU-5.4", "แสดงตัวอย่างไฟล์ที่เลือก + ลบออกได้ก่อนส่ง",
      /(ลบไฟล์|เอาออก|removeFile|onRemove)/.test(SCREEN), "มีปุ่มลบไฟล์ที่เลือก", "ไม่พบ", "MAJOR");
    chk("IU-5.5", "🔴 บอกขนาดเกิน 10MB **ก่อน** อัป (ไม่ใช่ให้อัปเสร็จแล้วค่อยเด้ง error)",
      /CHAT_ATTACHMENT_MAX_BYTES|10\s*\*\s*1024\s*\*\s*1024/.test(SCREEN), "ตรวจขนาดฝั่งหน้าจอ", "ไม่พบ");
    chk("IU-5.6", "ปุ่ม ✨ AI แนะนำคำตอบ มีจริง", /(AI แนะนำ|แนะนำคำตอบ|suggestReplyAction)/.test(SCREEN), "มีปุ่ม", "ไม่พบ");
    chk("IU-5.7", "ปุ่ม 🌐 แปลก่อนส่ง มีจริง", /(แปลก่อนส่ง|translateDraftAction)/.test(SCREEN), "มีปุ่ม", "ไม่พบ");
    chk("IU-5.8", "ปุ่มแปลใต้ฟองข้อความขาเข้า (ลูกค้า→ทีม) มีจริง",
      /(แปลข้อความ|ดูคำแปล|translateMessageAction)/.test(SCREEN), "มีปุ่ม", "ไม่พบ");
    chk("IU-5.9", "สลับโหมด 'โน้ตภายใน' มีจริง", /โน้ตภายใน/.test(SCREEN), "มีสวิตช์", "ไม่พบ");
    // 🔴 ปุ่มที่ไม่ผูกกับ action จริง = ปุ่มหลอก (บั๊กชนิดเดียวกับ "รหัสลับที่ไม่เคยแสดง")
    for (const [id, name, re] of [
      ["IU-5.10", "AI แนะนำ", /export async function (suggestReplyAction|aiSuggestAction)/],
      ["IU-5.11", "แปลข้อความ/แปลก่อนส่ง", /export async function translate\w*Action/],
    ] as const) {
      chk(id, `ปุ่ม "${name}" ผูกกับ server action ที่มีจริงใน chat/actions.ts`, re.test(ACTIONS), "มี action", "ไม่มี action — ปุ่มหลอก");
    }
  });

  // ═════════ IU-6 · ความสด (ห้ามถอยหลังจาก G2) ═════════
  section("IU-6", "IU-6 ความสดของหน้าจอ — ห้ามถอยหลังจากของเดิม:", () => {
    chk("IU-6.1", "เลิกใช้ AutoRefresh รีเฟรชทั้งหน้า (G2)",
      !/<AutoRefresh\b/.test(CHATPAGE + SYSPAGE + UI), "ไม่มี <AutoRefresh", "ยังรีเฟรชทั้งหน้าอยู่");
    chk("IU-6.2", "มี server action สำหรับดึงรายการ + เธรด (โหลดเฉพาะส่วนที่เปลี่ยน)",
      /export async function loadInboxAction/.test(ACTIONS) && /export async function loadThreadAction/.test(ACTIONS),
      "มีทั้ง loadInboxAction + loadThreadAction", "ไม่ครบ");
    chk("IU-6.3", "poll ประมาณ 5 วินาที (ของเดิม 7 วิ — ห้ามช้าลง)",
      /\b(5000|5_000)\b/.test(INBOX), "5000ms", "ไม่พบค่า poll 5 วิ", "MAJOR");
    chk("IU-6.4", "🔴 ตัวนับ unread ยังสดตามไปด้วย (ของเดิมได้มาฟรีจาก router.refresh — ตัวใหม่ต้องพามาเอง)",
      /staffUnreadCount/.test(INBOX), "อ่าน staffUnreadCount ในตัว client", "ไม่พบ — ตัวนับจะค้าง");
    chk("IU-6.5", "🔴 ติ๊ก ✓✓ ยังสดตามไปด้วย (ข้อมูลลูกค้าอ่านแล้วต้องถูกดึงมาทุกรอบ poll)",
      /(customerLastReadAt|customerRead|readByCustomer)/.test(INBOX + UI + BUBBLE), "ดึงข้อมูลลูกค้าอ่านแล้ว", "ไม่พบ");
    chk("IU-6.6", "🔴 ห้ามเรียก router.refresh() ในลูป poll — ร่างที่กำลังพิมพ์และไฟล์ที่เลือกไว้จะหาย",
      INBOX.length > 0 && !/router\.refresh\(\)/.test(INBOX), "ไม่มี router.refresh()", INBOX ? "ยังเรียก router.refresh()" : "ยังไม่มีไฟล์");
    chk("IU-6.7", "ร่างข้อความเก็บใน state ของ client (รอด poll)",
      /useState/.test(INBOX) && /(draft|ร่าง|text)/i.test(INBOX), "มี state ของร่าง", "ไม่พบ", "MAJOR");
  });

  // ═════════ IU-7/8 · องค์ประกอบแบบ WhatsApp ═════════
  // ═════════ IU-11 · เส้นทางกดส่ง (บั๊กจริงที่เจ้าของเจอ 1 ก.ย. 2026 พร้อมภาพหน้าจอ) ═════════
  section("IU-11", "IU-11 🔴 กดส่งแล้วต้องบอกความจริง (ไม่ใช่ขึ้นแดงทั้งที่ส่งสำเร็จ):", () => {
    // อาการ: ข้อความส่งสำเร็จและขึ้นในห้องแล้ว แต่จอขึ้น "ส่งข้อความไม่สำเร็จ"
    //        พร้อมเอาข้อความกลับเข้าช่องพิมพ์ ⇒ ผู้ใช้กดซ้ำ = ข้อความซ้ำ
    // เหตุ:  `sendReplyAction` จบด้วย `redirect()` ซึ่ง Next ใช้ "การโยน error" เป็นกลไก
    //        หน้าจอเรียก action ตรง ๆ แล้วครอบ try/catch → catch คว้า error ของ redirect ไปตีความว่าล้ม
    const sendFn = (() => {
      const i = ACTIONS.indexOf("export async function sendReplyAction");
      if (i < 0) return "";
      const j = ACTIONS.indexOf("\nexport ", i + 10);
      return ACTIONS.slice(i, j < 0 ? undefined : j);
    })();
    chk("IU-11.1", "หา sendReplyAction เจอ (คู่บวกของข้อถัดไป)", sendFn.length > 100, "เจอฟังก์ชัน", `ยาว ${sendFn.length}`);
    chk("IU-11.2", "🔴 sendReplyAction ต้อง **ไม่** redirect (Next ใช้การโยน error เป็นกลไก → ฝั่งจอตีความว่าล้ม)",
      !/\bredirect\s*\(/.test(sendFn), "ไม่มี redirect(", "พบ redirect( ในเส้นทางส่ง");
    chk("IU-11.3", "sendReplyAction คืนผลลัพธ์ให้จอตัดสินเอง (ok/reason)",
      /Promise<\s*SendReplyResult|:\s*Promise<\{[^}]*ok/.test(sendFn) || /return \{ ok:/.test(sendFn), "คืน { ok, reason }", "ไม่คืนผลลัพธ์");
    chk("IU-11.4", "จอตัดสินจาก **ค่าที่ได้กลับมา** ไม่ใช่เดาจาก exception อย่างเดียว",
      /await sendReplyAction\(/.test(INBOX) && /res\.ok|\.ok\b/.test(INBOX), "อ่านค่าที่คืนมา", "ไม่พบการอ่านผลลัพธ์");
    chk("IU-11.5", "🕐 มีฟองสถานะ 'กำลังส่ง' ระหว่างรอ (เจ้าของสั่ง: ต้องเห็นว่ากำลังส่งอยู่)",
      /PENDING/.test(INBOX) && /(pendingMsgs|กำลังส่ง)/.test(INBOX), "มีฟองกำลังส่ง", "ไม่มีสถานะกำลังส่ง");
    chk("IU-11.6", "🕐 ถูกวาดจริงใน bubble เมื่อ deliveryStatus = PENDING",
      /PENDING/.test(BUBBLE) && /🕐|clock|Clock/.test(BUBBLE), "bubble วาด 🕐", "bubble ไม่มีสัญลักษณ์กำลังส่ง");
  });

  section("IU-7", "IU-7 องค์ประกอบหน้าตาแบบ WhatsApp (มติ W1):", () => {
    chk("IU-7.1", "ติ๊กสถานะส่ง ✓ / ✓✓ / ✗", /✓✓|✓{2}|CheckCheck|DoubleCheck/.test(SCREEN) && /✗|✕|Failed/.test(SCREEN), "มีทั้งชุด", "ไม่ครบ");
    // 🔴 ต้องผูกกับ action จริง — ของเดิมมีสตริง "ลองใหม่อีกครั้ง" เป็น **ข้อความ error** ไม่ใช่ปุ่ม
    //    ถ้าจับแค่คำ จะได้เขียวหลอกทันที (grep แยกปุ่มกับข้อความไม่ออก)
    chk("IU-7.2", "ส่งไม่สำเร็จมีปุ่มลองใหม่ที่ผูกกับ action จริง (ไม่ใช่แค่ข้อความ error ที่มีคำว่า 'ลองใหม่')",
      /export async function (retry|resend)\w*Action/.test(ACTIONS) && /(ลองใหม่|ส่งอีกครั้ง)/.test(SCREEN),
      "มีทั้ง action และปุ่ม", `action=${/export async function (retry|resend)\w*Action/.test(ACTIONS)} · ปุ่ม=${/(ลองใหม่|ส่งอีกครั้ง)/.test(SCREEN)}`);
    chk("IU-7.3", "ตัวคั่นวันที่ (วันนี้ / เมื่อวาน)", /วันนี้/.test(SCREEN) && /เมื่อวาน/.test(SCREEN), "มีทั้งคู่", "ไม่ครบ");
    chk("IU-7.4", "badge ช่องทางบน avatar ในรายการซ้าย (คำสั่งข้อ 4)",
      /(ChannelIcon|ChannelBadge|channelIcon)/.test(SCREEN), "มีคอมโพเนนต์ไอคอนช่องทาง", "ไม่พบ");
    const tabs = ["ทั้งหมด", "ยังไม่อ่าน", "ของฉัน", "ปิดแล้ว"];
    // 🔴 ต้องอยู่ใน **ตัวกล่องแชทฝั่ง client** ไม่ใช่กระจายอยู่ที่ไหนก็ได้ในไฟล์ —
    //    ของเดิมมีคำเหล่านี้อยู่แล้วคนละที่ (ป้ายสถานะ/ข้อความอธิบาย) = เขียวหลอกถ้าจับทั้งหน้าจอ
    const missTabs = tabs.filter((t) => !INBOX.includes(t));
    chk("IU-7.5", "แท็บกรอง 4 แบบในตัวกล่องแชท: ทั้งหมด · ยังไม่อ่าน · ของฉัน · ปิดแล้ว",
      INBOX.length > 0 && missTabs.length === 0, "ครบ 4 ใน inbox-client",
      INBOX ? `ขาด ${j(missTabs)}` : "ยังไม่มี inbox-client.tsx", "MAJOR");
    chk("IU-7.6", "ช่องค้นหาในรายการซ้าย", /(ค้นหา|placeholder=["'][^"']*ค้น)/.test(SCREEN), "มีช่องค้นหา", "ไม่พบ", "MAJOR");
    chk("IU-7.7", "🔴 ไม่มีวันที่/ปีฮาร์ดโค้ดในไฟล์หน้าจอ (โค้ดที่ผูกวันที่ตายตัวเน่าตามเวลา)",
      !/\b20\d{2}-\d{2}-\d{2}\b/.test([INBOX, BUBBLE, ICON].join("\n")), "ไม่มีวันที่ตายตัว",
      j(([INBOX, BUBBLE, ICON].join("\n").match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? []).slice(0, 5)));
  });

  // ═════════ IU-9 · ความซื่อสัตย์ของหน้า "เชื่อมช่องทาง" ═════════
  section("IU-9", "IU-9 ⚠️ ไอคอนมี ≠ ช่องทางใช้ได้:", () => {
    chk("IU-9.1", "🔴 หน้า 'เชื่อมช่องทาง' บอกชัดว่าช่องทางที่ยังไม่มี adapter คือ 'ยังไม่เปิด'",
      /(ยังไม่เปิด|ยังไม่พร้อม|เร็ว ๆ นี้|COMING)/i.test(CHANNELS + UI), "มีป้ายบอกสถานะ",
      "ไม่มี — เจ้าของจะเข้าใจว่าเชื่อม WhatsApp/IG/TikTok ได้แล้ว");
    chk("IU-9.2", "ป้ายสถานะมาจาก registry ของ adapter จริง (isSupported) ไม่ใช่ลิสต์พิมพ์มือ",
      /isSupported/.test(CHANNELS + UI), "อ้าง isSupported", "พิมพ์ลิสต์มือ", "MAJOR");
  });

  // ═════════ IU-10 · เมนูซ่อนเมื่อไม่มีสิทธิ์ (คู่กับด่านจริงใน qc-chat-staff-perms) ═════════
  section("IU-10", "IU-10 เมนูแชทซ่อนเมื่อไม่มีสิทธิ์ (UI คือความสะดวก ด่านจริงอยู่ที่ action):", () => {
    chk("IU-10.1", "layout.tsx กรองเมนูตามสิทธิ์ (ไม่ใช่โชว์ทุกระบบให้ทุกคน)",
      /(evaluate\(|assertCan\(|can\(|permissions)/.test(LAYOUT), "มีการดูสิทธิ์ตอนประกอบเมนู",
      "เมนูโชว์ทุกระบบให้ทุกคน");
    chk("IU-10.2", "🔴 แต่ต้องไม่พึ่งการซ่อนเมนูอย่างเดียว — ด่านจริงต้องอยู่ที่หน้า/action ด้วย (ดู qc-chat-staff-perms SP-3)",
      /(assertCan|assertChatCan|canReadChat)/.test(CHATPAGE + SYSPAGE + UI), "มีด่านที่หน้า", "ไม่มีด่านที่หน้าเลย");
  });
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT INBOX UI =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
