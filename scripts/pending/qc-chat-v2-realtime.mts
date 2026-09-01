// QC — WO-CV9: ชั้น realtime (มติ V4 "ใช้บริการสำเร็จรูป") · Fable oracle, Builder ห้ามแตะ
//
// ⚠️ `ls scripts/qc-*.mts` ก่อนตั้งชื่อเสมอ — ตรวจแล้ว 1 ก.ย. 2026 ไม่มีชื่อนี้ในรีโป
//    qc-all.mts ค้น `qc-*.mts` อัตโนมัติ ⇒ ไฟล์ใหม่ = เป็นด่าน CI ทันที
// ⚠️ **ห้ามแตะ DB/เน็ตจริง** → ทับ `DATABASE_URL` + ดัก `globalThis.fetch` ก่อนเรียกอะไรทั้งสิ้น
// ⚠️ contract-first: `src/lib/realtime/` ยังไม่มี (สาย G รอบ 4) → ต้องแดงอย่างถูกต้อง ห้าม skip เงียบ
//
// ═══════ สัญญาที่คุม (PLAN-CHAT-V2 §3 WO-CV9 · มติ V4) ═══════
// RT-1) มีชั้นกลาง `src/lib/realtime/` — interface เดียว + adapter ของผู้ให้บริการ + ตกกลับ polling
// RT-2) 🔴 **ไม่มีกุญแจ = ยังใช้งานได้** — โหมดต้องเป็น polling · `publish()` ต้องไม่ throw และไม่ยิงเน็ต
//       คู่บวก: ใส่กุญแจแล้วต้อง **ยิงจริง** (พิสูจน์ว่าที่ไม่ยิงตอนไม่มีกุญแจ ไม่ใช่เพราะโค้ดตาย)
// RT-3) 🔴 **ห้ามส่งเนื้อความลูกค้าออกไปยังผู้ให้บริการภายนอก** — ส่งได้แค่สัญญาณ "มีของใหม่"
//       (PDPA + ลดความเสี่ยงข้อมูลรั่ว · เนื้อความดึงจากเซิร์ฟเวอร์เราเองเสมอ)
//       วัดแบบ **กันพลาดที่ขอบ**: ต่อให้ผู้เรียกเผลอยัดเนื้อความมาในพารามิเตอร์
//       สิ่งที่ออกไปทางเน็ตต้องไม่มีข้อความนั้นอยู่ดี
// RT-4) SECRET ของผู้ให้บริการห้ามหลุดถึงเบราว์เซอร์ (ห้ามอยู่ในไฟล์ "use client" · ห้ามชื่อ NEXT_PUBLIC_*SECRET)
// RT-5) 🔴 realtime **ห้ามเป็นเงื่อนไขของความถูกต้อง** — รอบ poll เดิมต้องไม่ถูกปิดเมื่อ realtime ทำงาน
//       (ต่อไม่ติด/โควตาหมดกลางวัน แล้วทีมไม่เห็นข้อความใหม่เลย = พังเงียบ)
// RT-6) "กำลังพิมพ์" ต้องหมดอายุเอง (ค่า TTL สั้น ๆ) — ไม่งั้นค้างเป็นสามจุดตลอดกาลเมื่อคนปิดแท็บ
// RT-7) ผู้ให้บริการล่ม/โควตาหมด = `publish()` ต้องกลืน error (ห้ามทำให้การส่งข้อความล้ม)
//
// ═══════ สัญญาเชิงชื่อ (จำเป็น เพราะต้องเรียกของจริงถึงจะวัดพฤติกรรมได้) ═══════
//   โมดูล: `@/lib/realtime` (หรือ `@/lib/realtime/index`)
//   · โหมด:   `realtimeMode()` | `mode()` | `isRealtimeEnabled()` → คืน "polling"/"realtime" หรือ boolean
//   · ส่งสัญญาณ: `publish(channel: string, event: string, payload: Record<string, unknown>): Promise<void>`
//     (รับชื่อ publish / publishRealtime / notifyRealtime / emit)
//   🔴 **ต้องตัดสินโหมดตอนถูกเรียก ไม่ใช่ตอน import** — บน Vercel ตัวแปรถูกฉีดตอนรัน
//      และการตกกลับ polling ต้องสลับได้โดยไม่ต้อง redeploy · ถ้าอ่าน env ตอน import
//      จะทดสอบ "ไม่มีกุญแจ" กับ "มีกุญแจ" ในโปรเซสเดียวไม่ได้เลย
//   ถ้าสายงานเลือกชื่ออื่น ให้แจ้ง Fable เพิ่มลงลิสต์ — ห้ามแก้ข้อสอบเอง

