// QC — WO-CV8: ข้อความเสียง (อัด → อัป → เล่นกลับ → ลูกค้าได้ยิน) · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ตรวจแล้ว 1 ก.ย. 2026 ไม่มีชื่อนี้ในรีโป
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
// ⚠️ **ห้ามแตะ DB จริง** → ทับ `DATABASE_URL` ก่อน import โค้ดแอป
// ⚠️ contract-first: ของทั้งหมดยังไม่มี (สาย H รอบ 4) → ต้องแดงอย่างถูกต้อง ห้าม skip เงียบ
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-V2 §3 WO-CV8) ═══════
// VO-1) สคีมา: `ChatMessageType.AUDIO` + `ChatAttachment.durationMs`
// VO-2) 🔴 ที่เก็บไฟล์ยอมรับชนิดเสียงจริง **พร้อมนามสกุลที่ถูก** — ถ้าเพิ่ม mime แต่ลืมนามสกุล
//       ไฟล์จะถูกเสิร์ฟเป็น octet-stream แล้วกดฟังไม่ได้ (กลายเป็นดาวน์โหลด)
// VO-3) adapter ทุกตัวประกาศได้ว่าส่งเสียงได้ไหม (`capabilities`) — ไม่ใช่ให้หน้าจอเดาเอง
// VO-4) 🔴 **ช่องทางที่ไม่รองรับต้องกันก่อนกดส่ง** ไม่ใช่ปล่อยให้ FAILED ทีหลัง
//       (เสียงที่อัดแล้วส่งไม่ออก = ของที่หายไปเฉย ๆ · ทีมไม่รู้ว่าลูกค้าไม่ได้ยิน)
//       วัด 2 ชั้น: (ก) หน้าจอซ่อน/ปิดปุ่มไมค์ตาม capability · (ข) ฝั่งเซิร์ฟเวอร์ปฏิเสธ **ก่อน**
//       สร้างแถวข้อความ (ไม่ใช่สร้างแล้วค่อยมาร์ก FAILED)
// VO-5) อัดด้วย `MediaRecorder` + มีทางลงให้เบราว์เซอร์ที่ไม่รองรับ webm (Safari = audio/mp4)
// VO-6) อัปผ่าน **เส้นทางไฟล์แนบเดิม** (ไม่สร้างที่เก็บใหม่ซ้อน) และมีเพดานความยาว
// VO-7) 🔴 **ลูกค้าต้องฟังได้** — ทางออกสาธารณะ (`PublicMsg`/API v1) ต้องพา url + ความยาวไปด้วย
//       ไม่งั้นทีมส่งเสียงไปแล้วลูกค้าไม่มีทางเล่น = ของที่ส่งแล้วหาย
// VO-8) ความยาวคลิปถูกบันทึกจริงและถูกตรวจ (เลขติดลบ/ยาวเกินเพดานต้องไม่ผ่าน)
// VO-9) PDPA: ไฟล์เสียงถูกกวาดตาม `retentionDays` เหมือนเนื้อความอื่น
//       🔴 เสียงคือเนื้อความอีกรูปหนึ่ง — ปกปิดข้อความแล้วแต่คลิปเสียงยังฟังได้ = ยังไม่ได้ปกปิด

try { process.loadEnvFile(".env"); } catch {}
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
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1");
function walk(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return /\.tsx?$/.test(abs) ? [rel] : [];
  const out: string[] = [];
  for (const e of readdirSync(abs)) out.push(...walk(join(rel, e)));
  return out;
}

const FILES = [...walk("src/lib/modules/chat"), ...walk("src/app/app/sys/[id]/chat"), ...walk("src/app/api/v1/chat"), ...walk("src/app/api/chat")];
const SCREEN = FILES.filter((f) => f.endsWith(".tsx")).map((f) => strip(read(f))).join("\n");
const SERVER = FILES.filter((f) => f.endsWith(".ts")).map((f) => strip(read(f))).join("\n");
const SCHEMA = read("prisma/schema/chat.prisma");
const RETENTION = strip(read("src/lib/modules/chat/retention.ts"));
const SERVICE = strip(read("src/lib/modules/chat/service.ts"));

const storage = (await import("@/lib/storage/service" as string).catch(() => null)) as
  | { ALLOWED_UPLOAD_TYPES?: Record<string, string>; CHAT_ATTACHMENT_MAX_BYTES?: number }
  | null;
const adapters = (await import("@/lib/modules/chat/adapter" as string).catch(() => null)) as
  | { getAdapter?: (t: string) => { capabilities: Record<string, unknown> }; isSupported?: (t: string) => boolean }
  | null;

