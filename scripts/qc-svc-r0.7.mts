// QC — SVC R0.7 · LINE (Flex · rich menu · รหัสผูก · postback) + notifyCustomer + ลิงก์เซ็น · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/SVC-MASTER-PLAN.md แถว R0.7 · ใบสั่ง ledger/svc-briefs/svc-brief-r0.7.md (§2–§3 = สัญญาที่ตรวจ) · ledger/SVC-CORE-CONTRACT.md §4
//        ledger/wo-notes/svc-r0.8-carry.md ข้อ R0.7 (dedupeKey จาก id · รหัส ≥8 ตัวผสม + HMAC มีกุญแจ · retry P2002)
//
// กลุ่มข้อ:
//   F  ไฟล์ส่งมอบ · facade · ชั้น import (core ไม่ลาก modules · แชทไม่ลาก platform · platform ใช้ facade แชท)
//   K  ด่าน prod ของตัวจำลอง (APP_ENV=production / host อื่น ⇒ ไม่ใช้ LINE_API_BASE)
//   S  ลิงก์เซ็น (สูตร HMAC ข้อสอบปลอมเอง · แก้พารามิเตอร์/ร้าน/อายุ/จุดประสงค์ ⇒ null เดียวกัน · ไม่มีกุญแจ)
//   L  รหัสผูก (เดาไม่ได้ · เก็บ HMAC · หมดอายุ · ใช้ครั้งเดียว · ข้ามร้าน · ข้าม OA · พร้อมกัน 10 · rate limit)
//   P  ทะเบียน postback (parse ปลอดภัย · ทะเบียนว่าง · ตัวแจก · handler พังไม่ลาม)
//   X  Flex ถึงคนที่ผูก OA นั้นเท่านั้น · ข้ามร้าน · บล็อก · validation · LINE ล้ม
//   R  rich menu (ลำดับเรียก · idempotent · ข้ามร้าน · validation · ผูกรายคน)
//   N  notifyCustomer (ลำดับช่องทาง · ไม่มี OA ⇒ ลิงก์เว็บ · dedupe ซ้ำ/พร้อมกัน · เวลาเงียบเลื่อน · optOut · ข้ามร้าน · validation)
//   W  webhook LINE จริง (import route.ts · ลายเซ็น · postback ข้ามร้าน · ส่งซ้ำ · ข้อความรหัส · คำตอบล้มเหมือนกัน)
//   Z  สแกนรั่ว (DB · console · ผลคืน) · ไม่มีคำขอถึง *.line.me · ทำความสะอาด
//   ORACLE-EDIT R0.7 (มติหลังผู้ตรวจ 28 ต.ค. · /root/svc-runs/fix/r0.7.md): L-17 (A1) · S-9 (A3) · P-6 (A2) · W-7 (A4) · N-18 (A5) · N-19 (B1 retry key + 409)
//     N-20 (B4 pending) · N-21 (B1 timeout) · N-22 (B3 ลิงก์เต็ม + missingVars) · N-23 (B2) · N-24 (B6 ≤10 SQL) · N-25 (B7 429=QUOTA) · N-2/N-9 (B5 webLink) · R-1/R-2/R-6 (B8)
//
// 🔴 เขียนฐาน qc-svc — รันผ่าน gate lock (ห้ามครอบ timeout · ห้าม kill กลางคัน):
//    bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.7.mts
// 🔴 ไม่ยิง LINE จริง: ข้อสอบเปิดตัวจำลอง (node:http 127.0.0.1) + ตั้ง LINE_API_BASE + ครอบ fetch (คำขอออกนอกเครื่อง = บล็อก + จด)
// แถวของข้อสอบ: ชื่อ/ID ขึ้นต้น "svc-r07-" · dedupeKey "svc-r07:" · ลบใน finally (รวมของรอบก่อนที่ค้าง) · วันที่สัมพัทธ์กับเวลาจริงตอนรัน
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { format } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-r0.7";
const SVC_HOST = "ep-mute-scene";
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];

// ═══════════════ 0. ด่านฐานข้อมูล (ในตัวข้อสอบ) ═══════════════
{
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.7.mts`); process.exit(4); }
    const bad = FORBIDDEN_HOSTS.find((h) => u.includes(h));
    if (bad) { console.error(`🔴 ${LABEL}: ${n} ชี้ฐานต้องห้าม (${bad}) — หยุด`); process.exit(4); }
    let hn = "";
    try { hn = new URL(u).hostname; } catch { /* อ่านไม่ได้ = ปฏิเสธ */ }
    if (!hn.startsWith(SVC_HOST)) { console.error(`🔴 ${LABEL}: ${n} host ไม่ใช่ qc-svc (${SVC_HOST}) — หยุด`); process.exit(4); }
  }
  if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
}
loadSvcQcEnv(LABEL);

// ═══════════════ ผลข้อ ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const ORIG = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
const out = (s: string) => ORIG.log(s);
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => {
  cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail });
  out(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const PMAX = 8;
const why = (p: string[]) => p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "");
async function step(id: string, name: string, fn: (p: string[]) => Promise<void>, sev: Sev = "CRITICAL") {
  const p: string[] = [];
  try { await fn(p); } catch (e) { p.push(`โยน: ${errMsg(e)}`); }
  chk(id, name, p.length === 0, why(p), sev);
}

// ═══════════════ ค่าลับ/PII ของรอบ ═══════════════
const RAND = randomBytes(4).toString("hex");
const PFX = `svc-r07-${RAND}`;
const DK = (s: string) => `svc-r07:${RAND}:${s}`;
const SECRETS: string[] = [];
const sec = (tag: string) => { const s = `qc07${tag}${randomBytes(12).toString("hex")}`; SECRETS.push(s); return s; };
const TOK = { c1: sec("t1"), c2: sec("t2"), cb: sec("tb"), cd: sec("td") };
const CSEC = { c1: sec("s1"), c2: sec("s2"), cb: sec("sb"), cd: sec("sd") };
const PHONE = `08${String(randomInt(10_000_000, 99_999_999))}`;
const NAME = `ทดสอบคิวซี${RAND}`;
const PII = [PHONE, NAME];
const RAW_CODES: string[] = []; // รหัสดิบที่ออก — ห้ามอยู่ในฐาน (นอกข้อความแชทที่ลูกค้าพิมพ์เอง)
const SESSION_SECRET = process.env.SESSION_SECRET ?? "";
if (SESSION_SECRET) SECRETS.push(SESSION_SECRET);

// ═══════════════ ตัวจำลอง LINE + ครอบ fetch ═══════════════
type FakeReq = { method: string; path: string; auth: string; ctype: string; bytes: number; json: Any; retryKey: string; status: number };
const FAKE: FakeReq[] = [];
let richSeq = 0;
const ACCEPTED_KEYS = new Map<string, string>();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? "").split("?")[0] ?? "";
    const ctype = String(req.headers["content-type"] ?? "");
    let json: Any = null;
    if (ctype.includes("json")) { try { json = JSON.parse(raw.toString("utf8")); } catch { json = null; } }
    const rec: FakeReq = { method: req.method ?? "", path, auth: String(req.headers.authorization ?? ""), ctype, bytes: raw.length, json, retryKey: String(req.headers["x-line-retry-key"] ?? ""), status: 0 };
    FAKE.push(rec);
    const send = (code: number, obj: unknown) => { rec.status = code; if (res.writableEnded) return; res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.method === "POST" && path === "/v2/bot/message/push") {
      const to = String(json?.to ?? "");
      if (to.startsWith("Ufail")) return send(500, { message: "fake failure" });
      if (to.startsWith("Uquota")) return send(429, { message: "You have reached your monthly limit." });
      // LINE จริง: คีย์ X-Line-Retry-Key ที่เคยรับแล้ว ⇒ 409 (ข้อความถูกส่งไปแล้ว)
      if (rec.retryKey && ACCEPTED_KEYS.has(rec.retryKey)) return send(409, { message: "The retry key is already accepted", sentMessages: [{ id: ACCEPTED_KEYS.get(rec.retryKey) }] });
      const id = `fm${FAKE.length}`;
      if (to.startsWith("Uslow")) { setTimeout(() => { if (rec.retryKey) ACCEPTED_KEYS.set(rec.retryKey, id); send(200, { sentMessages: [{ id }] }); }, 12_000); return; }
      if (rec.retryKey) ACCEPTED_KEYS.set(rec.retryKey, id);
      return send(200, { sentMessages: [{ id, quoteToken: "q" }] });
    }
    if (req.method === "POST" && path === "/v2/bot/message/reply") return send(200, { sentMessages: [{ id: `fr${FAKE.length}` }] });
    if (req.method === "GET" && path.startsWith("/v2/bot/profile/")) return send(200, { displayName: "ลูกค้าคิวซี", userId: path.split("/").pop() });
    if (req.method === "GET" && path === "/v2/bot/info") return send(200, { userId: "Usvcr07bot", basicId: "@svcr07info", displayName: "QC OA" });
    if (req.method === "POST" && path === "/v2/bot/richmenu") return send(200, { richMenuId: `richmenu-svcr07-${++richSeq}` });
    if (req.method === "GET" && path === "/v2/bot/richmenu/list") return send(200, { richmenus: [] });
    return send(200, {});
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const FAKE_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const ENV_KEYS = ["LINE_API_BASE", "APP_ENV", "SESSION_SECRET", "APP_URL", "NEXT_PUBLIC_APP_URL"] as const;
const ENV_SAVED: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const envSet = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
envSet("LINE_API_BASE", FAKE_BASE);
async function withEnv<T>(over: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(over)) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(over)) envSet(k, v);
  try { return await fn(); } finally { for (const [k, v] of Object.entries(prev)) envSet(k, v); }
}
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  BLOCKED.push(`${host}${(() => { try { return new URL(url).pathname; } catch { return ""; } })()}`.slice(0, 120));
  return new Response(JSON.stringify({ message: "blocked by qc" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const lineBlocked = () => BLOCKED.filter((u) => /(^|\.)line\.me/.test(u));

// ═══════════════ ดัก console (สแกนรั่ว) ═══════════════
const CAPTURED: string[] = [];
for (const k of ["log", "info", "warn", "error", "debug"] as const) {
  console[k] = (...a: unknown[]) => { CAPTURED.push(format(...a)); ORIG[k](...a); };
}

// ═══════════════ สัญญาข้อมูล (seed R0.2) ═══════════════
const TA = "svcqc-tenant";
const TB = "svcqc-other-tenant";
const U = { barber: "svcqc-unit-barber", massage: "svcqc-unit-massage", dorm: "svcqc-unit-dorm", hotel: "svcqc-unit-hotel" } as const;
const UB_BARBER = "svcqc-other-unit-barber";
const CTX_A = { tenantId: TA };
const CTX_B = { tenantId: TB };
const START = new Date(Date.now() - 5_000);
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_MIN = 129_600;
/** HH:MM เวลาไทยของวันฐาน (+dayOff) — คิดเอง ไม่พึ่งโค้ดของ builder */
const bkkAt = (base: Date, h: number, m = 0, dayOff = 0): Date => {
  const t = new Date(base.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + dayOff, h - 7, m, 0, 0));
};
const NOW = new Date();
const AT_DAY = bkkAt(NOW, 10, 0, 0);
const AT_QUIET = bkkAt(NOW, 22, 30, 0);
const RETRY_EXPECT = bkkAt(NOW, 8, 0, 1);
const AT_AFTER = bkkAt(NOW, 8, 30, 1);

// ═══════════════ ตัวช่วย ═══════════════
const has = (f: string) => existsSync(join(ROOT, f));
const read = (f: string) => (has(f) ? readFileSync(join(ROOT, f), "utf8") : "");
const js = (v: unknown) => { try { return JSON.stringify(v) ?? ""; } catch { return String(v); } };
const RESULTS: unknown[] = [];
const keep = <X,>(r: X): X => { RESULTS.push(r); return r; };
const tryImport = async (p: string): Promise<Any> => {
  try { return await import(p as string); } catch (e) { out(`  (โหลด ${p} ไม่ได้: ${errMsg(e).slice(0, 160)})`); return null; }
};
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { __missing: true, ok: false, code: `MISSING:${name}` };
  try { return keep(await fn(...args)); } catch (e) { return { __threw: true, ok: false, code: "THREW", message: errMsg(e) }; }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { __missing: true };
  try { return fn(...args); } catch (e) { return { __threw: true, message: errMsg(e) }; }
}
const desc = (r: Any) => (r?.__missing ? "ไม่มีฟังก์ชัน" : r?.__threw ? `โยน(${String(r.message).slice(0, 80)})` : js(r).slice(0, 140));
const leaks = (v: unknown, list: string[] = SECRETS): string[] => { const s = js(v); return list.filter((x) => x && s.includes(x)).map((x) => `…${x.slice(-6)}`); };
const mark = () => FAKE.length;
const since = (m: number) => FAKE.slice(m);
const withTok = (rs: FakeReq[], tok: string) => rs.filter((r) => r.auth === `Bearer ${tok}`);
const pushes = (rs: FakeReq[]) => rs.filter((r) => r.method === "POST" && r.path === "/v2/bot/message/push");
const msgText = (r: FakeReq | undefined): string => { const m = r?.json?.messages?.[0]; return String(m?.text ?? m?.altText ?? ""); };
function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const o: string[] = [];
  for (const n of readdirSync(abs)) {
    const rel = join(dir, n);
    if (statSync(join(ROOT, rel)).isDirectory()) o.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(n)) o.push(rel);
  }
  return o;
}
const b64u = (b: Buffer) => b.toString("base64url");
const slKey = (label = "signed-link:v1:") => `${label}${process.env.SESSION_SECRET ?? ""}`;
/** ปลอม token ตามสูตรในใบสั่ง §3.7 */
function forge(payload: Record<string, unknown>, key = slKey()): string {
  const p = b64u(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${p}.${b64u(createHmac("sha256", key).update(p).digest())}`;
}
const decodeP = (token: string): Any => { try { return JSON.parse(Buffer.from(String(token).split(".")[0] ?? "", "base64url").toString("utf8")); } catch { return null; } };
const codeHashOf = (tenantId: string, code: string) => createHmac("sha256", `chat-link-code:v1:${process.env.SESSION_SECRET ?? ""}`).update(`${tenantId}:${code}`).digest("hex");
const isCodeShape = (c: unknown) => typeof c === "string" && c.length === 8 && [...c].every((ch) => ALPHA.includes(ch)) && /[A-Z]/.test(c) && /[0-9]/.test(c);

// ═══════════════ โหลดโมดูล ═══════════════
const { prisma } = (await import("@/lib/core/db" as string)) as { prisma: Any };
const FILES = {
  flex: "src/lib/modules/chat/line-flex.ts",
  rich: "src/lib/modules/chat/line-richmenu.ts",
  link: "src/lib/modules/chat/link-code.ts",
  postback: "src/lib/platform/postback-routes.ts",
  notify: "src/lib/platform/notify-customer.ts",
  signed: "src/lib/core/signed-link.ts",
};
const CHAT: Any = await tryImport("@/lib/modules/chat");
const PB: Any = has(FILES.postback) ? await tryImport("@/lib/platform/postback-routes") : null;
const NC: Any = has(FILES.notify) ? await tryImport("@/lib/platform/notify-customer") : null;
const SL: Any = has(FILES.signed) ? await tryImport("@/lib/core/signed-link") : null;
const ROUTE: Any = await tryImport("@/app/api/chat/webhook/[connectionId]/route");

// ═══════════════ ข้อมูลของรอบ ═══════════════
const ID: Record<string, string> = {};
const EXT: Record<string, string> = {}; // contact key → LINE userId
const CREATED = { systems: [] as string[], conns: [] as string[], parties: [] as string[], contacts: [] as string[], customers: [] as string[] };
const SV_KEYS = ["messaging.lineConnectionId", "messaging.channelOrder", "messaging.quietHours", "rooms.msg.roomLink"];
const SV_UNITS = [U.barber, U.massage, U.dorm, U.hotel];
const SV_MARK = "svc-r07-oracle";
let SV_SAVED: Any[] = [];
const TEST_ROUTE_CALLS: { kind: string; ctx: Any; arg: Any }[] = [];
const RESOLVE: Record<string, string> = {};
let testRoute: Any = null;
let K_LINE_BLOCKED = -1;

async function svSet(key: string, unitId: string, value: unknown): Promise<void> {
  await prisma.settingValue.deleteMany({ where: { tenantId: TA, key, scope: "UNIT", scopeId: unitId } });
  await prisma.settingValue.create({ data: { tenantId: TA, key, scope: "UNIT", scopeId: unitId, value, setById: SV_MARK } });
}
async function svClear(key: string, unitId: string): Promise<void> {
  await prisma.settingValue.deleteMany({ where: { tenantId: TA, key, scope: "UNIT", scopeId: unitId } });
}