try { process.loadEnvFile(".env"); } catch {}
process.env.DATABASE_URL = "postgresql://qc:qc@127.0.0.1:1/qc-no-db";

const { readFileSync, existsSync, readdirSync, statSync } = await import("node:fs");
const { join, resolve } = await import("node:path");

const ROOT = resolve(import.meta.dirname, "..");

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

const RT_FILES = walk("src/lib/realtime");
const RT_SRC = RT_FILES.map((f) => strip(read(f))).join("\n");
const CHAT_FILES = [...walk("src/lib/modules/chat"), ...walk("src/app/app/sys/[id]/chat")];
const SCREEN = CHAT_FILES.filter((f) => f.endsWith(".tsx")).map((f) => strip(read(f))).join("\n");
const SERVER = CHAT_FILES.filter((f) => f.endsWith(".ts")).map((f) => strip(read(f))).join("\n");

// ── ดัก fetch ก่อนแตะโมดูลใด ๆ (ห้ามยิงเน็ตจริงเด็ดขาด) ──
type Call = { url: string; body: string; headers: string };
const calls: Call[] = [];
let fetchMode: "ok" | "boom" = "ok";
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: unknown, init?: { body?: unknown; headers?: unknown }) => {
  calls.push({
    url: String(typeof input === "object" && input && "url" in input ? (input as { url: string }).url : input),
    body: typeof init?.body === "string" ? init.body : j(init?.body ?? ""),
    headers: j(init?.headers ?? ""),
  });
  if (fetchMode === "boom") throw new Error("[qc] ผู้ให้บริการล่ม");
  return { ok: true, status: 200, text: async () => "{}", json: async () => ({}) } as unknown as Response;
}) as typeof globalThis.fetch;

// ชื่อ env ที่โมดูลอ่านจริง — อ่านจากซอร์ส ไม่ใช่เดาชื่อผู้ให้บริการ (จะได้ไม่ล็อกว่าต้อง Pusher หรือ Ably)
const ENV_NAMES = [...new Set([...RT_SRC.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]!))];
const clearEnv = () => { for (const k of ENV_NAMES) delete process.env[k]; };
const fillEnv = () => { for (const k of ENV_NAMES) process.env[k] = /SECRET|KEY|ID|TOKEN/.test(k) ? "qc-fake-value" : "qc-cluster"; };

const mod = ((await import("@/lib/realtime" as string).catch(() => null))
  ?? (await import("@/lib/realtime/index" as string).catch(() => null))) as Record<string, unknown> | null;
const pick = (names: string[]) => {
  for (const n of names) if (mod && typeof mod[n] === "function") return mod[n] as (...a: unknown[]) => unknown;
  return null;
};
const modeFn = pick(["realtimeMode", "mode", "isRealtimeEnabled", "realtimeEnabled"]);
const publishFn = pick(["publish", "publishRealtime", "notifyRealtime", "emit"]);
const isOn = (v: unknown) => v === true || v === "realtime" || v === "on";
const isOff = (v: unknown) => v === false || v === "polling" || v === "off" || v === null || v === undefined;

const SECRET = "ข้อความลับของลูกค้า-QCV11";