try {
  await section("VO-0", "VO-0 คู่บวก — สภาพตั้งต้น:", () => {
    chk("VO-0.1", "🟢 import ทะเบียนที่เก็บไฟล์ได้", storage?.ALLOWED_UPLOAD_TYPES !== undefined, "ได้", "import ไม่ผ่าน");
    chk("VO-0.2", "🟢 import ทะเบียน adapter ได้", typeof adapters?.getAdapter === "function", "ได้", "import ไม่ผ่าน");
    chk("VO-0.3", "🟢 อ่านซอร์สหน้าจอแชทได้", SCREEN.length > 5000, "≥5000", `${SCREEN.length}`);
  });

  // ═════════ VO-1 · สคีมา ═════════
  await section("VO-1", "VO-1 สคีมารองรับข้อความเสียง:", () => {
    const typeEnum = SCHEMA.match(/enum ChatMessageType \{([\s\S]*?)\n\}/)?.[1] ?? "";
    chk("VO-1.1", "enum ChatMessageType มีค่า AUDIO", /\bAUDIO\b/.test(typeEnum), "มี AUDIO", "ยังไม่มี");
    const att = SCHEMA.match(/model ChatAttachment \{([\s\S]*?)\n\}/)?.[1] ?? "";
    chk("VO-1.2", "ChatAttachment มี durationMs (แสดง 0:12 ได้โดยไม่ต้องโหลดไฟล์)",
      /durationMs\s+Int\?/.test(att), "มี durationMs Int?", "ยังไม่มี");
  });

  // ═════════ VO-2 · ชนิดไฟล์ ═════════
  await section("VO-2", "VO-2 ที่เก็บไฟล์ยอมรับเสียงพร้อมนามสกุลที่ถูก:", () => {
    const types = storage?.ALLOWED_UPLOAD_TYPES ?? {};
    const audio = Object.entries(types).filter(([mime]) => mime.startsWith("audio/"));
    chk("VO-2.1", "🔴 allowlist มีชนิดเสียงอย่างน้อย 1 ชนิด (ไม่งั้นอัปโหลดถูกปฏิเสธตั้งแต่ต้นทาง)",
      audio.length > 0, "≥1 ชนิด audio/*", `มีแต่ ${j(Object.keys(types).slice(0, 12))}`);
    chk("VO-2.2", "รองรับชนิดที่เบราว์เซอร์อัดออกมาจริง (webm ของ Chrome/Android · mp4/m4a ของ Safari/iOS)",
      audio.some(([m]) => /webm/.test(m)) && audio.some(([m]) => /(mp4|m4a|aac|mpeg)/.test(m)),
      "มีทั้งฝั่ง Chrome และ Safari", j(audio.map(([m]) => m)));
    chk("VO-2.3", "🔴 ทุกชนิดเสียงมีนามสกุลจริง ไม่ตกเป็น bin (ไม่งั้น CDN เสิร์ฟเป็นดาวน์โหลด กดฟังไม่ได้)",
      audio.length > 0 && audio.every(([, ext]) => !!ext && ext !== "bin"), "ทุกชนิดมี ext",
      j(audio.filter(([, e]) => !e || e === "bin")));
  });

  // ═════════ VO-3/4 · ความสามารถของช่องทาง + กันก่อนส่ง ═════════
  await section("VO-3", "VO-3/4 ช่องทางที่ส่งเสียงไม่ได้ ต้องกัน **ก่อน** กดส่ง:", () => {
    const cap = (t: string): Record<string, unknown> | null => {
      try { return adapters?.getAdapter?.(t)?.capabilities ?? null; } catch { return null; }
    };
    const web = cap("WEBCHAT");
    const line = cap("LINE");
    const AUDIO_KEYS = ["sendAudio", "audio", "sendVoice", "voice"];
    const hasFlag = (c: Record<string, unknown> | null) => !!c && AUDIO_KEYS.some((k) => typeof c[k] === "boolean");
    chk("VO-3.1", `🔴 adapter ประกาศความสามารถเรื่องเสียง (รับชื่อ ${j(AUDIO_KEYS)})`,
      hasFlag(web) && hasFlag(line), "ทุก adapter ที่เปิดใช้ประกาศครบ",
      `WEBCHAT=${j(web)} · LINE=${j(line)}`);
    chk("VO-3.2", "🟢 คู่บวก: ธงเดิม (sendImage) ยังอยู่ — ไม่ได้ทำของเดิมหายตอนเพิ่มของใหม่",
      typeof web?.sendImage === "boolean", "มี sendImage", j(web));
    // (ก) ฝั่งหน้าจอ
    chk("VO-4.1", "หน้าจออ่านความสามารถของช่องทางก่อนโชว์ปุ่มไมค์",
      /(sendAudio|sendVoice|canSendAudio|capabilities)/.test(SCREEN), "หน้าจอรู้ว่าช่องทางนี้ส่งเสียงได้ไหม",
      "ไม่รู้ — ทีมจะกดอัดแล้วส่งไม่ออก");
    chk("VO-4.2", "มีข้อความไทยบอกเหตุผลตอนช่องทางไม่รองรับ (ห้ามเงียบ · ห้ามโทษผู้ใช้)",
      /(ช่องทางนี้ยังส่งข้อความเสียงไม่ได้|ไม่รองรับข้อความเสียง|ส่งเสียงไม่ได้)/.test(SCREEN + SERVER),
      "มีข้อความอธิบาย", "ไม่มี");
    // (ข) ฝั่งเซิร์ฟเวอร์ — ต้องปฏิเสธก่อนสร้างแถว ไม่ใช่สร้างแล้วมาร์ก FAILED
    const sendPath = SERVICE.slice(SERVICE.indexOf("sendReply"));
    const iCap = sendPath.search(/sendAudio|sendVoice|capabilities/);
    const iCreate = sendPath.search(/chatMessage\.create/);
    chk("VO-4.3", "🔴 ฝั่งเซิร์ฟเวอร์ตรวจความสามารถ **ก่อน** สร้างแถวข้อความ (ไม่ใช่สร้างแล้วมาร์ก FAILED)",
      iCap >= 0 && iCreate >= 0 && iCap < iCreate, "ตรวจก่อน create",
      iCap < 0 ? "ไม่มีการตรวจความสามารถในเส้นทางส่ง" : `ตรวจที่ ${iCap} · create ที่ ${iCreate}`);
  });

  // ═════════ VO-10 · ชนิดไฟล์ต้อง "เล่นได้ทุกเครื่อง" (เพิ่ม 2 ก.ย. — เจ้าของเทสจริงแล้วเจอ iOS เล่น webm ไม่ได้) ═════════
  await section("VO-10", "VO-10 ชนิดไฟล์เล่นได้ทุกเครื่อง (D29):", () => {
    const V10_STORAGE = strip(read("src/lib/storage/service.ts"));
    const ci = SCREEN.indexOf("CANDIDATE_TYPES");
    const cand = ci >= 0 ? SCREEN.slice(ci, ci + 400) : "";
    // 🔁 แก้รอบสอง 2 ก.ย.: m4a จาก MediaRecorder ของ Chrome เป็น fragmented MP4 ⇒ iOS เปิดไฟล์ตรง ๆ ไม่ได้
    //    ⇒ สัญญาใหม่: **WAV ผ่าน Web Audio เป็นเส้นทางเดียว** (candidates ว่าง = MediaRecorder ไม่ถูกใช้ผลิตไฟล์)
    chk("VO-10.1", "🔴 ตัวอัดผลิตเฉพาะชนิดที่เล่นได้ทุกเครื่องแน่นอน — WAV เส้นทางเดียว (candidates ว่าง)",
      /CANDIDATE_TYPES = \[\] as const/.test(SCREEN) && /startWav\(stream\)/.test(SCREEN),
      "CANDIDATE_TYPES ว่าง + startWav", cand.slice(0, 120));
    chk("VO-10.2", "🔴 มีทางลง WAV (Web Audio) สำหรับเบราว์เซอร์ที่อัด m4a ไม่ได้ (Firefox) — ห้ามผลิต webm อีก",
      /encodeWav/.test(SCREEN) && /audio\/wav/.test(SCREEN), "encodeWav + audio/wav", "ไม่พบ");
    chk("VO-10.3", "storage รับ audio/wav พร้อมนามสกุล", /"audio\/wav":\s*"wav"/.test(V10_STORAGE), "มี", "ไม่พบ");
    chk("VO-10.4", "🔴 ฟองเสียงตรวจ canPlayType — ไฟล์เก่าที่เครื่องเล่นไม่ได้ต้องได้ลิงก์เปิด/ดาวน์โหลด ไม่ใช่ปุ่มเงียบ",
      /canPlayType/.test(SCREEN), "มี fallback", "ปุ่มโกหก");
    chk("VO-10.5", "🔴 ดัก error ตอนเล่นจริงด้วย (ไฟล์ชนิดถูกแต่โครงผิด canPlayType จับไม่ได้ — fMP4)",
      /onError=/.test(SCREEN) && /\.catch\(/.test(SCREEN), "onError + play().catch สลับเป็นลิงก์", "ไม่พบ");
  });

  // ═════════ VO-5/6/8 · การอัดและอัป ═════════
  await section("VO-5", "VO-5/6/8 การอัดและการอัปโหลด:", () => {
    chk("VO-5.1", "อัดด้วย MediaRecorder ในคอมโพเนนต์ฝั่งเบราว์เซอร์", /MediaRecorder/.test(SCREEN), "มี", "ไม่พบ");
    chk("VO-5.2", "🔴 มีทางลงเมื่อเบราว์เซอร์ไม่รองรับ webm (Safari/iOS อัดได้แค่ mp4 — ครึ่งหนึ่งของลูกค้าไทย)",
      /isTypeSupported/.test(SCREEN) || (/audio\/webm/.test(SCREEN) && /audio\/(mp4|aac)/.test(SCREEN)),
      "เลือกชนิดตามที่เบราว์เซอร์รองรับ", "ล็อก webm อย่างเดียว — iPhone อัดไม่ได้");
    chk("VO-5.3", "ขอสิทธิ์ไมโครโฟนตอนผู้ใช้กดเอง (ไม่ใช่ขอทันทีที่เปิดหน้า)",
      /getUserMedia/.test(SCREEN), "ผ่าน getUserMedia ตอนกด", "ไม่พบ", "MAJOR");
    chk("VO-6.1", "อัปผ่านเส้นทางไฟล์แนบเดิม (ไม่สร้างที่เก็บใหม่ซ้อน)",
      /(uploadFile|CHAT_ATTACHMENT_MAX_BYTES)/.test(SERVER), "ใช้เส้นทางเดิม", "ไม่พบ");
    chk("VO-8.1", "ความยาวคลิปถูกส่งขึ้นและบันทึกลง durationMs",
      /durationMs/.test(SERVER), "บันทึกจริง", "ไม่บันทึก — ฟองเสียงจะไม่รู้ความยาว");
    chk("VO-8.2", "🔴 ตรวจความยาวที่รับมา (ค่าติดลบ/เกินเพดานต้องไม่ผ่าน — ค่ามาจากเบราว์เซอร์ = ปลอมได้)",
      /durationMs/.test(SERVER) && /(Math\.min|Math\.max|MAX_VOICE|> *\d{4,}|<= *0)/.test(SERVER),
      "มีการจำกัดค่า", "รับค่าดิบจากเบราว์เซอร์ตรง ๆ", "MAJOR");
  });

  // ═════════ VO-7 · ลูกค้าต้องฟังได้ ═════════
  await section("VO-7", "VO-7 🔴 ลูกค้าต้องฟังได้จริง (ไม่งั้นของที่ส่งแล้วหาย):", () => {
    const pubAtt = SERVICE.match(/export type PublicAttachment = \{([\s\S]*?)\};/)?.[1] ?? "";
    chk("VO-7.1", "🟢 คู่บวก: หา PublicAttachment (รูปข้อมูลที่ส่งให้ลูกค้า) เจอ", pubAtt.length > 20, "เจอ", "ไม่เจอ — สัญญาเปลี่ยน");
    chk("VO-7.2", "ทางออกสาธารณะพาความยาวคลิปไปด้วย (ไม่งั้นฝั่งลูกค้าวาดฟองเสียงไม่ได้)",
      /durationMs/.test(pubAtt), "มี durationMs", "ไม่มี — ลูกค้าได้แค่ลิงก์ไฟล์เปล่า");
    chk("VO-7.3", "ตัวแปลงข้อความสาธารณะส่งค่านั้นออกไปจริง (ไม่ใช่ประกาศ type ไว้เฉย ๆ)",
      /duration/.test(SERVICE.slice(SERVICE.indexOf("function toPublicMsg"), SERVICE.indexOf("function toPublicMsg") + 900)),
      "toPublicMsg ส่ง duration", "ประกาศแล้วแต่ไม่ได้ส่ง");
    chk("VO-7.4", "ข้อความชนิด AUDIO ไม่ถูกกรองทิ้งจากทางออกสาธารณะ (ตัวกรองที่มีต้องเป็นเรื่องโน้ตภายในเท่านั้น)",
      !/type\s*:\s*\{\s*in\s*:\s*\[/.test(SERVICE) || /AUDIO/.test(SERVICE), "ไม่มีรายชื่อชนิดที่กรอง AUDIO ทิ้ง",
      "พบตัวกรองชนิดข้อความที่อาจตัด AUDIO ทิ้ง", "MAJOR");
  });

  // ═════════ VO-9 · PDPA ═════════
  await section("VO-9", "VO-9 PDPA — เสียงคือเนื้อความอีกรูปหนึ่ง:", () => {
    chk("VO-9.1", "🔴 การกวาดตามอายุข้อมูลจัดการไฟล์แนบด้วย (ไม่ใช่ล้างแต่ตัวหนังสือ)",
      /chatAttachment|attachments/i.test(RETENTION), "retention แตะไฟล์แนบ",
      "ล้างแต่ body — คลิปเสียงยังฟังได้หลังปกปิดข้อความแล้ว");
    chk("VO-9.2", "ไม่มีวันที่/ปีฮาร์ดโค้ดในโค้ดเสียง",
      !/\b20\d{2}-\d{2}-\d{2}\b/.test(SCREEN), "ไม่มี", j((SCREEN.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? []).slice(0, 3)));
  });
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT V2 VOICE =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