async function cleanup(): Promise<void> {
  const sys = ((await prisma.appSystem.findMany({ where: { tenantId: { in: [TA, TB] }, name: { startsWith: "svc-r07-" } }, select: { id: true } })) as { id: string }[]).map((r) => r.id);
  const conns = ((await prisma.chatChannelConnection.findMany({ where: { OR: [{ systemId: { in: sys } }, { externalAccountId: { startsWith: "svc-r07-" } }] }, select: { id: true } })) as { id: string }[]).map((r) => r.id);
  const convs = ((await prisma.chatConversation.findMany({ where: { systemId: { in: sys } }, select: { id: true } })) as { id: string }[]).map((r) => r.id);
  const contacts = ((await prisma.chatContact.findMany({ where: { systemId: { in: sys } }, select: { id: true } })) as { id: string }[]).map((r) => r.id);
  const soft = async (lbl: string, f: () => Promise<unknown>) => { try { await f(); } catch (e) { out(`  (ล้าง ${lbl} ไม่ได้: ${errMsg(e).slice(0, 100)})`); } };
  if (convs.length) {
    await soft("conversationEvent", () => prisma.chatConversationEvent.deleteMany({ where: { conversationId: { in: convs } } }));
    await soft("conversationPref", () => prisma.chatConversationPref.deleteMany({ where: { conversationId: { in: convs } } }));
    await soft("readState", () => prisma.chatReadState.deleteMany({ where: { conversationId: { in: convs } } }));
    await soft("attachment", () => prisma.chatAttachment.deleteMany({ where: { systemId: { in: sys } } }));
    await soft("message", () => prisma.chatMessage.deleteMany({ where: { conversationId: { in: convs } } }));
    await soft("conversation", () => prisma.chatConversation.deleteMany({ where: { id: { in: convs } } }));
  }
  if (contacts.length) {
    await soft("audit link", () => prisma.auditLog.deleteMany({ where: { targetType: "ChatContact", targetId: { in: contacts } } }));
    await soft("rate", () => prisma.chatRateBucket.deleteMany({ where: { key: { in: contacts.flatMap((c) => [`chat-link:${TA}:${c}`, `chat-link:${TB}:${c}`]) } } }));
    await soft("contact", () => prisma.chatContact.deleteMany({ where: { id: { in: contacts } } }));
  }
  if (conns.length) {
    await soft("webhookLog", () => prisma.chatWebhookLog.deleteMany({ where: { connectionId: { in: conns } } }));
    await soft("connection", () => prisma.chatChannelConnection.deleteMany({ where: { id: { in: conns } } }));
  }
  await soft("linkCode", () => prisma.chatLinkCode.deleteMany({ where: { refId: { startsWith: "svc-r07-" } } }));
  await soft("serviceLog", () => prisma.serviceMessageLog.deleteMany({ where: { dedupeKey: { startsWith: "svc-r07:" } } }));
  const custs = ((await prisma.customer.findMany({ where: { tenantId: TA, name: { startsWith: "svc-r07-" } }, select: { id: true } })) as { id: string }[]).map((r) => r.id);
  if (custs.length) {
    await soft("consent", () => prisma.memberConsent.deleteMany({ where: { customerId: { in: custs } } }));
    await soft("customer", () => prisma.customer.deleteMany({ where: { id: { in: custs } } }));
  }
  await soft("party", () => prisma.party.deleteMany({ where: { tenantId: { in: [TA, TB] }, address: { startsWith: "svc-r07-" } } }));
  await soft("outbox", () => prisma.outboxEvent.deleteMany({ where: { tenantId: { in: [TA, TB] }, createdAt: { gte: START }, type: { startsWith: "chat." } } }));
  await soft("settings(mine)", () => prisma.settingValue.deleteMany({ where: { tenantId: TA, setById: SV_MARK } }));
  await soft("system", () => prisma.appSystem.deleteMany({ where: { id: { in: sys } } }));
}

async function setup(): Promise<void> {
  const sysA = await prisma.appSystem.create({ data: { tenantId: TA, type: "CHAT", name: `${PFX} chat` } });
  const sysB = await prisma.appSystem.create({ data: { tenantId: TB, type: "CHAT", name: `${PFX} chat-b` } });
  const memA = await prisma.appSystem.create({ data: { tenantId: TA, type: "MEMBER", name: `${PFX} member` } });
  CREATED.systems.push(sysA.id, sysB.id, memA.id);
  ID.sysA = sysA.id; ID.sysB = sysB.id; ID.memA = memA.id;
  const conn = async (key: string, tenantId: string, systemId: string, tok: string, s: string, extra: Any = {}) => {
    const c = await prisma.chatChannelConnection.create({ data: { tenantId, systemId, type: "LINE", displayName: `${PFX}-${key}`, externalAccountId: `${PFX}-${key}`, credentials: { channelAccessToken: tok, channelSecret: s }, ...extra } });
    ID[key] = c.id; CREATED.conns.push(c.id);
  };
  await conn("c1", TA, sysA.id, TOK.c1, CSEC.c1, { meta: { basicId: "@svcr07a" } });
  await conn("c2", TA, sysA.id, TOK.c2, CSEC.c2);
  await conn("cb", TB, sysB.id, TOK.cb, CSEC.cb);
  await conn("cd", TA, sysA.id, TOK.cd, CSEC.cd, { status: "DISABLED" });
  const party = async (key: string, tenantId: string) => {
    const p = await prisma.party.create({ data: { tenantId, kind: "PERSON", name: `${NAME}-${key}`, phone: PHONE, address: `${PFX}-${key}` } });
    ID[key] = p.id; CREATED.parties.push(p.id);
  };
  for (const k of ["pa1", "pa2", "pa3", "pa4", "pa5", "pa6", "pa7", "pa8", "pa9", "pa10", "pa11", "pa12"]) await party(k, TA);
  await party("pb", TB);
  const contact = async (key: string, tenantId: string, systemId: string, connKey: string, partyKey: string | null, extra: Any = {}, extPrefix = "Usvcr07") => {
    const ext = `${extPrefix}${key}${RAND}`;
    const c = await prisma.chatContact.create({ data: { tenantId, systemId, channel: "LINE", channelConnectionId: ID[connKey], externalUserId: ext, partyId: partyKey ? ID[partyKey] : null, ...extra } });
    ID[`k_${key}`] = c.id; EXT[key] = ext; CREATED.contacts.push(c.id);
  };
  await contact("a1", TA, sysA.id, "c1", "pa1", { lang: "th", lastSeenAt: new Date(Date.now() - 60_000) });
  await contact("a2en", TA, sysA.id, "c1", "pa2", { lang: "en" });
  await contact("a1old", TA, sysA.id, "c2", "pa4", { lastSeenAt: new Date(Date.now() - 86_400_000) }); // pa4 ผูกเฉพาะ OA2
  await contact("a3blk", TA, sysA.id, "c1", "pa3", { blockedAt: new Date() });
  await contact("a7", TA, sysA.id, "c1", "pa7");
  await contact("a8", TA, sysA.id, "c1", "pa8");
  await contact("a9fail", TA, sysA.id, "c1", "pa9", {}, "Ufail");
  await contact("free", TA, sysA.id, "c1", null);
  await contact("a11quota", TA, sysA.id, "c1", "pa11", {}, "Uquota");
  await contact("a12slow", TA, sysA.id, "c1", "pa12", {}, "Uslow");
  await contact("b1", TB, sysB.id, "cb", "pb");
  for (let i = 0; i < 16; i++) await contact(`l${i}`, TA, sysA.id, "c1", null);
  await contact("l2oa", TA, sysA.id, "c2", null);
  await contact("lb", TB, sysB.id, "cb", null);
  await contact("pre", TA, sysA.id, "c1", "pa10", { lastSeenAt: new Date(Date.now() - 7 * 86_400_000) }); // มี partyId อยู่แล้ว (party ที่ไม่ใช้ส่ง)
  // ยินยอม: pa7 เพิกถอน LINE ชัดแจ้ง · pa8 ไม่เคยยินยอม (ไม่บล็อกข้อความบริการ)
  for (const [k, revoked] of [["pa7", true], ["pa8", false]] as const) {
    const cu = await prisma.customer.create({ data: { tenantId: TA, memberSystemId: memA.id, name: `svc-r07-${k}`, partyId: ID[k] } });
    CREATED.customers.push(cu.id);
    await prisma.memberConsent.create({ data: { tenantId: TA, customerId: cu.id, channel: "LINE", granted: false, source: "STAFF", revokedAt: revoked ? new Date() : null, grantedAt: revoked ? new Date(Date.now() - 86_400_000) : null } });
  }
  // ค่าตั้ง: เก็บของเดิมก่อน (ไม่นับแถวของข้อสอบที่ค้าง) แล้วลบเพื่อให้รอบนี้คุมเอง
  SV_SAVED = (await prisma.settingValue.findMany({ where: { tenantId: TA, key: { in: SV_KEYS }, scope: "UNIT", scopeId: { in: SV_UNITS }, NOT: { setById: SV_MARK } } })) as Any[];
  if (SV_SAVED.length) await prisma.settingValue.deleteMany({ where: { id: { in: SV_SAVED.map((r) => r.id) } } });
  await svSet("messaging.lineConnectionId", U.dorm, ID.c1);
  await svSet("messaging.lineConnectionId", U.massage, ID.c2);
  await svSet("messaging.lineConnectionId", U.hotel, ID.cb); // ชี้ OA ร้านอื่น (ค่าที่ไม่ควรมีผล)
  await svSet("messaging.channelOrder", U.hotel, ["LINE"]);
}

const BUBBLE = { type: "bubble", body: { type: "box", layout: "vertical", contents: [{ type: "text", text: "svc-r07 flex" }] } };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(2048)]);
const SPEC = (tag: string, over: Any = {}) => ({
  name: `svc-r07 ${tag}`, chatBarText: "เมนูหอ", size: { width: 2500, height: 843 }, selected: false,
  areas: [
    { bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: "postback", data: "dorm.bills", displayText: "บิลของฉัน" } },
    { bounds: { x: 1250, y: 0, width: 1250, height: 843 }, action: { type: "uri", uri: `https://example.com/${tag}` } },
  ],
  image: { contentType: "image/png", data: new Uint8Array(PNG) },
  ...over,
});
const VARS = { tenantName: NAME, roomNo: "305", unitName: "หอทดสอบ", linkCode: "ZZ99" };
const notify = (ctx: Any, input: Any) => call(NC, "notifyCustomer", ctx, { phone: PHONE, vars: VARS, domain: "rooms", messageKey: "roomLink", at: AT_DAY, ...input });
const LINK = (subj: string) => ({ purpose: "svc.r07", subjectId: `svc-r07-${subj}`, path: "/q/", expMin: 60 });
const logOf = async (key: string): Promise<Any[]> => prisma.serviceMessageLog.findMany({ where: { tenantId: { in: [TA, TB] }, dedupeKey: key } });

async function hook(connKey: string, secret: string, events: Any[], badSig = false): Promise<number> {
  if (typeof ROUTE?.POST !== "function") throw new Error("ไม่มี POST ใน route webhook");
  const body = JSON.stringify({ destination: "Usvcr07bot", events });
  const sig = createHmac("sha256", secret).update(body, "utf8").digest("base64");
  const req = new Request(`http://qc.local/api/chat/webhook/${ID[connKey]}`, { method: "POST", headers: { "content-type": "application/json", "x-line-signature": badSig ? `AAAA${sig.slice(4)}` : sig }, body });
  const res: Response = await ROUTE.POST(req, { params: Promise.resolve({ connectionId: ID[connKey] }) });
  return res.status;
}
const evPostback = (userId: string, data: string, id = randomBytes(8).toString("hex")) => ({
  type: "postback", mode: "active", timestamp: Date.now(), webhookEventId: `01SVCR07${id}`, deliveryContext: { isRedelivery: false },
  replyToken: `rt${id}`, source: { type: "user", userId }, postback: { data },
});
const evText = (userId: string, text: string, id = randomBytes(8).toString("hex")) => ({
  type: "message", mode: "active", timestamp: Date.now(), webhookEventId: `01SVCR07${id}`, deliveryContext: { isRedelivery: false },
  replyToken: `rt${id}`, source: { type: "user", userId }, message: { id: `m${id}`, type: "text", text, quoteToken: "q" },
});
/** ข้อความตอบกลับ (reply ด้วย token หรือ push ถึง userId) ที่ตัวจำลองได้รับ */
const replyTo = (rs: FakeReq[], tok: string, replyToken: string, userId: string): string => {
  const r = withTok(rs, tok).find((x) => (x.path === "/v2/bot/message/reply" && x.json?.replyToken === replyToken) || (x.path === "/v2/bot/message/push" && x.json?.to === userId));
  return r ? js(r.json?.messages ?? "") : "";
};