try {
  await section("RT-1", "RT-1 ชั้นกลาง realtime:", () => {
    chk("RT-1.1", "มีโฟลเดอร์ src/lib/realtime/ พร้อมไฟล์จริง", RT_FILES.length > 0, "≥1 ไฟล์", "ยังไม่มี");
    chk("RT-1.2", "import โมดูลได้ (`@/lib/realtime`)", mod !== null, "import ผ่าน", "ไม่พบโมดูล");
    chk("RT-1.3", "มี adapter ของผู้ให้บริการแยกจาก interface (เปลี่ยนเจ้าได้โดยไม่แตะ callsite)",
      RT_FILES.length >= 2, "≥2 ไฟล์ (interface + adapter)", `${RT_FILES.length} ไฟล์`, "MAJOR");
    chk("RT-1.4", `🟢 คู่บวก: อ่านชื่อ env ที่โมดูลใช้ได้จากซอร์ส (ไม่ล็อกว่าต้องเป็นเจ้าไหน)`,
      ENV_NAMES.length > 0, "≥1 ชื่อ", j(ENV_NAMES));
    chk("RT-1.5", `พบตัวบอกโหมด (รับชื่อ realtimeMode/mode/isRealtimeEnabled)`,
      modeFn !== null, "เจอ", mod ? `export ที่มี: ${j(Object.keys(mod))}` : "ยังไม่มีโมดูล");
    chk("RT-1.6", `พบตัวส่งสัญญาณ (รับชื่อ publish/publishRealtime/notifyRealtime/emit)`,
      publishFn !== null, "เจอ", mod ? `export ที่มี: ${j(Object.keys(mod))}` : "ยังไม่มีโมดูล");
  });

  // ═════════ RT-2 · ไม่มีกุญแจ = ยังใช้งานได้ ═════════
  await section("RT-2", "RT-2 🔴 ไม่มีกุญแจ = ยังใช้งานได้ (ตกกลับ polling):", async () => {
    clearEnv();
    calls.length = 0;
    chk("RT-2.1", "ไม่มีกุญแจ → โหมดเป็น polling",
      modeFn !== null && isOff(modeFn()), "polling/false", modeFn ? j(modeFn()) : "ยังไม่มีตัวบอกโหมด");
    let threw = "";
    if (publishFn) {
      try { await publishFn("chat-sys1", "message.new", { conversationId: "conv1" }); }
      catch (e) { threw = e instanceof Error ? e.message : String(e); }
    }
    chk("RT-2.2", "🔴 ไม่มีกุญแจ → publish() ต้องไม่ throw (ไม่งั้นการส่งข้อความลูกค้าล้มไปด้วย)",
      publishFn !== null && threw === "", "ไม่ throw", publishFn ? threw : "ยังไม่มี publish");
    chk("RT-2.3", "ไม่มีกุญแจ → ไม่ยิงเน็ตออกไปเลย", calls.length === 0, "0 คำขอ", `${calls.length} คำขอ: ${j(calls.map((c) => c.url))}`);

    // 🟢 คู่บวก — ถ้าไม่มีข้อนี้ ข้อบนจะเขียวได้ด้วยโค้ดที่ไม่ทำอะไรเลย
    fillEnv();
    calls.length = 0;
    chk("RT-2.4", "🟢 คู่บวก: มีกุญแจ → โหมดเป็น realtime",
      modeFn !== null && isOn(modeFn()), "realtime/true", modeFn ? j(modeFn()) : "ยังไม่มีตัวบอกโหมด");
    // `publishFn` ถูกหยิบมาแบบไม่รู้ชนิด (รับได้หลายชื่อ) → ห่อด้วย Promise.resolve ก่อนกลืน error
    if (publishFn) await Promise.resolve(publishFn("chat-sys1", "message.new", { conversationId: "conv1" })).catch(() => {});
    chk("RT-2.5", "🟢 คู่บวก: มีกุญแจ → ยิงคำขอออกไปจริง (พิสูจน์ว่าโค้ดเดินถึงจุดส่งจริง)",
      calls.length > 0, "≥1 คำขอ", "0 คำขอ — ตัวส่งไม่เคยทำงาน ข้อ RT-3 จะเขียวหลอก");
  });

  // ═════════ RT-3 · ห้ามส่งเนื้อความออกนอก ═════════
  await section("RT-3", "RT-3 🔴 ห้ามส่งเนื้อความลูกค้าออกไปยังผู้ให้บริการภายนอก:", async () => {
    fillEnv();
    calls.length = 0;
    if (publishFn) {
      // จงใจยัดเนื้อความมาให้เต็มที่ — ชั้นนี้ต้อง "กันที่ขอบ" ไม่ใช่หวังว่าผู้เรียกจะไม่พลาด
      await Promise.resolve(publishFn("chat-sys1", "message.new", {
        conversationId: "conv1",
        body: SECRET,
        preview: SECRET,
        text: SECRET,
        customerName: SECRET,
      })).catch(() => {});
    }
    const wire = calls.map((c) => `${c.url}\n${c.body}\n${c.headers}`).join("\n");
    chk("RT-3.1", "🟢 คู่บวก: มีคำขอออกไปให้ตรวจจริง", calls.length > 0, "≥1 คำขอ", "0 — ข้อล่างจะเขียวหลอก");
    chk("RT-3.2", "🔴 เนื้อความลูกค้าต้องไม่โผล่ในสิ่งที่ส่งออกไป (ต่อให้ผู้เรียกเผลอใส่มา)",
      calls.length > 0 && !wire.includes(SECRET), "ไม่มีเนื้อความในคำขอ",
      calls.length === 0 ? "ไม่มีคำขอให้ตรวจ" : `พบเนื้อความในคำขอ: ${wire.slice(0, 200)}`);
    chk("RT-3.3", "🟢 คู่บวก: สัญญาณที่อนุญาต (id ห้อง) ยังไปถึงจริง — ไม่ใช่ตัดทิ้งทั้งก้อนแล้วบอกว่าปลอดภัย",
      calls.length > 0 && wire.includes("conv1"), "พบ conversationId ในคำขอ",
      calls.length === 0 ? "ไม่มีคำขอ" : "ตัดทุกอย่างทิ้ง — ฝั่งเบราว์เซอร์จะไม่รู้ว่าห้องไหนมีของใหม่");
    // ชั้นซอร์ส: ต้องมีตัวคัดกรองคีย์อยู่จริง ไม่ใช่บังเอิญไม่ได้ส่ง
    chk("RT-3.4", "มีการคัดกรองสิ่งที่ส่งออกอย่างชัดเจนในซอร์ส (allowlist/pick/sanitize)",
      /(allow|pick|sanitize|whitelist|SAFE_KEYS)/i.test(RT_SRC), "เห็นตัวคัดกรอง",
      "ไม่เห็น — วันหลังมีคนใส่ body มาก็หลุดทันที", "MAJOR");
  });

  // ═════════ RT-4 · กุญแจลับห้ามถึงเบราว์เซอร์ ═════════
  await section("RT-4", "RT-4 กุญแจลับห้ามหลุดถึงเบราว์เซอร์:", () => {
    const badName = ENV_NAMES.filter((n) => n.startsWith("NEXT_PUBLIC_") && /SECRET/.test(n));
    chk("RT-4.1", "ไม่มีชื่อ env แบบ NEXT_PUBLIC_*SECRET (ชื่อขึ้นต้นแบบนี้ = ถูกฝังลงบันเดิลเบราว์เซอร์)",
      badName.length === 0, "ไม่มี", j(badName));
    const secretNames = ENV_NAMES.filter((n) => /SECRET/.test(n));
    const clientFiles = [...CHAT_FILES, ...RT_FILES].filter((f) => /"use client"/.test(read(f)));
    const leaks = clientFiles.filter((f) => secretNames.some((n) => strip(read(f)).includes(n)));
    chk("RT-4.2", "🔴 ไฟล์ฝั่งเบราว์เซอร์ (\"use client\") ไม่อ้างชื่อ env ที่เป็นความลับ",
      leaks.length === 0, "0 ไฟล์", j(leaks));
    chk("RT-4.3", "🟢 คู่บวก: มีไฟล์ \"use client\" ให้ตรวจจริง (ถ้าลิสต์ว่าง ข้อบนจะเขียวหลอก)",
      clientFiles.length > 0, "≥1 ไฟล์", `${clientFiles.length}`);
  });

  // ═════════ RT-5 · polling ต้องไม่ถูกปิด ═════════
  await section("RT-5", "RT-5 🔴 realtime ห้ามเป็นเงื่อนไขของความถูกต้อง:", () => {
    chk("RT-5.1", "หน้าจอยังมีรอบ poll อยู่", /setInterval/.test(SCREEN), "มี setInterval", "ไม่มีรอบ poll แล้ว");
    // หา effect ที่มี setInterval แล้วดูว่ามีการ 'ปิดรอบ poll เมื่อ realtime ติด' หรือเปล่า
    const blocks = [...SCREEN.matchAll(/useEffect\(([\s\S]{0,1200}?)\n\s*\}, \[/g)].map((m) => m[1]!);
    const pollBlocks = blocks.filter((b) => /setInterval/.test(b));
    // 🔴 คำว่า `live` เปล่า ๆ ใช้ไม่ได้ — ของจริงมี `if (!alive) return` (ธงกัน setState หลัง unmount)
    //    ซึ่งเป็นคนละเรื่องและถูกต้องอยู่แล้ว · ต้องจับเฉพาะคำที่หมายถึง realtime จริง ๆ
    const gated = pollBlocks.filter((b) => /if\s*\([^)]{0,80}\b(realtime|isRealtime|pusher|ably|socket)\b[^)]{0,80}\)\s*(\{[^}]{0,60})?return/i.test(b));
    chk("RT-5.2", "🔴 รอบ poll ไม่ถูกปิดทิ้งเมื่อ realtime ติด (ผู้ให้บริการล่ม = ทีมไม่เห็นข้อความใหม่เลย)",
      gated.length === 0, "ไม่มีการปิดรอบ poll", `${gated.length} จุดปิดรอบ poll เมื่อ realtime ติด`);
    chk("RT-5.3", "🟢 คู่บวก: หา effect ที่มีรอบ poll เจอจริง", pollBlocks.length > 0, "≥1", `${pollBlocks.length}`);
  });

  // ═════════ RT-6 · กำลังพิมพ์ ═════════
  await section("RT-6", "RT-6 'กำลังพิมพ์' ต้องหมดอายุเอง:", () => {
    // 🔴 ห้ามจับคำว่า `typing` ลอย ๆ — `adapter.ts` มี `capabilities.typing` อยู่แล้วตั้งแต่ก่อนหน้านี้
    //    (คนละเรื่องกัน: อันนั้นคือ "ช่องทางส่งสถานะพิมพ์ได้ไหม") ⇒ จับแล้วจะเขียวหลอกทันที
    const all = RT_SRC + "\n" + SCREEN;
    chk("RT-6.1", "มีตัวบอก 'กำลังพิมพ์' บนหน้าจอจริง (ไม่ใช่แค่ธง capabilities.typing ของ adapter)",
      /กำลังพิมพ์/.test(SCREEN), "มีบนหน้าจอ", "ไม่พบ");
    // มองหาค่า TTL ในระยะใกล้กับโค้ดเรื่องกำลังพิมพ์เท่านั้น (ไม่ใช่ค่า 5000 ของรอบ poll ที่อยู่คนละเรื่อง)
    const near = [...all.matchAll(/(กำลังพิมพ์|typing)/gi)]
      .map((m) => all.slice(Math.max(0, m.index! - 400), m.index! + 400)).join("\n");
    chk("RT-6.2", "🔴 มีค่าหมดอายุสั้น ๆ ติดกับโค้ดกำลังพิมพ์ (ปิดแท็บกลางคันแล้วสามจุดต้องหายเอง)",
      /กำลังพิมพ์/.test(SCREEN) && /(TYPING_TTL|typingTtl|typingExpire|หมดอายุ|[^\d](2000|3000|4000|5000|6000|8000|10000|10_000)\b)/i.test(near),
      "มีค่า TTL", "ไม่มี — สามจุดจะค้างจนกว่าจะรีเฟรช");
    chk("RT-6.3", "🔴 สัญญาณกำลังพิมพ์ต้องไม่พาเนื้อความที่กำลังพิมพ์ไปด้วย (ร่างที่ยังไม่ส่ง = ของส่วนตัวที่สุด)",
      !/typing[\s\S]{0,200}(draft|body\s*:|text\s*:)/i.test(RT_SRC), "ส่งแค่ 'ใครกำลังพิมพ์'",
      "พบการส่งเนื้อร่างไปกับสัญญาณกำลังพิมพ์");
  });

  // ═════════ RT-7 · ผู้ให้บริการล่ม ═════════
  await section("RT-7", "RT-7 ผู้ให้บริการล่ม/โควตาหมด ต้องไม่ทำให้ส่งข้อความล้ม:", async () => {
    fillEnv();
    fetchMode = "boom";
    calls.length = 0;
    let threw = "";
    if (publishFn) {
      try { await publishFn("chat-sys1", "message.new", { conversationId: "conv1" }); }
      catch (e) { threw = e instanceof Error ? e.message : String(e); }
    }
    fetchMode = "ok";
    chk("RT-7.1", "🟢 คู่บวก: จำลองผู้ให้บริการล่มแล้วมีการเรียกออกไปจริง", calls.length > 0, "≥1 คำขอ", `${calls.length}`);
    chk("RT-7.2", "🔴 publish() กลืน error ของผู้ให้บริการ (แจ้งเตือนพังต้องไม่ทำข้อความลูกค้าหาย)",
      publishFn !== null && threw === "", "ไม่ throw", publishFn ? threw : "ยังไม่มี publish");
  });
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)); }

globalThis.fetch = realFetch;

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CHAT V2 REALTIME =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