out(`\n===== QC SVC R0.7 · LINE + notifyCustomer + ลิงก์เซ็น · รอบ ${RAND} · ตัวจำลอง ${FAKE_BASE} =====`);
try {
  await cleanup();
  const tenantsOk = (await prisma.tenant.count({ where: { id: { in: [TA, TB] } } })) === 2;
  if (!tenantsOk) chk("PRE", "ร้าน QC ของ SVC มีอยู่ (seed R0.2)", false, "ไม่พบ svcqc-tenant/svcqc-other-tenant — รัน seed-svc-qc ก่อน");
  if (SESSION_SECRET.length < 32) chk("PRE-2", "SESSION_SECRET ใน .env.qc-svc (≥ 32)", false, "ไม่มี/สั้น — ข้อ S/L ใช้สูตรนี้");
  await setup();

  // ═══════════════ F ไฟล์ ═══════════════
  out("\n— F ไฟล์ส่งมอบ · facade · ชั้น import —");
  await step("F-1", "ไฟล์ใหม่ 6 ไฟล์ครบ (chat/line-flex · line-richmenu · link-code · platform/postback-routes · notify-customer · core/signed-link)", async (p) => {
    for (const [k, f] of Object.entries(FILES)) if (!has(f)) p.push(`ไม่มี ${k}: ${f}`);
  });
  await step("F-2", "facade แชทส่งออกชื่อใหม่ 5 ตัว + LINK_CODE_ALPHABET · ของเดิมยังอยู่ (pushToContact · sendLineToParty · linkChatContactParty · notifyCustomer ของ POS)", async (p) => {
    if (!CHAT) { p.push("โหลด @/lib/modules/chat ไม่ได้"); return; }
    for (const n of ["pushFlexToParty", "replyFlex", "syncRichMenu", "issueLinkCode", "consumeLinkCode", "pushToContact", "sendLineToParty", "linkChatContactParty", "notifyCustomer"]) if (typeof CHAT[n] !== "function") p.push(`ไม่มี ${n}`);
    if (CHAT.LINK_CODE_ALPHABET !== ALPHA) p.push(`LINK_CODE_ALPHABET = ${js(CHAT.LINK_CODE_ALPHABET)}`);
  });
  await step("F-3", "platform/core ส่งออกครบ · POSTBACK_ROUTES เป็นอาร์เรย์ว่าง · LINK_PURPOSE_PREFIX · SIGNED_LINK_MAX_MIN = 129600", async (p) => {
    if (!PB) p.push("โหลด postback-routes ไม่ได้");
    else {
      for (const n of ["parsePostbackData", "dispatchPostback", "handleLinkCodeText"]) if (typeof PB[n] !== "function") p.push(`postback-routes ไม่มี ${n}`);
      if (!Array.isArray(PB.POSTBACK_ROUTES)) p.push("POSTBACK_ROUTES ไม่ใช่อาร์เรย์");
      else if (PB.POSTBACK_ROUTES.length !== 0) p.push(`POSTBACK_ROUTES มี ${PB.POSTBACK_ROUTES.length} รายการ (ใบนี้ต้องว่าง)`);
      const lp = PB.LINK_PURPOSE_PREFIX;
      if (lp?.DORM_LEASE !== "dorm." || lp?.QUEUE_TICKET !== "booking." || lp?.APPOINTMENT !== "booking.") p.push(`LINK_PURPOSE_PREFIX = ${js(lp)}`);
    }
    if (typeof NC?.notifyCustomer !== "function") p.push("notify-customer ไม่มี notifyCustomer");
    if (!SL) p.push("โหลด signed-link ไม่ได้");
    else {
      for (const n of ["signLink", "verifyLink"]) if (typeof SL[n] !== "function") p.push(`signed-link ไม่มี ${n}`);
      if (SL.SIGNED_LINK_MAX_MIN !== MAX_MIN) p.push(`SIGNED_LINK_MAX_MIN = ${js(SL.SIGNED_LINK_MAX_MIN)}`);
    }
  });
  await step("F-4", "ชั้น import: core/signed-link ไม่ลาก modules/platform · ไฟล์แชทใหม่ไม่ลาก platform · platform ใช้แชทผ่าน facade เท่านั้น", async (p) => {
    const sl = read(FILES.signed);
    if (/from\s+["']@\/lib\/(modules|platform)\//.test(sl)) p.push("signed-link import modules/platform");
    for (const f of [FILES.flex, FILES.rich, FILES.link]) if (/from\s+["']@\/lib\/platform\//.test(read(f))) p.push(`${f} import platform`);
    for (const f of [FILES.postback, FILES.notify]) if (/["']@\/lib\/modules\/chat\/[^"']+["']/.test(read(f))) p.push(`${f} import ไฟล์ย่อยของแชท (ต้องใช้ @/lib/modules/chat)`);
    for (const f of [...Object.values(FILES), "src/lib/modules/chat/line.ts"]) {
      const s = read(f);
      if (/SESSION_SECRET\s*(\?\?|\|\|)\s*["'`]/.test(s)) p.push(`${f} มีค่าสำรองของ SESSION_SECRET`);
    }
  }, "MAJOR");

  // ═══════════════ K ด่าน prod ของตัวจำลอง ═══════════════
  out("\n— K ด่าน prod ของ LINE_API_BASE —");
  await step("K-1", "APP_ENV=production ⇒ ไม่ใช้ LINE_API_BASE (คำขอไปที่ api.line.me — ถูกข้อสอบบล็อก) · ตัวจำลองไม่ได้รับ", async (p) => {
    const m = mark(); const b = lineBlocked().length;
    const r = await withEnv({ APP_ENV: "production" }, () => call(CHAT, "pushFlexToParty", CTX_A, { partyId: ID.pa1, connectionId: ID.c1, altText: "k1", contents: BUBBLE }));
    if (r?.__missing) { p.push("ไม่มี pushFlexToParty"); return; }
    if (r?.__threw) p.push(`โยน ${r.message}`);
    if (withTok(since(m), TOK.c1).length) p.push("ตัวจำลองได้รับคำขอทั้งที่ APP_ENV=production");
    if (lineBlocked().length === b) p.push("ไม่มีคำขอไป *.line.me (ควรใช้ฐานจริงเมื่อ prod)");
  });
  await step("K-2", "LINE_API_BASE เป็น host อื่น (https://evil.example) ⇒ ไม่ใช้ · ไปฐานจริงแทน", async (p) => {
    const b = BLOCKED.length;
    const r = await withEnv({ LINE_API_BASE: "https://evil.example" }, () => call(CHAT, "pushFlexToParty", CTX_A, { partyId: ID.pa1, connectionId: ID.c1, altText: "k2", contents: BUBBLE }));
    if (r?.__missing) { p.push("ไม่มี pushFlexToParty"); return; }
    const nw = BLOCKED.slice(b);
    if (nw.some((u) => u.startsWith("evil.example"))) p.push("ยิงไป evil.example");
    if (!nw.some((u) => /line\.me/.test(u))) p.push(`ไม่ได้ไปฐานจริง (${js(nw)})`);
  }, "MAJOR");
  K_LINE_BLOCKED = lineBlocked().length; // คำขอ *.line.me ที่ตั้งใจ — หลังจากนี้ต้องไม่เพิ่ม

  // ═══════════════ S ลิงก์เซ็น ═══════════════
  out("\n— S ลิงก์เซ็น —");
  const sign = (o: Any) => callSync(SL, "signLink", o);
  const verify = (t: unknown, u: string) => callSync(SL, "verifyLink", t, u);
  const SUBJ = `svc-r07-subj-${RAND}`;
  await step("S-1", "sign → verify ได้ {tenantId, subjectId} · อักขระ URL-safe · 2 ครั้งได้ token ต่างกัน (nonce)", async (p) => {
    const t1 = sign({ tenantId: TA, purpose: "booking.manage", subjectId: SUBJ, expMin: 60 });
    const t2 = sign({ tenantId: TA, purpose: "booking.manage", subjectId: SUBJ, expMin: 60 });
    if (typeof t1 !== "string") { p.push(`sign → ${desc(t1)}`); return; }
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t1)) p.push("token ไม่ใช่ P.S แบบ base64url");
    if (t1 === t2) p.push("token ซ้ำกัน (ไม่มี nonce)");
    const v = verify(t1, "booking.manage");
    if (v?.tenantId !== TA || v?.subjectId !== SUBJ) p.push(`verify → ${desc(v)}`);
    if (v && Object.keys(v).sort().join(",") !== "subjectId,tenantId") p.push(`ผลมีคีย์อื่น ${Object.keys(v).join(",")}`);
  });
  await step("S-2", "รูป token ตามใบสั่ง (P = JSON v/t/u/s/e/n · n ≥ 16 ไบต์ · S = HMAC(\"signed-link:v1:\"+SESSION_SECRET, P)) — ข้อสอบปลอมด้วยสูตรนี้แล้ว verify ผ่าน", async (p) => {
    const t = sign({ tenantId: TA, purpose: "dorm.portal", subjectId: SUBJ, expMin: 30 });
    if (typeof t !== "string") { p.push(`sign → ${desc(t)}`); return; }
    const [P, S] = t.split(".");
    const pl = decodeP(t);
    if (!pl || pl.v !== 1 || pl.t !== TA || pl.u !== "dorm.portal" || pl.s !== SUBJ || typeof pl.e !== "number") p.push(`payload ${js(pl).slice(0, 120)}`);
    if (Buffer.from(String(pl?.n ?? ""), "base64url").length < 16) p.push("nonce < 16 ไบต์");
    const nowS = Math.floor(Date.now() / 1000);
    if (pl && (pl.e < nowS + 29 * 60 || pl.e > nowS + 31 * 60)) p.push(`e ไม่ใช่ now+30 นาที (${pl.e - nowS} วิ)`);
    if (S !== b64u(createHmac("sha256", slKey()).update(P ?? "").digest())) p.push("ลายเซ็นไม่ตรงสูตร");
    const forged = forge({ v: 1, t: TA, u: "dorm.portal", s: `${SUBJ}-forged`, e: nowS + 600, n: b64u(randomBytes(16)) });
    const v = verify(forged, "dorm.portal");
    if (v?.subjectId !== `${SUBJ}-forged`) p.push(`token ตามสูตร verify ไม่ผ่าน (${desc(v)}) — positive control`);
  });
  await step("S-3", "แก้พารามิเตอร์ (t→ร้านอื่น · s · e ยืดอายุ · u) โดยคงลายเซ็นเดิม ⇒ null · ลายเซ็นพลิก 1 ตัว ⇒ null", async (p) => {
    const t = sign({ tenantId: TA, purpose: "booking.manage", subjectId: SUBJ, expMin: 60 });
    if (typeof t !== "string") { p.push(`sign → ${desc(t)}`); return; }
    const pl = decodeP(t); const S = t.split(".")[1] ?? "";
    for (const [lbl, mod] of [["t→B", { t: TB }], ["s", { s: `${SUBJ}x` }], ["e+1วัน", { e: pl.e + 86_400 }], ["u", { u: "dorm.portal" }]] as const) {
      const P2 = b64u(Buffer.from(JSON.stringify({ ...pl, ...mod }), "utf8"));
      const r = verify(`${P2}.${S}`, lbl === "u" ? "dorm.portal" : "booking.manage");
      if (r !== null) p.push(`${lbl} → ${desc(r)}`);
    }
    const flip = S.slice(0, -2) + (S.endsWith("AA") ? "BB" : "AA");
    if (verify(`${t.split(".")[0]}.${flip}`, "booking.manage") !== null) p.push("ลายเซ็นพลิกแล้วผ่าน");
  });
  await step("S-4", "จุดประสงค์ไม่ตรง ⇒ null · ขยะ/ว่าง/ไม่ใช่ string/3 ส่วน/ตัดท้าย ⇒ null ไม่ throw (คำตอบเดียวกันทุกกรณี · X7)", async (p) => {
    const t = sign({ tenantId: TA, purpose: "booking.manage", subjectId: SUBJ, expMin: 60 });
    if (typeof t !== "string") { p.push(`sign → ${desc(t)}`); return; }
    const cases: [string, unknown, string][] = [["purpose อื่น", t, "dorm.portal"], ["ขยะ", "a.b", "booking.manage"], ["ว่าง", "", "booking.manage"], ["ตัวเลข", 42, "booking.manage"], ["null", null, "booking.manage"], ["object", { t }, "booking.manage"], ["3 ส่วน", `${t}.x`, "booking.manage"], ["ตัดท้าย", t.slice(0, -5), "booking.manage"]];
    for (const [lbl, v, u] of cases) { const r = verify(v, u); if (r !== null) p.push(`${lbl} → ${desc(r)}`); }
  });
  await step("S-5", "หมดอายุ (ลายเซ็นถูก e ≤ now) ⇒ null · e เกิน 90 วัน (ลายเซ็นถูก) ⇒ null", async (p) => {
    if (!SL) { p.push("ไม่มี signed-link"); return; }
    const nowS = Math.floor(Date.now() / 1000);
    const exp = forge({ v: 1, t: TA, u: "booking.manage", s: SUBJ, e: nowS - 1, n: b64u(randomBytes(16)) });
    const far = forge({ v: 1, t: TA, u: "booking.manage", s: SUBJ, e: nowS + MAX_MIN * 60 + 3_600, n: b64u(randomBytes(16)) });
    const ok = forge({ v: 1, t: TA, u: "booking.manage", s: SUBJ, e: nowS + 300, n: b64u(randomBytes(16)) });
    if (verify(exp, "booking.manage") !== null) p.push("หมดอายุแล้วผ่าน");
    if (verify(far, "booking.manage") !== null) p.push("อายุเกินเพดานผ่าน");
    if (verify(ok, "booking.manage")?.subjectId !== SUBJ) p.push("control (e=now+5 นาที) ไม่ผ่าน");
    const v2 = forge({ v: 2, t: TA, u: "booking.manage", s: SUBJ, e: nowS + 300, n: b64u(randomBytes(16)) });
    if (verify(v2, "booking.manage") !== null) p.push("v=2 ผ่าน");
  });
  await step("S-6", "กุญแจผิดป้าย (SESSION_SECRET ดิบ · private-file:v1: · chat-link-code:v1:) ⇒ null", async (p) => {
    if (!SL) { p.push("ไม่มี signed-link"); return; }
    const nowS = Math.floor(Date.now() / 1000);
    for (const lbl of ["", "private-file:v1:", "chat-link-code:v1:"]) {
      const t = forge({ v: 1, t: TA, u: "booking.manage", s: SUBJ, e: nowS + 300, n: b64u(randomBytes(16)) }, slKey(lbl));
      if (verify(t, "booking.manage") !== null) p.push(`ป้าย "${lbl}" ผ่าน`);
    }
  });
  await step("S-7", "expMin เกินเพดาน ⇒ ตัดเหลือ 90 วัน · ≤0 / ทศนิยม / NaN / ค่าว่าง / purpose ผิดรูป ⇒ throw", async (p) => {
    const t = sign({ tenantId: TA, purpose: "booking.manage", subjectId: SUBJ, expMin: 1_000_000_000 });
    if (typeof t !== "string") p.push(`expMin มาก → ${desc(t)}`);
    else { const e = decodeP(t)?.e; const nowS = Math.floor(Date.now() / 1000); if (!(e <= nowS + MAX_MIN * 60 + 120)) p.push(`e เกินเพดาน (${e - nowS} วิ)`); if (verify(t, "booking.manage")?.subjectId !== SUBJ) p.push("token ที่ตัดแล้ว verify ไม่ผ่าน"); }
    for (const [lbl, o] of [["0", { expMin: 0 }], ["-1", { expMin: -1 }], ["1.5", { expMin: 1.5 }], ["NaN", { expMin: Number.NaN }], ["tenant ว่าง", { tenantId: "" }], ["subject ว่าง", { subjectId: "" }], ["purpose ผิดรูป", { purpose: "Booking Manage!" }]] as const) {
      const base: Any = { tenantId: TA, purpose: "booking.manage", subjectId: SUBJ, expMin: 10 };
      const r = sign({ ...base, ...o });
      if (!r?.__threw) p.push(`${lbl} ไม่ throw (${desc(r).slice(0, 40)})`);
    }
  });
  await step("S-8", "ไม่มีกุญแจ/กุญแจ < 32 ⇒ sign throw · verify null (ไม่มีกุญแจสำรอง)", async (p) => {
    const t = sign({ tenantId: TA, purpose: "booking.manage", subjectId: SUBJ, expMin: 10 });
    for (const [lbl, k] of [["ไม่มี", undefined], ["31 ตัว", "x".repeat(31)]] as const) {
      await withEnv({ SESSION_SECRET: k }, async () => {
        if (!sign({ tenantId: TA, purpose: "booking.manage", subjectId: SUBJ, expMin: 10 })?.__threw) p.push(`${lbl}: sign ไม่ throw`);
        if (verify(t, "booking.manage") !== null) p.push(`${lbl}: verify ไม่ใช่ null`);
      });
    }
  });

  await step("S-9", "ORACLE-EDIT A3: ลายเซ็นรูปอื่นที่ถอดได้ไบต์เดียวกัน (บิตท้าย base64url ที่ไม่ใช้) ⇒ null (ลายเซ็นรูปเดียว)", async (p) => {
    const t = sign({ tenantId: TA, purpose: "booking.manage", subjectId: SUBJ, expMin: 10 });
    if (typeof t !== "string") { p.push(`sign → ${desc(t)}`); return; }
    const [P, S] = t.split(".") as [string, string];
    const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = S.slice(-1); const alt = B64[B64.indexOf(last) ^ 1]!;
    const S2 = S.slice(0, -1) + alt;
    if (!Buffer.from(S2, "base64url").equals(Buffer.from(S, "base64url"))) { p.push("ตัวทดสอบสร้างรูปอื่นไม่ได้ (control)"); return; }
    if (verify(`${P}.${S2}`, "booking.manage") !== null) p.push("ลายเซ็นรูปอื่น (ไบต์เดียวกัน) ผ่าน");
    if (verify(t, "booking.manage")?.subjectId !== SUBJ) p.push("control รูปเดิมไม่ผ่าน");
  });

  // ═══════════════ L รหัสผูก ═══════════════
  out("\n— L รหัสผูก LINE —");
  const issue = (ctx: Any, o: Any) => call(CHAT, "issueLinkCode", ctx, o);
  const consume = (ctx: Any, o: Any) => call(CHAT, "consumeLinkCode", ctx, o);
  const codeRow = async (tenantId: string, code: string): Promise<Any> => prisma.chatLinkCode.findFirst({ where: { tenantId, codeHash: codeHashOf(tenantId, code) } });
  const mkCode = async (o: Any, ctx: Any = CTX_A): Promise<string> => {
    const r = await issue(ctx, { purpose: "QUEUE_TICKET", ttlMin: 30, ...o });
    if (r?.ok !== true || typeof r?.code !== "string") throw new Error(`issue → ${desc(r)}`);
    RAW_CODES.push(r.code); return r.code;
  };
  let codeL1 = "";
  await step("L-1", "issue: รหัส 8 ตัวจาก alphabet มีทั้งอักษร+ตัวเลข · expiresAt = now+ttl · แถวเก็บ codeHash = HMAC(\"chat-link-code:v1:\"+SESSION_SECRET, tenant:CODE) + 4 ตัวท้าย · ไม่มีรหัสดิบ/sha256 ดิบ", async (p) => {
    const t0 = Date.now();
    const r = await issue(CTX_A, { purpose: "QUEUE_TICKET", refId: `${PFX}-t1`, ttlMin: 30, connectionId: ID.c1 });
    if (r?.ok !== true) { p.push(`issue → ${desc(r)}`); return; }
    codeL1 = String(r.code); RAW_CODES.push(codeL1);
    if (!isCodeShape(codeL1)) p.push(`รูปรหัส ${js(codeL1)}`);
    const exp = new Date(r.expiresAt).getTime();
    if (!(exp >= t0 + 30 * 60_000 - 5_000 && exp <= Date.now() + 30 * 60_000 + 5_000)) p.push("expiresAt ไม่ใช่ now+30 นาที");
    const rows = (await prisma.chatLinkCode.findMany({ where: { tenantId: TA, refId: `${PFX}-t1` } })) as Any[];
    if (rows.length !== 1) { p.push(`แถว ${rows.length}`); return; }
    const row = rows[0];
    if (row.codeHash !== codeHashOf(TA, codeL1)) p.push("codeHash ไม่ตรงสูตร HMAC มีกุญแจ");
    if (row.codeHash === createHash("sha256").update(codeL1).digest("hex")) p.push("codeHash = sha256 ดิบ (ไม่มีกุญแจ)");
    if (row.codeLast4 !== codeL1.slice(-4)) p.push(`codeLast4 ${row.codeLast4}`);
    if (row.purpose !== "QUEUE_TICKET" || row.connectionId !== ID.c1 || row.usedAt !== null) p.push(`แถว ${js({ purpose: row.purpose, conn: row.connectionId === ID.c1, usedAt: row.usedAt })}`);
    if (js(row).includes(codeL1)) p.push("แถวมีรหัสดิบ");
  });
  await step("L-2", "เดาไม่ได้: 200 รหัสไม่ซ้ำ · ใช้ตัวอักษร ≥ 25 จาก 31 · ไม่มี 0 O 1 I L · ทุกตัวมีอักษร+ตัวเลข", async (p) => {
    const codes: string[] = [];
    for (let i = 0; i < 200; i++) {
      const r = await issue(CTX_A, { purpose: "APPOINTMENT", refId: `${PFX}-many`, ttlMin: 5 });
      if (r?.ok !== true) { p.push(`ครั้งที่ ${i} → ${desc(r)}`); return; }
      codes.push(String(r.code));
    }
    RAW_CODES.push(...codes);
    if (new Set(codes).size !== codes.length) p.push("มีรหัสซ้ำ");
    const chars = new Set(codes.join(""));
    if (chars.size < 25) p.push(`ใช้ตัวอักษรแค่ ${chars.size} ตัว`);
    if ([...chars].some((c) => "0O1IL".includes(c))) p.push("มีตัวกำกวม");
    const bad = codes.filter((c) => !isCodeShape(c));
    if (bad.length) p.push(`${bad.length} รหัสผิดรูป เช่น ${bad[0]}`);
  });
  await step("L-3", "validation: purpose อื่น · refId ว่าง · ttlMin 0 / 43201 / 1.5 ⇒ VALIDATION ไม่สร้างแถว", async (p) => {
    const before = await prisma.chatLinkCode.count({ where: { tenantId: TA } });
    for (const [lbl, o] of [["purpose", { purpose: "OTHER", refId: `${PFX}-v`, ttlMin: 5 }], ["refId", { purpose: "DORM_LEASE", refId: "", ttlMin: 5 }], ["ttl0", { purpose: "DORM_LEASE", refId: `${PFX}-v`, ttlMin: 0 }], ["ttlมาก", { purpose: "DORM_LEASE", refId: `${PFX}-v`, ttlMin: 43_201 }], ["ttl1.5", { purpose: "DORM_LEASE", refId: `${PFX}-v`, ttlMin: 1.5 }]] as const) {
      const r = await issue(CTX_A, o);
      if (!(r?.ok === false && r?.error === "VALIDATION")) p.push(`${lbl} → ${desc(r)}`);
    }
    if ((await prisma.chatLinkCode.count({ where: { tenantId: TA } })) !== before) p.push("มีแถวถูกสร้าง");
  });
  await step("L-4", "connectionId ของร้านอื่น / DISABLED ยังเป็นของร้าน (ok) / ไม่มีจริง ⇒ NOT_FOUND (ข้ามร้าน) ไม่สร้างแถว", async (p) => {
    const before = await prisma.chatLinkCode.count({ where: { tenantId: { in: [TA, TB] } } });
    for (const [lbl, cid] of [["ร้าน B", ID.cb], ["ไม่มีจริง", `${PFX}-nope`]] as const) {
      const r = await issue(CTX_A, { purpose: "DORM_LEASE", refId: `${PFX}-x`, ttlMin: 5, connectionId: cid });
      if (!(r?.ok === false && r?.error === "NOT_FOUND")) p.push(`${lbl} → ${desc(r)}`);
    }
    if ((await prisma.chatLinkCode.count({ where: { tenantId: { in: [TA, TB] } } })) !== before) p.push("มีแถวถูกสร้าง");
  });
  await step("L-5", "deepLink: OA มี meta.basicId ⇒ https://line.me/R/oaMessage/@svcr07a/?CODE · ไม่ส่ง connectionId ⇒ null", async (p) => {
    const r = await issue(CTX_A, { purpose: "QUEUE_TICKET", refId: `${PFX}-dl`, ttlMin: 5, connectionId: ID.c1 });
    if (r?.ok !== true) { p.push(`issue → ${desc(r)}`); return; }
    RAW_CODES.push(String(r.code));
    const want = new RegExp(`^https://line\\.me/R/oaMessage/(@|%40)svcr07a/\\?${r.code}$`);
    if (!want.test(String(r.deepLink))) p.push(`deepLink ${js(r.deepLink)}`);
    const r2 = await issue(CTX_A, { purpose: "QUEUE_TICKET", refId: `${PFX}-dl2`, ttlMin: 5 });
    if (r2?.ok !== true) p.push(`issue ไม่มี conn → ${desc(r2)}`);
    else { RAW_CODES.push(String(r2.code)); if (r2.deepLink !== null) p.push(`ไม่มี conn แต่ deepLink ${js(r2.deepLink)}`); }
  }, "MAJOR");
  await step("L-6", "consume สำเร็จ (พิมพ์ตัวเล็ก + ช่องว่าง/ขีด) ⇒ {purpose, refId, partyId จาก resolveParty} · ผู้ติดต่อผูก party · usedAt + usedByChatContactId", async (p) => {
    if (!codeL1) { p.push("ไม่มีรหัสจาก L-1"); return; }
    const typed = ` ${codeL1.slice(0, 4).toLowerCase()}-${codeL1.slice(4).toLowerCase()} `;
    const seen: Any[] = [];
    const r = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_l0, text: typed, resolveParty: async (a: Any) => { seen.push(a); return ID.pa5; } });
    if (r?.__missing || r?.__threw) { p.push(desc(r)); return; }
    if (r?.purpose !== "QUEUE_TICKET" || r?.refId !== `${PFX}-t1` || r?.partyId !== ID.pa5) p.push(`ผล ${desc(r)}`);
    if (seen.length !== 1 || seen[0]?.refId !== `${PFX}-t1`) p.push(`resolveParty ได้ ${js(seen)}`);
    const c = await prisma.chatContact.findUnique({ where: { id: ID.k_l0 } });
    if (c?.partyId !== ID.pa5) p.push(`ผู้ติดต่อ partyId ${c?.partyId}`);
    const row = await codeRow(TA, codeL1);
    if (!row?.usedAt || row?.usedByChatContactId !== ID.k_l0) p.push(`แถว usedAt/by ${js({ u: row?.usedAt, by: row?.usedByChatContactId === ID.k_l0 })}`);
  });
  await step("L-7", "ใช้ซ้ำ (คนอื่น) ⇒ null · แถวไม่เปลี่ยน", async (p) => {
    const r = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_l1, text: codeL1, resolveParty: async () => ID.pa6 });
    if (r !== null) p.push(`ผล ${desc(r)}`);
    const row = await codeRow(TA, codeL1);
    if (row?.usedByChatContactId !== ID.k_l0) p.push("usedBy เปลี่ยน");
    const c = await prisma.chatContact.findUnique({ where: { id: ID.k_l1 } });
    if (c?.partyId) p.push("คนที่สองถูกผูก");
  });
  await step("L-8", "หมดอายุ ⇒ null · ไม่ถูกใช้", async (p) => {
    const code = await mkCode({ refId: `${PFX}-exp`, connectionId: ID.c1 });
    await prisma.chatLinkCode.updateMany({ where: { tenantId: TA, codeHash: codeHashOf(TA, code) }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const r = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_l2, text: code });
    if (r !== null) p.push(`ผล ${desc(r)}`);
    if ((await codeRow(TA, code))?.usedAt) p.push("รหัสหมดอายุถูกใช้");
  });
  await step("L-9", "ข้ามร้าน: รหัสร้าน B พิมพ์ใน OA ร้าน A ⇒ null · รหัสร้าน A พิมพ์ใน OA ร้าน B ⇒ null · ทั้งคู่ไม่ถูกใช้", async (p) => {
    const codeB = await mkCode({ refId: `${PFX}-b`, purpose: "DORM_LEASE" }, CTX_B);
    const codeA = await mkCode({ refId: `${PFX}-a` });
    const r1 = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_l3, text: codeB, resolveParty: async () => ID.pa1 });
    if (r1 !== null) p.push(`B ใน A → ${desc(r1)}`);
    const r2 = await consume(CTX_B, { connectionId: ID.cb, chatContactId: ID.k_lb, text: codeA, resolveParty: async () => ID.pb });
    if (r2 !== null) p.push(`A ใน B → ${desc(r2)}`);
    const r3 = await consume(CTX_A, { connectionId: ID.cb, chatContactId: ID.k_lb, text: codeA });
    if (r3 !== null) p.push(`ctx A + OA ร้าน B → ${desc(r3)}`);
    if ((await codeRow(TB, codeB))?.usedAt) p.push("รหัส B ถูกใช้");
    if ((await codeRow(TA, codeA))?.usedAt) p.push("รหัส A ถูกใช้");
    const c3 = await prisma.chatContact.findUnique({ where: { id: ID.k_l3 } });
    if (c3?.partyId) p.push("ผู้ติดต่อร้าน A ถูกผูก");
  });
  await step("L-10", "ข้าม OA: รหัสผูก OA1 พิมพ์ใน OA2 ⇒ null · รหัสไม่ผูก OA พิมพ์ใน OA2 ⇒ ผ่าน · ผู้ติดต่อของ OA2 แต่ส่ง connectionId OA1 ⇒ null", async (p) => {
    const c1code = await mkCode({ refId: `${PFX}-oa1`, connectionId: ID.c1 });
    const r1 = await consume(CTX_A, { connectionId: ID.c2, chatContactId: ID.k_l2oa, text: c1code });
    if (r1 !== null) p.push(`OA1 code ใน OA2 → ${desc(r1)}`);
    if ((await codeRow(TA, c1code))?.usedAt) p.push("รหัส OA1 ถูกใช้");
    const free = await mkCode({ refId: `${PFX}-oaany` });
    const r3 = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_l2oa, text: free });
    if (r3 !== null) p.push(`ผู้ติดต่อ OA2 + connectionId OA1 → ${desc(r3)}`);
    const r2 = await consume(CTX_A, { connectionId: ID.c2, chatContactId: ID.k_l2oa, text: free });
    if (r2?.refId !== `${PFX}-oaany`) p.push(`รหัสไม่ผูก OA ใน OA2 → ${desc(r2)}`);
  });
  await step("L-11", "chatContactId ร้านอื่นภายใต้ ctx A ⇒ null · resolveParty คืน Party ร้านอื่น ⇒ ไม่ผูก (partyId null)", async (p) => {
    const code = await mkCode({ refId: `${PFX}-cc` });
    const r = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_lb, text: code });
    if (r !== null) p.push(`ผู้ติดต่อร้าน B → ${desc(r)}`);
    if ((await codeRow(TA, code))?.usedAt) p.push("รหัสถูกใช้โดยผู้ติดต่อร้าน B");
    const code2 = await mkCode({ refId: `${PFX}-fp` });
    const r2 = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_l4, text: code2, resolveParty: async () => ID.pb });
    if (r2 === null || r2?.partyId !== null) p.push(`Party ร้านอื่น → ${desc(r2)}`);
    const c = await prisma.chatContact.findUnique({ where: { id: ID.k_l4 } });
    if (c?.partyId) p.push(`ผู้ติดต่อถูกผูก Party ร้านอื่น`);
  });
  await step("L-12", "ผู้ติดต่อมี partyId แล้ว ⇒ ไม่ทับ · คืน partyId เดิม", async (p) => {
    const code = await mkCode({ refId: `${PFX}-pre` });
    const r = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_pre, text: code, resolveParty: async () => ID.pa6 });
    if (r?.partyId !== ID.pa10) p.push(`ผล ${desc(r)}`);
    if ((await prisma.chatContact.findUnique({ where: { id: ID.k_pre } }))?.partyId !== ID.pa10) p.push("partyId ถูกทับ");
  }, "MAJOR");
  await step("L-13", "ยิงพร้อมกัน 10 ผู้ติดต่อด้วยรหัสเดียว ⇒ สำเร็จ 1 · แถว usedBy = ผู้ชนะ · ผูก 1 คน (X3)", async (p) => {
    const code = await mkCode({ refId: `${PFX}-race`, connectionId: ID.c1 });
    const ks = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((i) => ID[`k_l${i}`]);
    const rs = await Promise.all(ks.map((k) => consume(CTX_A, { connectionId: ID.c1, chatContactId: k, text: code, resolveParty: async () => ID.pa6 })));
    const wins = rs.map((r, i) => (r && !r.__threw && !r.__missing ? ks[i] : null)).filter(Boolean);
    if (wins.length !== 1) p.push(`สำเร็จ ${wins.length} ราย (${rs.filter((r) => r?.__threw).length} โยน)`);
    const row = await codeRow(TA, code);
    if (wins.length === 1 && row?.usedByChatContactId !== wins[0]) p.push("usedBy ไม่ใช่ผู้ชนะ");
    const linked = await prisma.chatContact.count({ where: { id: { in: ks }, partyId: ID.pa6 } });
    if (linked !== 1) p.push(`ผูก ${linked} คน`);
  });
  await step("L-14", "rate limit: ผู้ติดต่อเดียวพิมพ์รหัสผิด 10 ครั้ง ⇒ ครั้งที่ 11 แม้รหัสถูกก็ null (รหัสไม่ถูกใช้) · ผู้ติดต่ออื่นยังใช้ได้", async (p) => {
    const code = await mkCode({ refId: `${PFX}-rl` });
    for (let i = 0; i < 10; i++) {
      let w = ""; do { w = Array.from({ length: 8 }, () => ALPHA[randomInt(ALPHA.length)]).join(""); } while (!isCodeShape(w) || w === code);
      await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_l15, text: w });
    }
    const r = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_l15, text: code });
    if (r !== null) p.push(`ครั้งที่ 11 → ${desc(r)}`);
    if ((await codeRow(TA, code))?.usedAt) p.push("รหัสถูกใช้ทั้งที่เกินโควตา");
    const b = await prisma.chatRateBucket.findFirst({ where: { key: `chat-link:${TA}:${ID.k_l15}` } });
    if (!b) p.push("ไม่มี bucket chat-link:<tenant>:<contact>");
    const r2 = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_free, text: code });
    if (r2?.refId !== `${PFX}-rl`) p.push(`ผู้ติดต่ออื่น → ${desc(r2)}`);
  });
  await step("L-15", "ข้อความไม่ใช่รูปรหัส (ไทย · อักษรล้วน · ยาว 9 · มี 0/O) ⇒ null · ไม่นับโควตา", async (p) => {
    for (const t of ["สวัสดีครับ", "ABCDEFGH", "ABCD12345", "ABCD1230", "HELLO", ""]) {
      const r = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_l1, text: t });
      if (r !== null) p.push(`${js(t)} → ${desc(r)}`);
    }
    const b = await prisma.chatRateBucket.findFirst({ where: { key: `chat-link:${TA}:${ID.k_l1}` } });
    if (b && b.count > 1) p.push(`นับโควตา ${b.count} (L-7 นับได้ 1)`);
  }, "MAJOR");
  await step("L-16", "SESSION_SECRET ไม่มี ⇒ issue NOT_CONFIGURED (ไม่สร้างแถว · ไม่ throw) · consume null", async (p) => {
    const code = await mkCode({ refId: `${PFX}-nk` });
    const before = await prisma.chatLinkCode.count({ where: { tenantId: TA } });
    await withEnv({ SESSION_SECRET: undefined }, async () => {
      const r = await issue(CTX_A, { purpose: "QUEUE_TICKET", refId: `${PFX}-nk2`, ttlMin: 5 });
      if (!(r?.ok === false && r?.error === "NOT_CONFIGURED")) p.push(`issue → ${desc(r)}`);
      const c = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_l2, text: code });
      if (c !== null) p.push(`consume → ${desc(c)}`);
    });
    if ((await prisma.chatLinkCode.count({ where: { tenantId: TA } })) !== before) p.push("มีแถวถูกสร้าง");
  });

  await step("L-17", "ORACLE-EDIT A1: ผู้ติดต่อผูก party อื่นอยู่แล้ว ⇒ {partyId: เดิม, resolvedPartyId: ที่ resolver ให้, partyMismatch: true} · ตรงกัน/ไม่มีของเดิม ⇒ partyMismatch false", async (p) => {
    const code = await mkCode({ refId: `${PFX}-a1x` });
    const r = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_pre, text: code, resolveParty: async () => ID.pa6 });
    if (r?.partyId !== ID.pa10 || r?.resolvedPartyId !== ID.pa6 || r?.partyMismatch !== true) p.push(`ไม่ตรงกัน → ${desc(r)}`);
    const code2 = await mkCode({ refId: `${PFX}-a1y` });
    const r2 = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_pre, text: code2, resolveParty: async () => ID.pa10 });
    if (r2?.partyId !== ID.pa10 || r2?.resolvedPartyId !== ID.pa10 || r2?.partyMismatch !== false) p.push(`ตรงกัน → ${desc(r2)}`);
    const code3 = await mkCode({ refId: `${PFX}-a1z` });
    const r3 = await consume(CTX_A, { connectionId: ID.c1, chatContactId: ID.k_l3, text: code3 });
    if (!r3 || r3.partyId !== null || r3.resolvedPartyId !== null || r3.partyMismatch !== false) p.push(`ไม่มี resolver → ${desc(r3)}`);
  });

  // ═══════════════ P ทะเบียน postback ═══════════════
  out("\n— P ทะเบียน postback —");
  const parse = (d: unknown) => callSync(PB, "parsePostbackData", d);
  await step("P-1", "parse ถูกรูป: booking.checkin?a=x&n=1 · dorm.bills · hotel.folio.view", async (p) => {
    const a = parse("booking.checkin?a=svc-r07-appt&n=1");
    if (a?.domain !== "booking" || a?.action !== "checkin" || a?.params?.a !== "svc-r07-appt" || a?.params?.n !== "1" || a?.data !== "booking.checkin?a=svc-r07-appt&n=1") p.push(`a ${desc(a)}`);
    const b = parse("dorm.bills");
    if (b?.domain !== "dorm" || b?.action !== "bills" || Object.keys(b?.params ?? { x: 1 }).length !== 0) p.push(`b ${desc(b)}`);
    const c = parse("hotel.folio.view");
    if (c?.domain !== "hotel" || c?.action !== "folio.view") p.push(`c ${desc(c)}`);
  });
  await step("P-2", "parse ปฏิเสธ: domain อื่น · ไม่มี action · ตัวใหญ่ · ยาว > 300 · __proto__/constructor/prototype · คีย์ซ้ำ · ค่า > 200 · อักขระควบคุม · ไม่ใช่ string ⇒ null · prototype ไม่ถูกแก้", async (p) => {
    const bad: unknown[] = ["evil.do", "booking", "booking.", ".checkin", "BOOKING.x", "booking.X", `booking.x?a=${"y".repeat(300)}`, "booking.x?__proto__=1", "booking.x?constructor=1", "booking.x?prototype=1", "booking.x?a=1&a=2", `booking.x?a=${"z".repeat(201)}`, "booking.x\n", "booking.x?a=1\u0000", 42, null, { data: "booking.x" }];
    for (const d of bad) { const r = parse(d); if (r !== null) p.push(`${js(d).slice(0, 40)} → ${desc(r).slice(0, 60)}`); }
    const ok = parse("booking.x?toString=1&hasOwnProperty=2");
    if (ok && Object.getPrototypeOf(ok.params) !== null) p.push("params มี prototype (ต้อง Object.create(null))");
    if (({} as Any).polluted !== undefined) p.push("Object.prototype ถูกแก้");
  });
  if (PB && Array.isArray(PB.POSTBACK_ROUTES)) {
    testRoute = {
      prefix: "booking.",
      resolveParty: async (ctx: Any, a: Any) => { TEST_ROUTE_CALLS.push({ kind: "resolve", ctx, arg: a }); return RESOLVE[a?.refId] ?? null; },
      onPostback: async (ctx: Any, evt: Any) => { TEST_ROUTE_CALLS.push({ kind: "postback", ctx, arg: evt }); if (evt?.action === "boom") throw new Error(`boom ${PHONE}`); return { text: `ok-postback-${RAND}` }; },
      onLinked: async (ctx: Any, a: Any) => { TEST_ROUTE_CALLS.push({ kind: "linked", ctx, arg: a }); return { text: `linked-ok-${RAND}` }; },
    };
    PB.POSTBACK_ROUTES.push(testRoute);
  }
  const PCTX = { tenantId: TA, connectionId: ID.c1, chatContactId: ID.k_a1, partyId: ID.pa1, replyToken: "rt-direct" };
  await step("P-3", "dispatch: route booking. ถูกเรียก 1 ครั้งด้วย ctx/evt · คืน {handled:true, reply} · domain ไม่มี route ⇒ handled:false", async (p) => {
    if (!testRoute) { p.push("ลงทะเบียน route ทดสอบไม่ได้"); return; }
    const n0 = TEST_ROUTE_CALLS.length;
    const r = await call(PB, "dispatchPostback", PCTX, "booking.checkin?a=svc-r07-x");
    if (r?.handled !== true || r?.reply?.text !== `ok-postback-${RAND}`) p.push(`ผล ${desc(r)}`);
    const got = TEST_ROUTE_CALLS.slice(n0).filter((c) => c.kind === "postback");
    if (got.length !== 1 || got[0]?.ctx?.tenantId !== TA || got[0]?.arg?.action !== "checkin" || got[0]?.arg?.params?.a !== "svc-r07-x") p.push(`handler ได้ ${js(got).slice(0, 120)}`);
    const r2 = await call(PB, "dispatchPostback", PCTX, "hotel.folio");
    if (r2?.handled !== false) p.push(`hotel (ไม่มี route) → ${desc(r2)}`);
    const r3 = await call(PB, "dispatchPostback", PCTX, "evil.x");
    if (r3?.handled !== false) p.push(`ผิดรูป → ${desc(r3)}`);
  });
  await step("P-4", "handler throw ⇒ {handled:false} ไม่ throw ออก · ข้อความ error ไม่ถูก log", async (p) => {
    if (!testRoute) { p.push("ไม่มี route ทดสอบ"); return; }
    const c0 = CAPTURED.length;
    const r = await call(PB, "dispatchPostback", PCTX, "booking.boom");
    if (r?.__threw) p.push(`โยนออก ${r.message}`);
    else if (r?.handled !== false) p.push(`ผล ${desc(r)}`);
    if (CAPTURED.slice(c0).some((l) => l.includes(PHONE))) p.push("log มีข้อความ error ดิบ (เบอร์)");
  });
  await step("P-5", "handleLinkCodeText: ไม่ใช่รหัส ⇒ matched:false · รหัสถูก ⇒ resolveParty ของ route ตาม purpose + onLinked + reply ของ route", async (p) => {
    if (!testRoute) { p.push("ไม่มี route ทดสอบ"); return; }
    const r0 = await call(PB, "handleLinkCodeText", { tenantId: TA, connectionId: ID.c1, chatContactId: ID.k_l1, replyToken: null }, "สวัสดี");
    if (r0?.matched !== false || r0?.linked !== false) p.push(`ไม่ใช่รหัส → ${desc(r0)}`);
    const code = await mkCode({ refId: `${PFX}-p5`, purpose: "APPOINTMENT" });
    RESOLVE[`${PFX}-p5`] = ID.pa6;
    const n0 = TEST_ROUTE_CALLS.length;
    const r = await call(PB, "handleLinkCodeText", { tenantId: TA, connectionId: ID.c1, chatContactId: ID.k_l2, replyToken: null }, code);
    if (r?.matched !== true || r?.linked !== true || r?.reply?.text !== `linked-ok-${RAND}`) p.push(`ผล ${desc(r)}`);
    const linked = TEST_ROUTE_CALLS.slice(n0).find((c) => c.kind === "linked");
    if (linked?.arg?.partyId !== ID.pa6 || linked?.arg?.purpose !== "APPOINTMENT" || linked?.arg?.refId !== `${PFX}-p5`) p.push(`onLinked ได้ ${js(linked?.arg)}`);
    if ((await prisma.chatContact.findUnique({ where: { id: ID.k_l2 } }))?.partyId !== ID.pa6) p.push("ผู้ติดต่อไม่ถูกผูก");
  });

  await step("P-6", "ORACLE-EDIT A2: คอมเมนต์สัญญาใน postback-routes บังคับตัวจัดการตรวจ ref เป็นของ ctx.tenantId และลูกค้าที่กด (partyId/chatContactId) · ห้ามอ่าน tenant จาก params", async (p) => {
    const cm = read(FILES.postback).split("\n").filter((l) => /^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    if (!/ctx\.tenantId/.test(cm)) p.push("คอมเมนต์ไม่อ้าง ctx.tenantId");
    if (!/(partyId|chatContactId)/.test(cm)) p.push("คอมเมนต์ไม่อ้าง partyId/chatContactId");
    if (!/params/.test(cm)) p.push("คอมเมนต์ไม่ห้ามอ่าน tenant จาก params");
  }, "MINOR");

  // ═══════════════ X Flex ═══════════════
  out("\n— X Flex —");
  const flex = (ctx: Any, o: Any) => call(CHAT, "pushFlexToParty", ctx, { altText: "svc-r07 alt", contents: BUBBLE, ...o });
  await step("X-1", "pushFlexToParty(OA1) ⇒ ok · ตัวจำลองได้ push 1 ครั้ง Bearer OA1 ถึง userId ของผู้ติดต่อ OA1 · messages[0] = flex + altText + contents ตรง", async (p) => {
    const m = mark();
    const r = await flex(CTX_A, { partyId: ID.pa1, connectionId: ID.c1 });
    if (r?.ok !== true) { p.push(`ผล ${desc(r)}`); return; }
    const ps = pushes(since(m));
    if (ps.length !== 1) p.push(`push ${ps.length} ครั้ง`);
    const q = ps[0];
    if (q?.auth !== `Bearer ${TOK.c1}`) p.push("Authorization ไม่ใช่โทเคน OA1");
    if (q?.json?.to !== EXT.a1) p.push(`to ${q?.json?.to}`);
    const msg = q?.json?.messages?.[0];
    if (msg?.type !== "flex" || msg?.altText !== "svc-r07 alt" || js(msg?.contents) !== js(BUBBLE)) p.push(`message ${js(msg).slice(0, 120)}`);
  });
  await step("X-2", "Flex ถึงคนที่ผูก OA นั้นเท่านั้น: party ผูก OA1 · สั่งส่ง OA2 ⇒ NO_LINE_IDENTITY ไม่มีคำขอใด · party ผูกเฉพาะ OA2 สั่ง OA1 ⇒ NO_LINE_IDENTITY", async (p) => {
    const m = mark();
    const r = await flex(CTX_A, { partyId: ID.pa1, connectionId: ID.c2 });
    if (!(r?.ok === false && r?.code === "NO_LINE_IDENTITY")) p.push(`pa1→OA2 ${desc(r)}`);
    const r2 = await flex(CTX_A, { partyId: ID.pa4, connectionId: ID.c1 });
    if (!(r2?.ok === false && r2?.code === "NO_LINE_IDENTITY")) p.push(`pa4→OA1 ${desc(r2)}`);
    if (pushes(since(m)).length) p.push(`มี push ${pushes(since(m)).length} ครั้ง`);
  });
  await step("X-3", "ไม่ระบุ OA ⇒ ผู้ติดต่อล่าสุด ส่งด้วย OA ของผู้ติดต่อนั้น (pa4 → OA2 · Bearer OA2)", async (p) => {
    const m = mark();
    const r = await flex(CTX_A, { partyId: ID.pa4 });
    if (r?.ok !== true) { p.push(`ผล ${desc(r)}`); return; }
    const ps = pushes(since(m));
    if (ps.length !== 1 || ps[0]?.auth !== `Bearer ${TOK.c2}` || ps[0]?.json?.to !== EXT.a1old) p.push(`push ${js(ps.map((x) => ({ a: x.auth === `Bearer ${TOK.c2}`, to: x.json?.to })))}`);
  }, "MAJOR");
  await step("X-4", "ข้ามร้าน: Party ร้าน B ใต้ ctx A ⇒ NO_LINE_IDENTITY · OA ร้าน B ใต้ ctx A ⇒ NO_CONNECTION · ไม่มีคำขอด้วยโทเคนร้าน B", async (p) => {
    const m = mark();
    const r = await flex(CTX_A, { partyId: ID.pb });
    if (!(r?.ok === false && r?.code === "NO_LINE_IDENTITY")) p.push(`party B ${desc(r)}`);
    const r2 = await flex(CTX_A, { partyId: ID.pa1, connectionId: ID.cb });
    if (!(r2?.ok === false && r2?.code === "NO_CONNECTION")) p.push(`OA B ${desc(r2)}`);
    const r3 = await flex(CTX_A, { partyId: ID.pb, connectionId: ID.cb });
    if (r3?.ok !== false) p.push(`party B + OA B ใต้ ctx A ${desc(r3)}`);
    if (since(m).length) p.push(`ตัวจำลองได้รับ ${since(m).length} คำขอ`);
  });
  await step("X-5", "ผู้ติดต่อถูกบล็อก ⇒ NO_LINE_IDENTITY · OA DISABLED ⇒ NO_CONNECTION · ไม่ยิง", async (p) => {
    const m = mark();
    const r = await flex(CTX_A, { partyId: ID.pa3, connectionId: ID.c1 });
    if (!(r?.ok === false && r?.code === "NO_LINE_IDENTITY")) p.push(`บล็อก ${desc(r)}`);
    const r2 = await flex(CTX_A, { partyId: ID.pa1, connectionId: ID.cd });
    if (!(r2?.ok === false && r2?.code === "NO_CONNECTION")) p.push(`DISABLED ${desc(r2)}`);
    if (since(m).length) p.push("มีคำขอถึงตัวจำลอง");
  });
  await step("X-6", "validation: altText ว่าง / 401 ตัว · contents ไม่ใช่ bubble/carousel / null ⇒ VALIDATION ไม่ยิง", async (p) => {
    const m = mark();
    for (const [lbl, o] of [["alt ว่าง", { altText: "" }], ["alt 401", { altText: "ก".repeat(401) }], ["contents text", { contents: { type: "text", text: "x" } }], ["contents null", { contents: null }]] as const) {
      const r = await flex(CTX_A, { partyId: ID.pa1, connectionId: ID.c1, ...o });
      if (!(r?.ok === false && r?.code === "VALIDATION")) p.push(`${lbl} → ${desc(r)}`);
    }
    if (since(m).length) p.push("มีคำขอถึงตัวจำลอง");
  });
  await step("X-7", "LINE ตอบ 500 ⇒ SEND_FAILED ไม่ throw · reason ไม่มีโทเคน/เนื้อ response", async (p) => {
    const r = await flex(CTX_A, { partyId: ID.pa9, connectionId: ID.c1 });
    if (!(r?.ok === false && r?.code === "SEND_FAILED")) p.push(`ผล ${desc(r)}`);
    if (leaks(r).length || /fake failure/.test(js(r))) p.push("reason มีโทเคน/เนื้อ response ดิบ");
  });
  await step("X-8", "replyFlex: OA1 ⇒ reply ด้วย replyToken + Bearer OA1 · OA ร้าน B ใต้ ctx A ⇒ NO_CONNECTION ไม่ยิง", async (p) => {
    const m = mark();
    const r = await call(CHAT, "replyFlex", CTX_A, { replyToken: `rt-x8-${RAND}`, connectionId: ID.c1, altText: "x8", contents: BUBBLE });
    if (r?.ok !== true) p.push(`OA1 ${desc(r)}`);
    const rp = since(m).filter((x) => x.path === "/v2/bot/message/reply");
    if (rp.length !== 1 || rp[0]?.auth !== `Bearer ${TOK.c1}` || rp[0]?.json?.replyToken !== `rt-x8-${RAND}` || rp[0]?.json?.messages?.[0]?.type !== "flex") p.push(`reply ${js(rp.map((x) => x.json)).slice(0, 120)}`);
    const m2 = mark();
    const r2 = await call(CHAT, "replyFlex", CTX_A, { replyToken: `rt-x8b-${RAND}`, connectionId: ID.cb, altText: "x8", contents: BUBBLE });
    if (!(r2?.ok === false && r2?.code === "NO_CONNECTION")) p.push(`OA B ${desc(r2)}`);
    if (since(m2).length) p.push("ยิงด้วย OA ร้าน B");
  });

  // ═══════════════ R rich menu ═══════════════
  out("\n— R rich menu —");
  const rich = (ctx: Any, cid: string, spec: Any, opts?: Any) => call(CHAT, "syncRichMenu", ctx, cid, spec, opts);
  let rm1 = "";
  await step("R-1", "syncRichMenu ⇒ create (JSON size/areas/postback) → content (image/png ไบต์ครบ) → user/all · Bearer OA1 · จด meta.richMenu", async (p) => {
    const m = mark();
    const r = await rich(CTX_A, ID.c1, SPEC("a"));
    if (r?.ok !== true || typeof r?.richMenuId !== "string") { p.push(`ผล ${desc(r)}`); return; }
    rm1 = r.richMenuId;
    if (r.created !== true) p.push("created ไม่ใช่ true");
    const rs = withTok(since(m), TOK.c1);
    const cr = rs.find((x) => x.method === "POST" && x.path === "/v2/bot/richmenu");
    if (!cr || cr.json?.size?.height !== 843 || cr.json?.chatBarText !== "เมนูหอ" || cr.json?.areas?.[0]?.action?.data !== "dorm.bills") p.push(`create ${js(cr?.json).slice(0, 120)}`);
    const ct = rs.find((x) => x.method === "POST" && x.path === `/v2/bot/richmenu/${rm1}/content`);
    if (!ct || !ct.ctype.startsWith("image/png") || ct.bytes !== PNG.length) p.push(`content ${js(ct ? { c: ct.ctype, b: ct.bytes } : null)}`);
    if (!rs.some((x) => x.method === "POST" && x.path === `/v2/bot/user/all/richmenu/${rm1}`)) p.push("ไม่ตั้งเป็นค่าเริ่ม");
    if (since(m).some((x) => x.auth !== `Bearer ${TOK.c1}`)) p.push("มีคำขอด้วยโทเคนอื่น");
    const conn = await prisma.chatChannelConnection.findUnique({ where: { id: ID.c1 } });
    if ((conn?.meta as Any)?.richMenu?.id !== rm1) p.push(`meta.richMenu ${js((conn?.meta as Any)?.richMenu)}`);
    if ((conn?.meta as Any)?.basicId !== "@svcr07a") p.push("ORACLE-EDIT B8: meta คีย์อื่น (basicId) ถูกทับ");
  });
  await step("R-2", "spec เดิม ⇒ created:false · ไม่มี POST /richmenu ใหม่ (idempotent)", async (p) => {
    const m = mark();
    const r = await rich(CTX_A, ID.c1, SPEC("a"));
    if (r?.ok !== true || r?.richMenuId !== rm1 || r?.created !== false) p.push(`ผล ${desc(r)}`);
    if (since(m).some((x) => x.method === "POST" && x.path === "/v2/bot/richmenu")) p.push("สร้างใหม่ซ้ำ");
    if (!withTok(since(m), TOK.c1).some((x) => x.method === "POST" && x.path === `/v2/bot/user/all/richmenu/${rm1}`)) p.push("ORACLE-EDIT B8: hash ตรงแต่ไม่ตั้งค่าเริ่มซ้ำ");
  }, "MAJOR");
  await step("R-3", "spec เปลี่ยน ⇒ สร้างใหม่ + ตั้งค่าเริ่ม + DELETE ของเก่า", async (p) => {
    const m = mark();
    const r = await rich(CTX_A, ID.c1, SPEC("b"));
    if (r?.ok !== true || r?.created !== true || r?.richMenuId === rm1) { p.push(`ผล ${desc(r)}`); return; }
    const rs = since(m);
    if (!rs.some((x) => x.method === "POST" && x.path === `/v2/bot/user/all/richmenu/${r.richMenuId}`)) p.push("ไม่ตั้งค่าเริ่มตัวใหม่");
    if (!rs.some((x) => x.method === "DELETE" && x.path === `/v2/bot/richmenu/${rm1}`)) p.push("ไม่ลบตัวเก่า");
  }, "MAJOR");
  await step("R-4", "ข้ามร้าน: OA ร้าน B ใต้ ctx A ⇒ NO_CONNECTION ไม่มีคำขอ · OA DISABLED ⇒ NO_CONNECTION", async (p) => {
    const m = mark();
    const r = await rich(CTX_A, ID.cb, SPEC("c"));
    if (!(r?.ok === false && r?.code === "NO_CONNECTION")) p.push(`OA B ${desc(r)}`);
    const r2 = await rich(CTX_A, ID.cd, SPEC("c"));
    if (!(r2?.ok === false && r2?.code === "NO_CONNECTION")) p.push(`DISABLED ${desc(r2)}`);
    if (since(m).length) p.push(`มีคำขอ ${since(m).length}`);
  });
  await step("R-5", "validation (ไม่ยิงเลย): width 3000 · ratio < 1.45 · areas 0 / 21 · postback ผิดรูป/ยาว > 300 · uri http · bounds นอกกรอบ · chatBarText 15 ตัว · รูป gif / ว่าง / > 1 MB", async (p) => {
    const m = mark();
    const area = (action: Any, b: Any = { x: 0, y: 0, width: 100, height: 100 }) => ({ bounds: b, action });
    const bads: [string, Any][] = [
      ["width", SPEC("v", { size: { width: 3000, height: 1686 } })],
      ["ratio", SPEC("v", { size: { width: 1200, height: 1000 } })],
      ["areas0", SPEC("v", { areas: [] })],
      ["areas21", SPEC("v", { areas: Array.from({ length: 21 }, () => area({ type: "postback", data: "dorm.bills" })) })],
      ["pb ผิดรูป", SPEC("v", { areas: [area({ type: "postback", data: "evil.x" })] })],
      ["pb ยาว", SPEC("v", { areas: [area({ type: "postback", data: `dorm.bills?a=${"x".repeat(300)}` })] })],
      ["uri http", SPEC("v", { areas: [area({ type: "uri", uri: "http://example.com" })] })],
      ["bounds", SPEC("v", { areas: [area({ type: "postback", data: "dorm.bills" }, { x: 2400, y: 0, width: 200, height: 100 })] })],
      ["chatBar", SPEC("v", { chatBarText: "๑๒๓๔๕๖๗๘๙๐๑๒๓๔๕" })],
      ["gif", SPEC("v", { image: { contentType: "image/gif", data: new Uint8Array(PNG) } })],
      ["รูปว่าง", SPEC("v", { image: { contentType: "image/png", data: new Uint8Array(0) } })],
      ["รูปใหญ่", SPEC("v", { image: { contentType: "image/png", data: new Uint8Array(1_048_577) } })],
    ];
    for (const [lbl, s] of bads) { const r = await rich(CTX_A, ID.c1, s); if (!(r?.ok === false && r?.code === "VALIDATION")) p.push(`${lbl} → ${desc(r).slice(0, 60)}`); }
    if (since(m).length) p.push(`มีคำขอ ${since(m).length}`);
  });
  await step("R-6", "ผูกรายคน: chatContactIds [ผู้ติดต่อ OA1, ผู้ติดต่อ OA2, ผู้ติดต่อร้าน B] ⇒ ผูกเฉพาะผู้ติดต่อ OA1", async (p) => {
    const m = mark();
    const r = await rich(CTX_A, ID.c1, SPEC("d"), { chatContactIds: [ID.k_a1, ID.k_a1old, ID.k_b1] });
    if (r?.ok !== true) { p.push(`ผล ${desc(r)}`); return; }
    // ORACLE-EDIT B8: ผูกรายคนผ่าน POST /v2/bot/richmenu/bulk/link {richMenuId, userIds}
    const bulk = withTok(since(m), TOK.c1).filter((x) => x.method === "POST" && x.path === "/v2/bot/richmenu/bulk/link");
    const users = bulk.flatMap((x) => (Array.isArray(x.json?.userIds) ? x.json.userIds : []));
    if (bulk.length !== 1 || bulk[0]?.json?.richMenuId !== r.richMenuId || users.length !== 1 || users[0] !== EXT.a1) p.push(`bulk ${js(bulk.map((x) => x.json))}`);
    if (since(m).some((x) => x.method === "POST" && /^\/v2\/bot\/user\/U[^/]*\/richmenu\//.test(x.path))) p.push("ยังผูกทีละคน");
  }, "MAJOR");

  // ═══════════════ N notifyCustomer ═══════════════
  out("\n— N notifyCustomer —");
  await step("N-1", "หอ (OA1) · party ผูก OA1 · 10:00 ⇒ {LINE, SENT} · push Bearer OA1 ถึงผู้ติดต่อ · ข้อความจากแม่แบบ rooms.msg.roomLink ครบตัวแปร · webLink /q/… · log 1 แถวตรงคีย์ ไม่มีเบอร์/ชื่อ", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n1"), link: LINK("n1") });
    if (r?.channel !== "LINE" || r?.status !== "SENT") p.push(`ผล ${desc(r)}`);
    const ps = pushes(since(m));
    if (ps.length !== 1 || ps[0]?.auth !== `Bearer ${TOK.c1}` || ps[0]?.json?.to !== EXT.a1) p.push(`push ${ps.length} · ${js(ps.map((x) => x.json?.to))}`);
    const t = msgText(ps[0]);
    if (!t.includes("305") || !t.includes("ZZ99") || !t.includes("หอทดสอบ") || /[{}]/.test(t)) p.push(`ข้อความ ${js(t).slice(0, 100)}`);
    if (typeof r?.webLink !== "string" || !r.webLink.startsWith("/q/")) p.push(`webLink ${js(r?.webLink)}`);
    if (!UUID_RE.test(ps[0]?.retryKey ?? "")) p.push(`ORACLE-EDIT B1: ไม่มี X-Line-Retry-Key รูป UUID (${js(ps[0]?.retryKey)})`);
    const rows = await logOf(DK("n1"));
    if (rows.length !== 1) { p.push(`log ${rows.length} แถว`); return; }
    const row = rows[0];
    if (row.tenantId !== TA || row.unitId !== U.dorm || row.domain !== "rooms" || row.messageKey !== "roomLink" || row.channel !== "LINE" || row.status !== "SENT" || row.partyId !== ID.pa1) p.push(`log ${js({ ...row, id: undefined }).slice(0, 160)}`);
    if (leaks(row, PII).length) p.push("log มีเบอร์/ชื่อ");
  });
  await step("N-2", "ส่งซ้ำ dedupeKey เดิม ⇒ ไม่ส่ง · {duplicate:true, status SENT} · log ยัง 1 แถว (X4)", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n1"), link: LINK("n1") });
    if (r?.duplicate !== true || r?.status !== "SENT") p.push(`ผล ${desc(r)}`);
    if (typeof r?.webLink !== "string" || !r.webLink.startsWith("/q/")) p.push(`ORACLE-EDIT B5: duplicate ไม่คืน webLink (${js(r?.webLink)})`);
    if (pushes(since(m)).length) p.push("ส่งซ้ำ");
    if ((await logOf(DK("n1"))).length !== 1) p.push("log เกิน 1");
  });
  await step("N-3", "ยิงพร้อมกัน 10 ทาง dedupeKey ใหม่ ⇒ push จริง 1 ครั้ง · log 1 แถว SENT (X4/X5)", async (p) => {
    const m = mark();
    const rs = await Promise.all(Array.from({ length: 10 }, () => notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n3") })));
    if (rs.some((r) => r?.__threw || r?.__missing)) p.push(`โยน/ไม่มี ${rs.filter((r) => r?.__threw).length}`);
    const n = pushes(since(m)).length;
    if (n !== 1) p.push(`push ${n} ครั้ง`);
    const rows = await logOf(DK("n3"));
    if (rows.length !== 1 || rows[0]?.status !== "SENT") p.push(`log ${js(rows.map((x) => x.status))}`);
  });
  await step("N-4", "ถ้อยคำตามค่าตั้ง: override ระดับหน่วย ⇒ ข้อความตรงทุกตัวอักษร · ลูกค้าภาษาอังกฤษได้ข้อความ en", async (p) => {
    await svSet("rooms.msg.roomLink", U.dorm, { th: "QC-OVR {roomNo} svc-r07", en: "QC-OVR-EN {roomNo}" });
    try {
      const m = mark();
      const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n4th") });
      if (r?.status !== "SENT") p.push(`th ${desc(r)}`);
      const t = msgText(pushes(since(m))[0]);
      if (t !== "QC-OVR 305 svc-r07") p.push(`th ข้อความ ${js(t)}`);
      const m2 = mark();
      const r2 = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa2, dedupeKey: DK("n4en") });
      if (r2?.status !== "SENT") p.push(`en ${desc(r2)}`);
      const t2 = msgText(pushes(since(m2))[0]);
      if (t2 !== "QC-OVR-EN 305") p.push(`en ข้อความ ${js(t2)}`);
    } finally { await svClear("rooms.msg.roomLink", U.dorm); }
  });
  await step("N-5", "OA ของหน่วย = OA2 แต่ลูกค้าผูก OA1 ⇒ ไม่ส่ง LINE (ไม่ใช้ OA อื่น) · {NONE, NO_CHANNEL, webLink} · webLink verify ได้ร้าน A + subject", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.massage, partyId: ID.pa1, dedupeKey: DK("n5"), link: LINK("n5") });
    if (r?.channel !== "NONE" || r?.status !== "NO_CHANNEL") p.push(`ผล ${desc(r)}`);
    if (pushes(since(m)).length) p.push("มี push");
    const tok = typeof r?.webLink === "string" ? r.webLink.slice(3) : "";
    const v = tok ? callSync(SL, "verifyLink", tok, "svc.r07") : null;
    if (v?.tenantId !== TA || v?.subjectId !== "svc-r07-n5") p.push(`webLink verify ${desc(v)} (${js(r?.webLink).slice(0, 40)})`);
    const rows = await logOf(DK("n5"));
    if (rows.length !== 1 || rows[0]?.status !== "NO_CHANNEL" || rows[0]?.channel !== "NONE") p.push(`log ${js(rows.map((x) => [x.channel, x.status]))}`);
  });
  await step("N-6", "ร้านไม่มี OA (หน่วยไม่ได้ตั้ง lineConnectionId) ⇒ ลิงก์เว็บ {NONE, NO_CHANNEL, webLink} · ไม่มีคำขอ LINE", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.barber, partyId: ID.pa1, dedupeKey: DK("n6"), link: LINK("n6") });
    if (r?.channel !== "NONE" || r?.status !== "NO_CHANNEL" || typeof r?.webLink !== "string") p.push(`ผล ${desc(r)}`);
    if (since(m).length) p.push("มีคำขอถึงตัวจำลอง");
  });
  await step("N-7", "ข้ามร้าน: lineConnectionId ของหน่วยชี้ OA ร้าน B + ลำดับ [LINE] ⇒ NO_CHANNEL ไม่ยิงด้วยโทเคนร้าน B (ทั้ง partyId และ chatContactId ร้าน B) · ไม่มี WEB_LINK ⇒ ไม่มี webLink", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.hotel, partyId: ID.pa1, dedupeKey: DK("n7a"), link: LINK("n7") });
    if (r?.status !== "NO_CHANNEL" || (r?.webLink !== undefined && r?.webLink !== null)) p.push(`partyA ${desc(r)}`);
    const r2 = await notify(CTX_A, { unitId: U.hotel, chatContactId: ID.k_b1, dedupeKey: DK("n7b") });
    if (r2?.status !== "NO_CHANNEL") p.push(`contactB ${desc(r2)}`);
    const r3 = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pb, dedupeKey: DK("n7c") });
    if (r3?.status !== "NO_CHANNEL") p.push(`partyB ${desc(r3)}`);
    const r4 = await notify(CTX_A, { unitId: U.dorm, chatContactId: ID.k_b1, dedupeKey: DK("n7d") });
    if (r4?.status !== "NO_CHANNEL") p.push(`contactB@dorm ${desc(r4)}`);
    if (withTok(since(m), TOK.cb).length) p.push("ยิงด้วยโทเคนร้าน B");
    if (pushes(since(m)).length) p.push(`มี push ${pushes(since(m)).length}`);
  });
  await step("N-8", "หน่วยของร้านอื่นใต้ ctx A ⇒ {NONE, FAILED, error NOT_FOUND} · ไม่มี log · ไม่ยิง", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: UB_BARBER, partyId: ID.pa1, dedupeKey: DK("n8") });
    if (!(r?.error === "NOT_FOUND" && r?.status === "FAILED" && r?.channel === "NONE")) p.push(`ผล ${desc(r)}`);
    if ((await logOf(DK("n8"))).length) p.push("มี log");
    if (since(m).length) p.push("มีคำขอ");
  });
  await step("N-9", "เวลาเงียบ (22:30 ไทย · ค่าเริ่ม 21:00–08:00) ⇒ SKIPPED_QUIET ไม่ส่ง · retryAt = 08:00 วันถัดไป · ส่งซ้ำ key เดิม 08:30 ⇒ SENT · log แถวเดียวเปลี่ยนเป็น SENT", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n9"), at: AT_QUIET, link: LINK("n9") });
    if (r?.status !== "SKIPPED_QUIET") p.push(`22:30 ${desc(r)}`);
    if (typeof r?.webLink !== "string") p.push("ORACLE-EDIT B5: SKIPPED_QUIET ไม่คืน webLink");
    if (!r?.retryAt || new Date(r.retryAt).getTime() !== RETRY_EXPECT.getTime()) p.push(`retryAt ${js(r?.retryAt)} (คาด ${RETRY_EXPECT.toISOString()})`);
    if (pushes(since(m)).length) p.push("ส่งในเวลาเงียบ");
    const rows0 = await logOf(DK("n9"));
    if (rows0.length !== 1 || rows0[0]?.status !== "SKIPPED_QUIET") p.push(`log ${js(rows0.map((x) => x.status))}`);
    const m2 = mark();
    const r2 = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n9"), at: AT_AFTER });
    if (r2?.status !== "SENT") p.push(`08:30 ${desc(r2)}`);
    if (pushes(since(m2)).length !== 1) p.push(`08:30 push ${pushes(since(m2)).length}`);
    const rows = await logOf(DK("n9"));
    if (rows.length !== 1 || rows[0]?.status !== "SENT") p.push(`log หลังลองใหม่ ${js(rows.map((x) => x.status))}`);
  });
  await step("N-10", "bypassQuiet (ถึงคิว/ใบเสร็จ) 22:30 ⇒ SENT", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n10"), at: AT_QUIET, bypassQuiet: true });
    if (r?.status !== "SENT" || pushes(since(m)).length !== 1) p.push(`ผล ${desc(r)} · push ${pushes(since(m)).length}`);
  });
  await step("N-11", "optOut: ผู้ติดต่อถูกบล็อก ⇒ SKIPPED_CONSENT · เพิกถอนยินยอม LINE ชัดแจ้ง ⇒ SKIPPED_CONSENT · ไม่ส่งทั้งคู่ · webLink ยังคืน", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa3, dedupeKey: DK("n11a"), link: LINK("n11") });
    if (r?.status !== "SKIPPED_CONSENT" || typeof r?.webLink !== "string") p.push(`บล็อก ${desc(r)}`);
    const r2 = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa7, dedupeKey: DK("n11b") });
    if (r2?.status !== "SKIPPED_CONSENT") p.push(`เพิกถอน ${desc(r2)}`);
    if (pushes(since(m)).length) p.push("มี push");
    const rows = await logOf(DK("n11b"));
    if (rows[0]?.status !== "SKIPPED_CONSENT") p.push(`log ${js(rows.map((x) => x.status))}`);
  });
  await step("N-12", "control ยินยอม: ไม่เคยให้ยินยอมการตลาด (granted=false · ไม่เพิกถอน) ⇒ ข้อความบริการยังส่ง SENT", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa8, dedupeKey: DK("n12") });
    if (r?.status !== "SENT" || pushes(since(m)).length !== 1 || pushes(since(m))[0]?.json?.to !== EXT.a8) p.push(`ผล ${desc(r)}`);
  });
  await step("N-13", "LINE ตอบ 500 ⇒ {status FAILED} ไม่ throw · log FAILED · ส่งซ้ำ key เดิมได้ (ลองใหม่ ไม่ใช่ duplicate)", async (p) => {
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa9, dedupeKey: DK("n13") });
    if (r?.__threw || r?.status !== "FAILED") p.push(`ผล ${desc(r)}`);
    const rows = await logOf(DK("n13"));
    if (rows.length !== 1 || rows[0]?.status !== "FAILED") p.push(`log ${js(rows.map((x) => x.status))}`);
    const m = mark();
    const r2 = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa9, dedupeKey: DK("n13") });
    if (r2?.duplicate === true) p.push("FAILED ถูกนับเป็น duplicate");
    if (pushes(since(m)).length !== 1) p.push(`ลองใหม่ push ${pushes(since(m)).length}`);
    if ((await logOf(DK("n13"))).length !== 1) p.push("log เกิน 1 แถว");
  }, "MAJOR");
  await step("N-14", "chatContactId (ไม่มี party) ⇒ ส่งถึงผู้ติดต่อนั้นบน OA ของหน่วย · log partyId null", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.dorm, chatContactId: ID.k_free, dedupeKey: DK("n14") });
    if (r?.status !== "SENT" || pushes(since(m))[0]?.json?.to !== EXT.free) p.push(`ผล ${desc(r)}`);
    const rows = await logOf(DK("n14"));
    if (rows[0]?.partyId !== null) p.push(`log partyId ${rows[0]?.partyId}`);
  }, "MAJOR");
  await step("N-15", "ปุ่ม ⇒ ส่ง flex ที่มี action postback data + uri ตามที่ให้ (altText = ข้อความ)", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n15"), buttons: [{ label: "เช็กอิน", kind: "postback", data: "booking.checkin?a=svc-r07-n15" }, { label: "ดูบิล", kind: "uri", data: "https://example.com/svc-r07-bill" }] });
    if (r?.status !== "SENT") p.push(`ผล ${desc(r)}`);
    const msg = pushes(since(m))[0]?.json?.messages?.[0];
    const s = js(msg);
    if (msg?.type !== "flex" || !s.includes("booking.checkin?a=svc-r07-n15") || !s.includes("https://example.com/svc-r07-bill") || !String(msg?.altText ?? "").includes("305")) p.push(`message ${s.slice(0, 160)}`);
  }, "MAJOR");
  await step("N-16", "validation (ไม่มี log · ไม่ส่ง): แม่แบบไม่มี (booking.reminder ยังไม่มี defs · rooms.nope) · dedupeKey มีเบอร์ / ภาษาไทย / ช่องว่าง / ว่าง / 201 ตัว · link.path ผิดรูป ⇒ error VALIDATION", async (p) => {
    const m = mark();
    const cases: [string, Any][] = [
      ["booking.reminder", { domain: "booking", messageKey: "reminder", dedupeKey: DK("v1") }],
      ["rooms.nope", { messageKey: "nope", dedupeKey: DK("v2") }],
      ["key เบอร์", { dedupeKey: `svc-r07:${RAND}:${PHONE}` }],
      ["key +66", { dedupeKey: `svc-r07:${RAND}:+66${PHONE.slice(1)}` }],
      ["key ไทย", { dedupeKey: `svc-r07:${RAND}:สมชาย` }],
      ["key ช่องว่าง", { dedupeKey: `svc-r07:${RAND}: x` }],
      ["key ว่าง", { dedupeKey: "" }],
      ["key 201", { dedupeKey: `svc-r07:${"a".repeat(193)}` }],
      ["path", { dedupeKey: DK("v3"), link: { ...LINK("v3"), path: "https://evil.example/" } }],
    ];
    for (const [lbl, o] of cases) {
      const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, ...o });
      if (!(r?.error === "VALIDATION" && r?.status === "FAILED")) p.push(`${lbl} → ${desc(r).slice(0, 60)}`);
    }
    if (pushes(since(m)).length) p.push("มี push");
    const n = await prisma.serviceMessageLog.count({ where: { tenantId: TA, OR: [{ dedupeKey: { contains: PHONE.slice(1) } }, { dedupeKey: { in: [DK("v1"), DK("v2"), DK("v3")] } }] } });
    if (n) p.push(`มี log ${n} แถว`);
  });
  await step("N-17", "ลำดับช่องทาง [WEB_LINK] อย่างเดียว ⇒ ไม่ส่ง LINE แม้ผูกแล้ว · webLink", async (p) => {
    await svSet("messaging.channelOrder", U.dorm, ["WEB_LINK"]);
    try {
      const m = mark();
      const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n17"), link: LINK("n17") });
      if (r?.status !== "NO_CHANNEL" || typeof r?.webLink !== "string") p.push(`ผล ${desc(r)}`);
      if (pushes(since(m)).length) p.push("ส่ง LINE");
    } finally { await svClear("messaging.channelOrder", U.dorm); }
  }, "MAJOR");

  await step("N-18", "ORACLE-EDIT A5: ส่งทั้ง chatContactId และ partyId ที่ไม่ตรงกัน ⇒ VALIDATION ไม่ log ไม่ส่ง · ตรงกัน ⇒ SENT", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.dorm, chatContactId: ID.k_a1, partyId: ID.pa2, dedupeKey: DK("n18a") });
    if (!(r?.error === "VALIDATION" && r?.status === "FAILED")) p.push(`ไม่ตรง → ${desc(r)}`);
    if ((await logOf(DK("n18a"))).length) p.push("มี log");
    if (pushes(since(m)).length) p.push("มี push");
    const r2 = await notify(CTX_A, { unitId: U.dorm, chatContactId: ID.k_a1, partyId: ID.pa1, dedupeKey: DK("n18b") });
    if (r2?.status !== "SENT") p.push(`ตรงกัน → ${desc(r2)}`);
  });
  await step("N-19", "ORACLE-EDIT B1: X-Line-Retry-Key คงที่จาก tenant:dedupeKey · แถวค้าง SENDING (โพรเซสตายหลัง LINE รับแล้ว) ⇒ ส่งซ้ำด้วยคีย์เดิม · LINE ตอบ 409 ⇒ SENT · key อื่นได้คีย์อื่น", async (p) => {
    const m = mark();
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n19") });
    if (r?.status !== "SENT") { p.push(`ครั้งแรก ${desc(r)}`); return; }
    const k1 = pushes(since(m))[0]?.retryKey ?? "";
    if (!UUID_RE.test(k1)) p.push(`คีย์ ${js(k1)}`);
    await prisma.serviceMessageLog.updateMany({ where: { tenantId: TA, dedupeKey: DK("n19") }, data: { status: "SENDING", at: new Date(Date.now() - 3 * 60_000) } });
    const m2 = mark();
    const r2 = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n19") });
    const ps2 = pushes(since(m2));
    if (ps2.length !== 1) p.push(`ส่งซ้ำ push ${ps2.length}`);
    else {
      if (ps2[0]!.retryKey !== k1) p.push("คีย์ไม่คงที่");
      if (ps2[0]!.status !== 409) p.push(`ตัวจำลองตอบ ${ps2[0]!.status} (คาด 409)`);
    }
    if (r2?.status !== "SENT") p.push(`409 ⇒ ${desc(r2)} (คาด SENT)`);
    const rows = await logOf(DK("n19"));
    if (rows.length !== 1 || rows[0]?.status !== "SENT") p.push(`log ${js(rows.map((x) => x.status))}`);
    const m3 = mark();
    await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n19b") });
    const k3 = pushes(since(m3))[0]?.retryKey ?? "";
    if (!k3 || k3 === k1) p.push("dedupeKey อื่นได้คีย์เดียวกัน/ไม่มีคีย์");
  });
  await step("N-20", "ORACLE-EDIT B4: แถวกำลังส่ง (SENDING สด) ⇒ คืนทันที {duplicate:true, pending:true} ไม่รอ ไม่ส่ง · แถวไม่เปลี่ยน", async (p) => {
    const at0 = new Date();
    await prisma.serviceMessageLog.create({ data: { tenantId: TA, unitId: U.dorm, domain: "rooms", messageKey: "roomLink", dedupeKey: DK("n20"), channel: "NONE", status: "SENDING", at: at0 } });
    const m = mark(); const t0 = Date.now();
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n20") });
    const ms = Date.now() - t0;
    if (r?.duplicate !== true || r?.pending !== true) p.push(`ผล ${desc(r)}`);
    if (ms > 3_000) p.push(`รอ ${ms} ms`);
    if (pushes(since(m)).length) p.push("มี push");
    const rows = await logOf(DK("n20"));
    if (rows.length !== 1 || rows[0]?.status !== "SENDING" || new Date(rows[0].at).getTime() !== at0.getTime()) p.push(`แถว ${js(rows.map((x) => x.status))}`);
  });
  await step("N-21", "ORACLE-EDIT B1: LINE ค้าง (ตัวจำลองตอบหลัง 12 วิ) ⇒ ตัดที่ ~10 วิ คืน FAILED ไม่ค้าง", async (p) => {
    const t0 = Date.now();
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa12, dedupeKey: DK("n21") });
    const ms = Date.now() - t0;
    if (r?.status !== "FAILED") p.push(`ผล ${desc(r)} (คาด FAILED)`);
    if (ms > 11_500) p.push(`ใช้ ${ms} ms (เกิน ~10 วิ)`);
  }, "MAJOR");
  await step("N-22", "ORACLE-EDIT B3: แม่แบบใช้ {payLink} ผู้เรียกไม่ส่ง ⇒ เติม URL เต็ม (APP_URL + webLink) · ตัวแปรที่ขาด ⇒ missingVars ในผล · ผู้เรียกส่ง payLink ⇒ ใช้ตามนั้น", async (p) => {
    await withEnv({ APP_URL: "https://qc-svc.example", NEXT_PUBLIC_APP_URL: undefined }, async () => {
      const m = mark();
      const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, messageKey: "bill", dedupeKey: DK("n22a"), link: LINK("n22"), vars: { tenantName: NAME, roomNo: "305", unitName: "หอทดสอบ", period: "ต.ค.", amount: "3,500 บาท" } });
      if (r?.status !== "SENT") p.push(`ผล ${desc(r)}`);
      const t = msgText(pushes(since(m))[0]);
      const mm = /https:\/\/qc-svc\.example(\/q\/[A-Za-z0-9_.-]+)/.exec(t);
      if (!mm) p.push(`ข้อความไม่มี URL เต็ม: ${js(t).slice(0, 120)}`);
      else if (callSync(SL, "verifyLink", mm[1]!.slice(3), "svc.r07")?.subjectId !== "svc-r07-n22") p.push("URL ในข้อความ verify ไม่ผ่าน");
      if (/[{}]/.test(t)) p.push("ยังมี {ตัวแปร}");
      const mv = Array.isArray(r?.missingVars) ? r.missingVars : null;
      if (!mv || !mv.includes("dueDate") || mv.includes("payLink")) p.push(`missingVars ${js(r?.missingVars)}`);
      const m2 = mark();
      const r2 = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, messageKey: "bill", dedupeKey: DK("n22b"), link: LINK("n22b"), vars: { tenantName: NAME, roomNo: "305", unitName: "หอ", period: "ต.ค.", amount: "1", dueDate: "5 พ.ย.", payLink: "https://pay.example/svc-r07" } });
      const t2 = msgText(pushes(since(m2))[0]);
      if (r2?.status !== "SENT" || !t2.includes("https://pay.example/svc-r07") || t2.includes("qc-svc.example")) p.push(`ผู้เรียกส่ง payLink → ${js(t2).slice(0, 100)}`);
      if (Array.isArray(r2?.missingVars) && r2.missingVars.length) p.push(`ครบแล้วยังมี missingVars ${js(r2.missingVars)}`);
    });
  }, "MAJOR");
  await step("N-23", "ORACLE-EDIT B2: link.path ไม่ลงท้าย / ⇒ เติมให้ (\"/q\" ⇒ \"/q/<token>\") token verify ได้", async (p) => {
    const r = await notify(CTX_A, { unitId: U.barber, partyId: ID.pa1, dedupeKey: DK("n23"), link: { ...LINK("n23"), path: "/q" } });
    const w = String(r?.webLink ?? "");
    if (!w.startsWith("/q/")) p.push(`webLink ${js(w)}`);
    else if (callSync(SL, "verifyLink", w.slice(3), "svc.r07")?.subjectId !== "svc-r07-n23") p.push("token verify ไม่ผ่าน");
  }, "MAJOR");
  await step("N-24", "ORACLE-EDIT B6: ส่ง 1 ครั้ง (SENT ทาง LINE) ใช้ SQL ≤ 10 (นับที่ pg.Client.query)", async (p) => {
    const { createRequire } = (await import("node:module" as string)) as { createRequire: (p: string) => (id: string) => unknown };
    const pg = createRequire(join(ROOT, "package.json"))("pg") as { Client: { prototype: { query: (...a: unknown[]) => unknown } } };
    let q = 0;
    const orig = pg.Client.prototype.query;
    pg.Client.prototype.query = function (this: unknown, ...a: unknown[]) { q++; return orig.apply(this, a); };
    try {
      q = 0; await prisma.tenant.count({ where: { id: TA } });
      if (q < 1) { p.push("ตัวนับ SQL ไม่ทำงาน (control)"); return; }
      q = 0;
      const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa1, dedupeKey: DK("n24") });
      const n = q;
      out(`     (notifyCustomer SENT = ${n} SQL)`);
      if (r?.status !== "SENT") p.push(`ผล ${desc(r)}`);
      if (n > 10) p.push(`ใช้ ${n} SQL (เพดาน 10)`);
    } finally { pg.Client.prototype.query = orig; }
  }, "MAJOR");
  await step("N-25", "ORACLE-EDIT B7: LINE ตอบ 429 ⇒ {FAILED, code QUOTA} สถานะจบ (ส่งซ้ำ key เดิม = duplicate ไม่ยิง) · มี audit เตือนร้าน (action มีคำว่า quota)", async (p) => {
    const t0 = new Date(Date.now() - 1_000);
    const r = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa11, dedupeKey: DK("n25") });
    if (r?.status !== "FAILED" || r?.code !== "QUOTA") p.push(`ผล ${desc(r)}`);
    const m = mark();
    const r2 = await notify(CTX_A, { unitId: U.dorm, partyId: ID.pa11, dedupeKey: DK("n25") });
    if (r2?.duplicate !== true) p.push(`ส่งซ้ำ → ${desc(r2)} (คาด duplicate)`);
    if (pushes(since(m)).length) p.push("ยิงซ้ำหลัง QUOTA");
    const au = (await prisma.auditLog.findMany({ where: { tenantId: TA, createdAt: { gte: t0 } }, select: { action: true } })) as { action: string }[];
    if (!au.some((a) => /quota/i.test(a.action))) p.push(`ไม่มี audit เตือนโควตา (${js(au.map((a) => a.action)).slice(0, 80)})`);
  }, "MAJOR");

  // ═══════════════ W webhook จริง ═══════════════
  out("\n— W webhook LINE (route.ts) —");
  const postbacks = () => TEST_ROUTE_CALLS.filter((c) => c.kind === "postback");
  await step("W-1", "postback ที่ OA1 (ลายเซ็นถูก) ⇒ 200 · route ได้ ctx {tenant A, OA1, ผู้ติดต่อ, partyId ของผู้ติดต่อ} + evt · ตอบด้วย replyToken + Bearer OA1", async (p) => {
    if (!testRoute) { p.push("ไม่มี route ทดสอบ"); return; }
    const n0 = postbacks().length; const m = mark();
    const ev = evPostback(EXT.a1!, "booking.checkin?a=svc-r07-appt-w1", `w1${RAND}`);
    const st = await hook("c1", CSEC.c1, [ev]);
    if (st !== 200) p.push(`status ${st}`);
    const got = postbacks().slice(n0);
    if (got.length !== 1) { p.push(`handler ${got.length} ครั้ง`); return; }
    const c = got[0]!;
    if (c.ctx?.tenantId !== TA || c.ctx?.connectionId !== ID.c1 || c.ctx?.chatContactId !== ID.k_a1 || c.ctx?.partyId !== ID.pa1) p.push(`ctx ${js(c.ctx)}`);
    if (c.arg?.action !== "checkin" || c.arg?.params?.a !== "svc-r07-appt-w1") p.push(`evt ${js(c.arg)}`);
    if (!replyTo(since(m), TOK.c1, ev.replyToken, EXT.a1!).includes(`ok-postback-${RAND}`)) p.push("ไม่ได้ตอบ reply ของ route");
  });
  await step("W-2", "event เดิม (webhookEventId เดิม) ส่งซ้ำ ⇒ handler ไม่ถูกเรียกซ้ำ (X4)", async (p) => {
    if (!testRoute) { p.push("ไม่มี route ทดสอบ"); return; }
    const n0 = postbacks().length;
    const st = await hook("c1", CSEC.c1, [evPostback(EXT.a1!, "booking.checkin?a=svc-r07-appt-w1", `w1${RAND}`)]);
    if (st !== 200) p.push(`status ${st}`);
    if (postbacks().length !== n0) p.push(`handler ถูกเรียกซ้ำ ${postbacks().length - n0}`);
  });
  await step("W-3", "postback เข้า OA ร้าน B พร้อม data อ้าง tenantId ร้าน A ⇒ ctx.tenantId = ร้าน B เสมอ (ไม่อ่านจาก data)", async (p) => {
    if (!testRoute) { p.push("ไม่มี route ทดสอบ"); return; }
    const n0 = postbacks().length;
    const st = await hook("cb", CSEC.cb, [evPostback(EXT.b1!, `booking.checkin?a=svc-r07-appt-w1&tenantId=${TA}&partyId=${ID.pa1}`)]);
    if (st !== 200) p.push(`status ${st}`);
    const got = postbacks().slice(n0);
    if (got.length !== 1) { p.push(`handler ${got.length}`); return; }
    if (got[0]?.ctx?.tenantId !== TB || got[0]?.ctx?.connectionId !== ID.cb || got[0]?.ctx?.partyId !== ID.pb) p.push(`ctx ${js(got[0]?.ctx)}`);
  });
  await step("W-4", "ลายเซ็นผิด ⇒ 401 · handler ไม่ถูกเรียก · ใช้ secret ของ OA อื่นเซ็น ⇒ 401", async (p) => {
    const n0 = TEST_ROUTE_CALLS.length;
    const st = await hook("c1", CSEC.c1, [evPostback(EXT.a1!, "booking.checkin?a=w4")], true);
    if (st !== 401) p.push(`ลายเซ็นพลิก status ${st}`);
    const st2 = await hook("c1", CSEC.cb, [evPostback(EXT.a1!, "booking.checkin?a=w4")]);
    if (st2 !== 401) p.push(`secret ร้าน B status ${st2}`);
    if (TEST_ROUTE_CALLS.length !== n0) p.push("handler ถูกเรียก");
  });
  const W5_USER = `Usvcr07w5${RAND}`;
  let codeW5 = "";
  await step("W-5", "ลูกค้าใหม่พิมพ์รหัส (ตัวเล็ก+ขีด) ในแชท OA1 ⇒ ผู้ติดต่อถูกสร้าง+ผูก party จาก resolveParty · onLinked · รหัสถูกใช้ · ตอบข้อความของ route", async (p) => {
    if (!testRoute) { p.push("ไม่มี route ทดสอบ"); return; }
    codeW5 = await mkCode({ refId: `${PFX}-w5`, connectionId: ID.c1 });
    RESOLVE[`${PFX}-w5`] = ID.pa5;
    const n0 = TEST_ROUTE_CALLS.length; const m = mark();
    const ev = evText(W5_USER, `${codeW5.slice(0, 4).toLowerCase()}-${codeW5.slice(4).toLowerCase()}`);
    const st = await hook("c1", CSEC.c1, [ev]);
    if (st !== 200) p.push(`status ${st}`);
    const c = await prisma.chatContact.findFirst({ where: { tenantId: TA, channelConnectionId: ID.c1, externalUserId: W5_USER } });
    if (!c) { p.push("ไม่มีผู้ติดต่อ"); return; }
    if (c.partyId !== ID.pa5) p.push(`partyId ${c.partyId}`);
    const row = await codeRow(TA, codeW5);
    if (row?.usedByChatContactId !== c.id) p.push("รหัสไม่ถูกใช้โดยผู้ติดต่อนี้");
    const linked = TEST_ROUTE_CALLS.slice(n0).find((x) => x.kind === "linked");
    if (linked?.arg?.partyId !== ID.pa5 || linked?.arg?.purpose !== "QUEUE_TICKET" || linked?.ctx?.tenantId !== TA) p.push(`onLinked ${js(linked?.arg)}`);
    if (!replyTo(since(m), TOK.c1, ev.replyToken, W5_USER).includes(`linked-ok-${RAND}`)) p.push("ไม่ได้ตอบข้อความของ route");
  });
  await step("W-6", "คำตอบเมื่อผูกไม่สำเร็จเหมือนกันทุกกรณี (รหัสมั่ว · หมดอายุ · ใช้แล้ว · รหัสร้าน B) และไม่ใช่ข้อความสำเร็จ (X7)", async (p) => {
    if (!codeW5) { p.push("ไม่มีรหัสจาก W-5"); return; }
    const expired = await mkCode({ refId: `${PFX}-w6e`, connectionId: ID.c1 });
    await prisma.chatLinkCode.updateMany({ where: { tenantId: TA, codeHash: codeHashOf(TA, expired) }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const codeB = await mkCode({ refId: `${PFX}-w6b`, purpose: "DORM_LEASE" }, CTX_B);
    let junk = ""; do { junk = Array.from({ length: 8 }, () => ALPHA[randomInt(ALPHA.length)]).join(""); } while (!isCodeShape(junk));
    const texts: string[] = [];
    for (const [i, t] of [junk, expired, codeW5, codeB].entries()) {
      const u = `Usvcr07w6${i}${RAND}`; const m = mark();
      const ev = evText(u, t);
      const st = await hook("c1", CSEC.c1, [ev]);
      if (st !== 200) p.push(`#${i} status ${st}`);
      texts.push(replyTo(since(m), TOK.c1, ev.replyToken, u));
    }
    if (texts.some((t) => !t)) p.push(`บางกรณีไม่มีคำตอบ ${js(texts.map((t) => t.length))}`);
    if (new Set(texts).size !== 1) p.push(`คำตอบต่างกัน ${js(texts).slice(0, 200)}`);
    if (texts.some((t) => t.includes(`linked-ok-${RAND}`) || t.includes("เรียบร้อย"))) p.push("คำตอบล้มเหมือนข้อความสำเร็จ");
    if ((await codeRow(TB, codeB))?.usedAt) p.push("รหัสร้าน B ถูกใช้");
  }, "MAJOR");
  await step("W-7", "ORACLE-EDIT A4: ข้อความที่จับเป็นรหัสผูก (สำเร็จและล้ม) ⇒ ChatMessage/ตัวอย่างข้อความล่าสุดไม่มีรหัสดิบ · ข้อความธรรมดายังเก็บตามจริง", async (p) => {
    const plainUser = `Usvcr07w7${RAND}`;
    const st = await hook("c1", CSEC.c1, [evText(plainUser, `สวัสดีครับ ${RAND}`)]);
    if (st !== 200) p.push(`status ${st}`);
    const convs = (await prisma.chatConversation.findMany({ where: { systemId: ID.sysA, contact: { externalUserId: { startsWith: "Usvcr07w" } } }, select: { id: true, lastMessagePreview: true, contact: { select: { externalUserId: true } } } })) as Any[];
    if (convs.length < 5) p.push(`ห้องจาก W-5/W-6/W-7 มี ${convs.length}`);
    const msgs = (await prisma.chatMessage.findMany({ where: { conversationId: { in: convs.map((c) => c.id) } }, select: { body: true, conversationId: true } })) as Any[];
    const blob = js([...msgs.map((m) => m.body), ...convs.map((c) => c.lastMessagePreview)]).toUpperCase().replace(/[-\s]/g, "");
    const hits = RAW_CODES.filter((c) => blob.includes(c));
    if (hits.length) p.push(`พบรหัสดิบ ${hits.length} ตัว`);
    const plain = convs.find((c) => c.contact?.externalUserId === plainUser);
    if (!plain || !msgs.some((m) => m.conversationId === plain.id && String(m.body ?? "").includes(`สวัสดีครับ ${RAND}`))) p.push("ข้อความธรรมดาไม่ถูกเก็บ (control)");
  }, "MAJOR");
} catch (e) {
  chk("CRASH", "จบกลางทาง: " + errMsg(e), false);
} finally {
  // ═══════════════ Z สแกนรั่ว · ทำความสะอาด ═══════════════
  out("\n— Z สแกนรั่ว · ทำความสะอาด —");
  if (testRoute && Array.isArray(PB?.POSTBACK_ROUTES)) { const i = PB.POSTBACK_ROUTES.indexOf(testRoute); if (i >= 0) PB.POSTBACK_ROUTES.splice(i, 1); }
  try {
    await step("Z-1", "ไม่มีคำขอถึง *.line.me นอกจากข้อ K (ตัวจำลองรับทุกคำขอ · ไม่ยิง LINE จริง)", async (p) => {
      const lb = lineBlocked();
      if (K_LINE_BLOCKED < 0) p.push("ไม่ได้ผ่านข้อ K");
      else if (lb.length > K_LINE_BLOCKED) p.push(`มี ${lb.length - K_LINE_BLOCKED} คำขอหลังข้อ K: ${js(lb.slice(K_LINE_BLOCKED, K_LINE_BLOCKED + 5))}`);
    });
    await step("Z-2", "DB ของรอบ (ServiceMessageLog · ChatLinkCode · AuditLog · OutboxEvent · OpsEvent · ChatWebhookLog · IntegrationCallLog) ไม่มีโทเคน/secret/เบอร์/ชื่อ/รหัสดิบ", async (p) => {
      const sml = await prisma.serviceMessageLog.findMany({ where: { dedupeKey: { startsWith: "svc-r07:" } } });
      const lc = await prisma.chatLinkCode.findMany({ where: { refId: { startsWith: "svc-r07-" } } });
      const au = await prisma.auditLog.findMany({ where: { tenantId: { in: [TA, TB] }, createdAt: { gte: START } } });
      const ob = await prisma.outboxEvent.findMany({ where: { tenantId: { in: [TA, TB] }, createdAt: { gte: START } } });
      const ops = await prisma.opsEvent.findMany({ where: { createdAt: { gte: START } } });
      const wl = await prisma.chatWebhookLog.findMany({ where: { connectionId: { in: CREATED.conns } } });
      const icl = await prisma.integrationCallLog.findMany({ where: { tenantId: { in: [TA, TB] }, at: { gte: START } } });
      const all = [...SECRETS, ...PII, ...RAW_CODES];
      for (const [lbl, v] of [["ServiceMessageLog", sml], ["ChatLinkCode", lc], ["AuditLog", au], ["OutboxEvent", ob], ["OpsEvent", ops], ["ChatWebhookLog", wl], ["IntegrationCallLog", icl]] as const) {
        const lk = leaks(v, all);
        if (lk.length) p.push(`${lbl}: ${lk.slice(0, 4).join(",")}`);
      }
      if (!sml.length) p.push("ไม่มี ServiceMessageLog ให้ตรวจ");
    });
    await step("Z-3", "console ระหว่างรันไม่มีโทเคน/secret/เบอร์", async (p) => {
      const lk = leaks(CAPTURED.join("\n"), [...SECRETS, PHONE]);
      if (lk.length) p.push(`พบ ${lk.join(",")}`);
    });
    await step("Z-4", "ผลคืนทุกตัวไม่มีโทเคน/secret · ไม่มีคีย์ credentials", async (p) => {
      const lk = leaks(RESULTS);
      if (lk.length) p.push(`พบ ${lk.join(",")}`);
      if (RESULTS.some((r) => /"(credentials|channelAccessToken|channelSecret|codeHash)"/.test(js(r)))) p.push("มีคีย์ลับในผลคืน");
      if (!RESULTS.length) p.push("ไม่มีผลคืนให้ตรวจ");
    });
  } catch (e) {
    chk("Z-x", "สแกนรั่วล้ม", false, errMsg(e));
  }
  for (const k of ENV_KEYS) envSet(k, ENV_SAVED[k]);
  try {
    await cleanup();
    for (const r of SV_SAVED) await prisma.settingValue.create({ data: r });
    const left = (await prisma.appSystem.count({ where: { name: { startsWith: "svc-r07-" } } }))
      + (await prisma.chatChannelConnection.count({ where: { externalAccountId: { startsWith: "svc-r07-" } } }))
      + (await prisma.chatLinkCode.count({ where: { refId: { startsWith: "svc-r07-" } } }))
      + (await prisma.serviceMessageLog.count({ where: { dedupeKey: { startsWith: "svc-r07:" } } }))
      + (await prisma.party.count({ where: { address: { startsWith: "svc-r07-" } } }))
      + (await prisma.customer.count({ where: { name: { startsWith: "svc-r07-" } } }))
      + (await prisma.settingValue.count({ where: { setById: SV_MARK } }));
    const restored = (await prisma.settingValue.count({ where: { id: { in: SV_SAVED.map((r) => r.id) } } })) === SV_SAVED.length;
    chk("Z-5", "ทำความสะอาด: ไม่เหลือแถว svc-r07-* · ค่าตั้งเดิมคืนครบ", left === 0 && restored, `เหลือ ${left} · คืนค่าตั้ง ${restored}`, "MAJOR");
  } catch (e) {
    chk("Z-5", "ทำความสะอาด", false, errMsg(e), "MAJOR");
  }
  globalThis.fetch = REAL_FETCH;
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await prisma.$disconnect?.().catch(() => {});
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
out(`\n===== QC SVC R0.7 · LINE + notifyCustomer + ลิงก์เซ็น =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
out(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => c.id) })}`);
// รับใบ = ไม่มี FAIL และไม่มี SKIP
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
