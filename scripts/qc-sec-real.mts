// QC — SECRETARY S3a.1-R · เส้นสาธิต 3 เส้นด้วยโมเดลจริงผ่าน route จริง (docs/modules/31-secretary.md §1.5 · R-1 ของ qc-sec-s3a.1 · ใบ sec-brief-S3a.1-R)
//   ตัวขับ + รายงาน (ไม่ใช่ข้อสอบที่บังคับให้โมเดลเลือกถูก): โมเดลไม่เรียกเครื่องมือที่คาด = "ตก" พร้อมเหตุผล — ไม่แก้ prompt ของผลิตภัณฑ์
//
// เส้น:
//   1 quote_line  ห้องเลขาที่เปิดจากห้องแชท LINE ของลูกค้าที่ผูกสมาชิก ⇒ คาด `account.*` + `chat.send` → อนุมัติใบเอกสารก่อน แล้ว chat.send →
//                 ใบเสนอราคา + ข้อความ OUT SENT + ข้อความที่ถึง LINE จำลองมียอดเงินของใบ และ (เลขที่ หรือ "ฉบับร่าง") · ลิงก์ = โบนัส (R-Z45 · R-Z48)
//   2 pos_points  "เปิดบิลขาย … ให้สมาชิก … สะสมแต้ม" ⇒ คาด `pos*` → อนุมัติ → บิล PAID ผูก memberId + แต้ม EARN จากสะพานสมาชิกอ้างบิลนั้น
//                 (ระบายคิวเฉพาะร้านทดสอบ · ข้อเสนอแต้มแยก point_adjust/member.*point* = ไม่กด และนับเป็นตก — R-Z42 · R-Z46)
//   3 refund      "คืนมัดจำนัดหมายของคุณ…" ⇒ คาด `booking_refund_deposit` (เงินออก · อนุมัติเสมอ) → อนุมัติ → `refundDepositByShop` (PosDeposit REFUNDED)
// ต่อเส้น: 1 ร้านทดสอบของตัวเอง (สร้างเอง · ลบทั้งร้านใน finally) · ลองซ้ำ ≤ 2 ครั้งเมื่อโมเดลไม่เสนอสิ่งที่คาด · จดทุกรอบ
//   R-Z46: ครั้งที่ n>1 ต่อท้ายคำสั่ง " (ลองใหม่ครั้งที่ n)" + clientMessageId ใหม่ · route ตอบ duplicate:true = "ลองไม่ได้" (ไม่ใช่ตก · ไม่นับต้นทุน)
//   ต้นทุนรวมนับเฉพาะครั้งที่มีรอบโมเดล > 0 (ห้องละครั้ง) · รายงานคู่: ยอดใน AiCreditTxn และยอดตามอัตราแคชจริง
//   ต้นทุนต่อห้อง = AiCreditTxn (USAGE · conversationId ของห้อง · ไมโครดอลลาร์ + token + ป้ายโมเดลของผลิตภัณฑ์) ·
//   รอบเครื่องมือ/เวลา/โมเดลจริง/token แคช = ตัวครอบ fetch ที่ api.anthropic.com (อ่านอย่างเดียว ไม่แก้คำขอ)
//   เพดานรวม ฿30 (SEC_REAL_MAX_THB) — ก่อนยิงทุกครั้งตรวจยอดสะสม · เกิน ⇒ ไม่ยิง (คำขอถูกปฏิเสธในตัวครอบ) แล้วหยุดเส้นที่เหลือ
//   ออกนอกเครื่องได้เฉพาะ api.anthropic.com (โหมดจริง) + ฐาน QC (*.neon.tech) · LINE = เซิร์ฟเวอร์จำลอง 127.0.0.1 (LINE_API_BASE) · อื่น ๆ ถูกกัน (จด)
//
// โหมด:
//   จริง  : SEC_REAL_MODEL=1 + AI_PROVIDER=anthropic + SHARK_ANTHROPIC_KEY (ใน .env.qc-sec ของผู้รัน) — ผู้คุมรัน
//   แห้ง  : SEC_REAL_DRY=1 — ทาง provider จริง (AnthropicProvider ผ่าน route/worker จริง) แต่คำตอบของ api.anthropic.com เป็นสคริปต์ในเครื่อง
//           (ไม่มีการเรียกออกนอก · ไม่มีคีย์) — พิสูจน์ fixture/อนุมัติ/ตรวจผล/ลบข้อมูล · token ขาเข้าเป็นค่าประมาณ (ความยาวคำขอ/4)
//           + SEC_REAL_DRY_MISS=1 = ครั้งแรกของทุกเส้นโมเดลไม่เรียกเครื่องมือ (ทดสอบทางลองซ้ำ)
//   ไม่ตั้งทั้งคู่ / ไม่มีคีย์ ⇒ SKIP exit 0
// รัน (ผู้คุม): bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 AI_PROVIDER=anthropic SEC_REAL_MODEL=1 SMS_PROVIDER=mock pnpm exec tsx scripts/qc-sec-real.mts
// แห้ง     : bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SEC_REAL_DRY=1 SMS_PROVIDER=mock pnpm exec tsx scripts/qc-sec-real.mts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const LABEL = "qc-sec-real";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production" || process.env.VERCEL_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv(LABEL); // SESSION_SECRET ฯลฯ + คีย์ของผู้รัน (ถ้ามี) จาก QC_ENV_FILE — ไม่พิมพ์ค่า

const DRY = process.env.SEC_REAL_DRY === "1";
const REAL = !DRY && process.env.SEC_REAL_MODEL === "1" && process.env.AI_PROVIDER === "anthropic" && !!(process.env.SHARK_ANTHROPIC_KEY ?? "").trim();
if (!DRY && !REAL) {
  const why = process.env.SEC_REAL_MODEL !== "1" ? "ไม่ได้ตั้ง SEC_REAL_MODEL=1 (หรือ SEC_REAL_DRY=1)" : process.env.AI_PROVIDER !== "anthropic" ? "AI_PROVIDER ไม่ใช่ anthropic" : "ไม่มี SHARK_ANTHROPIC_KEY ใน env QC ของผู้รัน";
  console.log(`⏭️  ${LABEL}: ${why} — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 3, passed: 0, failed: [], skipped: ["quote_line", "pos_points", "refund"], reason: why }));
  process.exit(0);
}
if (process.env.SHARK_AI_MOCK) { console.log(`  ⚠️ ${LABEL}: ถอด SHARK_AI_MOCK ออกจาก env ของโพรเซสนี้ (ใบนี้ห้ามใช้ MockProvider)`); delete process.env.SHARK_AI_MOCK; }
if (process.env.SHARK_AI_MODEL) { console.log(`  ⚠️ ${LABEL}: ถอด SHARK_AI_MODEL (ให้ routing ของผลิตภัณฑ์เลือกเอง)`); delete process.env.SHARK_AI_MODEL; }
if (DRY) { process.env.AI_PROVIDER = "anthropic"; process.env.SHARK_ANTHROPIC_KEY = "dry-run-no-key"; } // ค่าหลอกในโพรเซสนี้เท่านั้น — คำขอไม่ออกนอกเครื่อง (ตัวครอบตอบเอง)

type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 240);
const short = (s: unknown, n = 200) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return Array.from(t).length > n ? Array.from(t).slice(0, n - 1).join("") + "…" : t; };

// ═════════════ ตัวครอบ fetch (นับรอบ/เวลา/โมเดล/token · กันออกนอกเครื่อง · เพดานเงิน) ═════════════
type CallRec = { ms: number; status: number; model: string; inTok: number; cacheWrite: number; cacheRead: number; outTok: number; stop: string; tools: string[]; text: string; microEst: number; microProvider: number };
type Cur = { path: string; attempt: number; calls: CallRec[] } | null;
let CUR: Cur = null;
const BLOCKED: string[] = [];
const { costMicroUsd, priceOf } = await import("@/lib/ai/pricing");
const { thbPerUsd } = await import("@/lib/ai/topup");
const THB = thbPerUsd();
const MAX_THB = Number(process.env.SEC_REAL_MAX_THB) > 0 ? Math.min(30, Number(process.env.SEC_REAL_MAX_THB)) : 30;
const MAX_MICRO = Math.floor((MAX_THB / THB) * 1e6);
// R-Z46: เพดานตรวจจากยอดสะสมจริง — ทุกคำตอบของผู้ให้บริการนับครั้งเดียวที่ตัวครอบ (ไม่ใช่ผลรวมต่อรอบที่อาจนับห้องเดิมซ้ำ)
//   ใช้ราคาแบบแคชเต็มราคา (สูงกว่าจริง ⇒ เพดานปลอดภัย) · รายงานราคาตามอัตราแคชจริงคู่กัน
let spentMicroEst = 0;
let spentMicroProvider = 0;
let capHit = false;
type DryReply = { tools?: { name: string; input: Record<string, unknown> }[]; text?: string };
let dryScript: ((path: string, i: number) => DryReply) | null = null;
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any): Promise<Response> => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { /* ไม่ใช่ URL */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  if (host !== "api.anthropic.com") {
    BLOCKED.push(host.slice(0, 80));
    return new Response(JSON.stringify({ message: "blocked by qc-sec-real" }), { status: 503, headers: { "content-type": "application/json" } });
  }
  const t0 = Date.now();
  const rec: CallRec = { ms: 0, status: 0, model: "", inTok: 0, cacheWrite: 0, cacheRead: 0, outTok: 0, stop: "", tools: [], text: "", microEst: 0, microProvider: 0 };
  CUR?.calls.push(rec);
  if (REAL && spentMicroEst >= MAX_MICRO) {
    capHit = true;
    rec.status = 599; rec.stop = "budget_cap";
    return new Response(JSON.stringify({ type: "error", error: { type: "qc_budget_cap", message: `qc-sec-real: เกินเพดาน ฿${MAX_THB}` } }), { status: 429, headers: { "content-type": "application/json" } });
  }
  let res: Response;
  if (DRY) {
    const bodyText = typeof init?.body === "string" ? init.body : "";
    const step = dryScript?.(CUR?.path ?? "", (CUR?.calls.length ?? 1) - 1) ?? { text: "รับทราบครับ" };
    const content: Record<string, unknown>[] = [];
    if (step.text) content.push({ type: "text", text: step.text });
    for (const [k, tc] of (step.tools ?? []).entries()) content.push({ type: "tool_use", id: `toolu_dry_${Date.now().toString(36)}_${k}`, name: tc.name, input: tc.input });
    res = new Response(JSON.stringify({ id: `msg_dry_${Date.now()}`, type: "message", role: "assistant", model: "dry-run", content, stop_reason: step.tools?.length ? "tool_use" : "end_turn", usage: { input_tokens: Math.ceil(bodyText.length / 4), output_tokens: Math.ceil(JSON.stringify(content).length / 4) } }), { status: 200, headers: { "content-type": "application/json" } });
  } else {
    res = await REAL_FETCH(input, init);
  }
  rec.ms = Date.now() - t0;
  rec.status = res.status;
  try {
    const j = (await res.clone().json()) as AnyMod;
    const u = (j.usage ?? {}) as AnyMod;
    rec.model = String(j.model ?? "");
    rec.inTok = Number(u.input_tokens ?? 0); rec.cacheWrite = Number(u.cache_creation_input_tokens ?? 0); rec.cacheRead = Number(u.cache_read_input_tokens ?? 0); rec.outTok = Number(u.output_tokens ?? 0);
    rec.stop = String(j.stop_reason ?? j.error?.type ?? "");
    const blocks = Array.isArray(j.content) ? (j.content as AnyMod[]) : [];
    rec.tools = blocks.filter((b) => b?.type === "tool_use").map((b) => String(b.name));
    rec.text = short(blocks.filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).join(""), 160);
    // ต้นทุนต่อการเรียก 2 แบบ: ราคาที่บัญชีของผลิตภัณฑ์คิดก่อน R-Z44 (แคชเต็มราคา = สูงสุด · ใช้คุมเพดาน) · ราคาตามอัตราแคชจริง (เขียน ×1.25 · อ่าน ×0.1)
    rec.microEst = costMicroUsd(rec.model, rec.inTok + rec.cacheWrite + rec.cacheRead, rec.outTok);
    const p = priceOf(rec.model);
    rec.microProvider = Math.ceil(((rec.inTok * p.inPerM + rec.cacheWrite * p.inPerM * 1.25 + rec.cacheRead * p.inPerM * 0.1 + rec.outTok * p.outPerM) / 1e6) * 1e6);
    if (REAL) { spentMicroEst += rec.microEst; spentMicroProvider += rec.microProvider; }
  } catch { /* ไม่ใช่ JSON */ }
  return res;
}) as typeof fetch;

// ═════════════ LINE จำลอง (ไม่ส่งออกจริง) ═════════════
type LineReq = { path: string; to: string; texts: string[] };
const LINE_REQS: LineReq[] = [];
const lineServer = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    let json: AnyMod = {};
    try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")) as AnyMod; } catch { /* */ }
    LINE_REQS.push({ path, to: String(json.to ?? ""), texts: (Array.isArray(json.messages) ? (json.messages as AnyMod[]) : []).map((m) => String(m.text ?? m.type ?? "")) });
    res.writeHead(200, { "content-type": "application/json" });
    if (req.method === "POST" && (path === "/v2/bot/message/push" || path === "/v2/bot/message/reply")) return res.end(JSON.stringify({ sentMessages: [{ id: `qcreal${LINE_REQS.length}` }] }));
    if (req.method === "GET" && path.startsWith("/v2/bot/profile/")) return res.end(JSON.stringify({ displayName: "ลูกค้าทดสอบ", userId: path.split("/").pop() }));
    return res.end("{}");
  });
});
await new Promise<void>((r) => lineServer.listen(0, "127.0.0.1", () => r()));
process.env.LINE_API_BASE = `http://127.0.0.1:${(lineServer.address() as AddressInfo).port}`;

// ═════════════ โมดูล (import หลังตั้ง env) ═════════════
const { prisma } = await import("@/lib/core/db");
const { issueMobileToken } = await import("@/lib/mobile/auth");
const { runRoomJobs } = await import("@/lib/ai/secretary/worker");
const sys = await import("@/lib/modules/system/service");
const route = async (p: string) => (await import(`@/app/api/mobile/secretary/${p}/route`)) as unknown as Record<string, Handler>;

const STAMP = Date.now().toString(36);
const USER_PREFIX = "secreal-";
const SLUG_PREFIX = "qc-sec-real-";
type Tenant = { tid: string; slug: string; owner: string; H: Record<string, string> };
const tenants: Tenant[] = [];
async function call(t: Tenant, p: string, method: string, body?: unknown, params: Record<string, string> = {}) {
  const m = await route(p);
  const fn = m[method];
  if (!fn) return { status: 0, body: {} as AnyMod };
  const r = await fn(new Request(`http://real.local/api/mobile/secretary/${p}`, { method, headers: { "content-type": "application/json", ...t.H }, body: body === undefined ? undefined : JSON.stringify(body) }), { params: Promise.resolve(params) });
  let json: AnyMod = {};
  try { json = (await r.json()) as AnyMod; } catch { /* */ }
  return { status: r.status, body: json };
}
async function newTenant(key: string, name: string): Promise<Tenant> {
  const slug = `${SLUG_PREFIX}${key}-${STAMP}`;
  const row = await prisma.tenant.create({ data: { name, slug } });
  const owner = `${USER_PREFIX}${key}-${STAMP}`;
  await prisma.user.create({ data: { id: owner, email: `${owner}@example.com`, name: "คุณสุข (เจ้าของทดสอบ)" } });
  await prisma.membership.create({ data: { tenantId: row.id, userId: owner, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } as never });
  const t: Tenant = { tid: row.id, slug, owner, H: {} };
  t.H = { authorization: `Bearer ${(await issueMobileToken(owner)).token}`, "x-tenant-id": row.id };
  tenants.push(t);
  return t;
}
/** ลบทั้งร้าน: ทุกตารางที่มีคอลัมน์ tenantId (วนตามลำดับ FK ≤ 10 รอบ) แล้ว Tenant — ตรวจ slug ก่อน (แบบ qc-pos-p1.8 wipeTenant) */
async function wipeTenant(t: Tenant): Promise<{ left: Record<string, number>; tenantLeft: number; err: string }> {
  const rep = { left: {} as Record<string, number>, tenantLeft: 0, err: "" };
  try {
    const s = (await prisma.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, t.tid)) as AnyMod[];
    if (s.length && s[0].slug !== t.slug) { rep.err = `slug ไม่ตรง (${s[0].slug}) — ไม่ลบ`; return rep; }
  } catch (e) { rep.err = `อ่าน Tenant ไม่ได้: ${errMsg(e)}`; return rep; }
  const tables = ((await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as AnyMod[]).map((r) => String(r.t));
  await prisma.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, t.tid).catch(() => 0);
  let pending = [...tables];
  for (let pass = 0; pass < 10 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, t.tid); } catch { next.push(tb); } }
    pending = next;
  }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, t.tid, t.slug); } catch (e) { rep.err = `ลบ Tenant ไม่ได้: ${errMsg(e)}`; }
  for (const tb of tables) {
    try { const n = Number(((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, t.tid)) as AnyMod[])[0]?.n ?? 0); if (n) rep.left[tb] = n; } catch { rep.left[tb] = -1; }
  }
  rep.tenantLeft = Number(((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, t.tid)) as AnyMod[])[0]?.n ?? 0);
  return rep;
}
async function cleanupUsers(): Promise<number> {
  const users = await prisma.user.findMany({ where: { id: { startsWith: USER_PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  for (const m of ["session", "authToken", "aiSecretary", "userPhone", "aiNotifyPref"]) { try { await (prisma as AnyMod)[m]?.deleteMany({ where: { userId: { in: ids } } }); } catch { /* ไม่มีตาราง/คอลัมน์ */ } }
  try { await prisma.chatRateBucket.deleteMany({ where: { OR: [{ key: { contains: STAMP } }, ...tenants.map((t) => ({ key: { contains: t.tid } }))] } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { in: ids } } }); } catch (e) { console.log(`  ⚠️ cleanup user: ${errMsg(e)}`); }
  return prisma.user.count({ where: { id: { startsWith: USER_PREFIX } } });
}
/** งานของห้องจนจบ (route รัน inline แล้ว — นี่คือตาข่าย) ≤ 6 รอบ */
async function drainRoom(t: Tenant, roomId: string) {
  for (let i = 0; i < 6; i++) {
    const open = await prisma.aiRoomJob.count({ where: { tenantId: t.tid, roomId, status: { in: ["QUEUED", "RUNNING"] } } });
    if (open === 0) return;
    await runRoomJobs({ limit: 5 });
  }
}

/**
 * R-Z46: ระบายคิว outbox เฉพาะร้านทดสอบ (ไม่เรียก drainAll — กันไปประมวลผล event ของร้านอื่นในฐาน QC ร่วม)
 *   ขั้น 1 รอให้ตัวระบายในโพรเซสที่ผลิตภัณฑ์ปลุกเอง (scheduleDrain/wakeOutbox หลัง commit) ทำงานของร้านนี้จนหมด ≤ 15 วิ
 *   ขั้น 2 ยังค้าง ⇒ หยิบเฉพาะ event ของร้านนี้ด้วย lease แบบเดียวกับ `drainOnce` (claim = updateMany เงื่อนไข availableAt · ปิด DONE แบบมีเงื่อนไข)
 */
async function drainTenant(t: Tenant): Promise<{ pending: number; manual: number; failed: string[] }> {
  const out = { pending: 0, manual: 0, failed: [] as string[] };
  const pendingNow = () => prisma.outboxEvent.count({ where: { tenantId: t.tid, status: "PENDING" } });
  for (let i = 0; i < 30 && (await pendingNow()) > 0; i++) await new Promise((r) => setTimeout(r, 500));
  if ((await pendingNow()) > 0) {
    const { consumers } = (await import("@/lib/outbox-consumers")) as AnyMod;
    const { registerMemberHooks } = (await import("@/lib/member-hooks")) as AnyMod;
    registerMemberHooks();
    for (let round = 0; round < 10; round++) {
      const evts = await prisma.outboxEvent.findMany({ where: { tenantId: t.tid, status: "PENDING", availableAt: { lte: new Date() } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 });
      if (!evts.length) break;
      for (const evt of evts) {
        const lease = new Date(Date.now() + 60_000);
        const claim = await prisma.outboxEvent.updateMany({ where: { id: evt.id, status: "PENDING", availableAt: { lte: new Date() } }, data: { availableAt: lease } });
        if (claim.count === 0) continue;
        const handler = consumers[evt.type] as ((e: Record<string, unknown>) => Promise<void>) | undefined;
        if (!handler) { out.failed.push(`${evt.type}: ไม่มี consumer`); continue; }
        try {
          await handler({ id: evt.id, tenantId: evt.tenantId, type: evt.type, payload: evt.payload, systemId: evt.systemId, unitId: evt.unitId });
          await prisma.outboxEvent.updateMany({ where: { id: evt.id, status: "PENDING" }, data: { status: "DONE", processedAt: new Date(), lastError: null } });
          out.manual++;
        } catch (e) {
          out.failed.push(`${evt.type}: ${errMsg(e)}`);
          await prisma.outboxEvent.updateMany({ where: { id: evt.id, status: "PENDING", availableAt: lease }, data: { attempts: { increment: 1 }, lastError: errMsg(e) } });
        }
      }
    }
  }
  out.pending = await pendingNow();
  return out;
}

// ═════════════ เส้น ═════════════
type Fix = Record<string, string>;
type Approval = { kind: string; summary: string; ok: boolean; note: string };
type Attempt = {
  n: number; instruction: string; roomId: string | null; post: number; ms: number; jobs: string[]; rounds: number; toolsCalled: string[]; models: string[];
  micro: number; microProvider: number; tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number; productModel: string[]; reply: string;
  kinds: string[]; approvals: Approval[]; expectedHit: boolean; verify: Record<string, unknown>; pass: boolean; why: string; calls: CallRec[];
  /** R-Z46: route ตอบ duplicate:true (ห้องเดิม) = ลองไม่ได้ ไม่ใช่ตก · ไม่นับต้นทุน */ dup: boolean;
  /** R-Z46: นับต้นทุนเฉพาะครั้งที่มีรอบโมเดล > 0 และห้องยังไม่ถูกนับ */ counted: boolean;
  /** จุดเริ่มของครั้งนี้ — ตรวจผลเฉพาะของที่เกิดในครั้งนี้ (ครั้งก่อนในร้านเดียวกันไม่ปน) */ lineMark: number; startedAt: Date;
};
type PathDef = {
  id: "quote_line" | "pos_points" | "refund";
  title: string;
  instruction: string;
  expect: { label: string; test: (k: string) => boolean }[];
  setup: (t: Tenant) => Promise<Fix>;
  context?: (f: Fix) => Record<string, string>;
  order?: (kind: string) => number; // ลำดับอนุมัติ (น้อยก่อน)
  /** ไม่อนุมัติ kind นี้ (คืนเหตุผล) — เช่น เส้น 2 ไม่กด point_adjust เพราะแต้มจากบิลต้องมาจากสะพานสมาชิก (R-Z42) */
  hold?: (kind: string) => string | null;
  verify: (t: Tenant, f: Fix, a: Attempt) => Promise<{ ok: boolean; why: string; data: Record<string, unknown> }>;
  dry: (f: Fix, i: number) => DryReply;
};
const fxErr: string[] = [];
async function fx<T>(name: string, fn: () => Promise<T>): Promise<T | null> { try { return await fn(); } catch (e) { fxErr.push(`${name}: ${errMsg(e)}`); console.log(`  ⚠️ fixture ${name}: ${errMsg(e)}`); return null; } }

const PATHS: PathDef[] = [
  {
    id: "quote_line",
    title: "ใบเสนอราคา → ส่ง LINE ลูกค้า",
    instruction: "ร่างใบเสนอราคาเครื่องชงกาแฟ 2 ชุด ชุดละ 4,500 บาท ให้คุณสมชาย แล้วส่งให้ลูกค้าทาง LINE",
    expect: [{ label: "account.*", test: (k) => k.startsWith("account.") }, { label: "chat.send", test: (k) => k === "chat.send" }],
    order: (k) => (k === "chat.send" ? 9 : 0),
    async setup(t) {
      const unit = await prisma.businessUnit.create({ data: { tenantId: t.tid, type: "SHOP", name: "สาขาหลัก", slug: `main-${STAMP}-q` } as never });
      const acc = await sys.createSystemAutoLink(t.tid, "ACCOUNT", "บัญชี");
      const chat = await sys.createSystemAutoLink(t.tid, "CHAT", "แชทลูกค้า");
      const mem = await sys.createSystemAutoLink(t.tid, "MEMBER", "สมาชิก");
      const acc2 = (await import("@/lib/modules/account/service")) as AnyMod;
      await fx("account contact", () => acc2.createContact({ tenantId: t.tid, systemId: acc.id, kind: "CUSTOMER", name: "คุณสมชาย ใจดี", phone: "0812345678" }));
      const cust = await prisma.customer.create({ data: { tenantId: t.tid, memberSystemId: mem.id, memberCode: "QCRQ01", name: "คุณสมชาย ใจดี", phone: "0812345678" } as never });
      await prisma.chatSetting.create({ data: { tenantId: t.tid, systemId: chat.id } as never });
      const conn = await prisma.chatChannelConnection.create({ data: { tenantId: t.tid, systemId: chat.id, type: "LINE", displayName: `qc-real-${STAMP}`, externalAccountId: `qc-real-${STAMP}`, credentials: { channelAccessToken: "qc-real-fake-token", channelSecret: "qc-real-fake-secret" } } as never });
      const lineUser = `Uqcreal${STAMP}`;
      const contact = await prisma.chatContact.create({ data: { tenantId: t.tid, systemId: chat.id, channel: "LINE", channelConnectionId: conn.id, externalUserId: lineUser, displayName: "คุณสมชาย", customerId: cust.id } as never });
      const conv = await prisma.chatConversation.create({ data: { tenantId: t.tid, systemId: chat.id, channel: "LINE", channelConnectionId: conn.id, contactId: contact.id, status: "OPEN", unitId: unit.id, lastMessageAt: new Date(), firstCustomerMessageAt: new Date(), staffUnreadCount: 1 } as never });
      await prisma.chatMessage.create({ data: { tenantId: t.tid, systemId: chat.id, conversationId: conv.id, direction: "IN", type: "TEXT", body: "สนใจเครื่องชงกาแฟ 2 ชุดครับ ขอใบเสนอราคาหน่อย" } as never });
      const accSet = await call(t, "access", "PUT", { module: "chat", level: "DRAFT" }); // B3 ของเจ้าของ: แชทปริยาย READ → ร่าง+รออนุมัติ
      if (accSet.status !== 200) throw new Error(`PUT access chat=DRAFT ${accSet.status} ${JSON.stringify(accSet.body).slice(0, 120)}`);
      return { unitId: unit.id, accSys: acc.id, chatSys: chat.id, convId: conv.id, lineUser, custId: cust.id };
    },
    context: (f) => ({ chatConversationId: f.convId }),
    async verify(t, f, a) {
      const docs = await prisma.accountDocument.findMany({ where: { tenantId: t.tid, createdAt: { gte: a.startedAt } } as never, select: { id: true, docType: true, status: true, docNo: true, grandTotal: true, source: true } as never }) as AnyMod[];
      const quote = docs.find((d) => d.docType === "QUOTATION");
      const out = await prisma.chatMessage.findMany({ where: { tenantId: t.tid, conversationId: f.convId, direction: "OUT", createdAt: { gte: a.startedAt } } as never, orderBy: { createdAt: "asc" }, select: { body: true, deliveryStatus: true } as never }) as AnyMod[];
      const pushes = LINE_REQS.slice(a.lineMark).filter((r) => r.to === f.lineUser && r.path.endsWith("/push"));
      const sent = out.find((m) => m.deliveryStatus === "SENT");
      const body = String(sent?.body ?? "");
      // R-Z48 (แทนเกณฑ์ลิงก์ของ R-Z46): ข้อความที่ถึง LINE จำลองต้องมี **ยอดเงินของใบ** และ (**เลขที่ใบ** หรือคำว่า **"ฉบับร่าง"**) ·
      //   ลิงก์ = โบนัส (จด ไม่บังคับ — รุ่นนี้ไม่มีหน้าดูใบเสนอราคาสาธารณะ) · ตรวจที่ข้อความ LINE จริง ไม่ใช่แถวในฐาน
      const lineText = pushes.flatMap((r) => r.texts).join("\n");
      const flat = lineText.replace(/,/g, ""); // "9,630.00" ⇒ "9630.00"
      const amount = quote ? (Number(quote.grandTotal) / 100).toFixed(2) : ""; // สตางค์ ⇒ บาท 2 ตำแหน่ง
      const amountAlts = !amount ? [] : amount.endsWith(".00") ? [amount, amount.slice(0, -3)] : [amount];
      const hasAmount = amountAlts.some((x) => new RegExp(`(^|[^\\d.])${x.replace(".", "\\.")}(?![\\d]|\\.\\d)`).test(flat));
      const hasNo = !!quote?.docNo && lineText.includes(String(quote.docNo));
      const hasDraft = lineText.includes("ฉบับร่าง");
      const hasLink = /https?:\/\/\S+/.test(lineText);
      const data = { docs: docs.map((d) => `${d.docType}/${d.status}/${d.docNo ?? "-"}/${d.grandTotal}`), out: out.map((m) => `${m.deliveryStatus}: ${short(m.body, 80)}`), linePush: pushes.length, lineText: short(lineText, 240), amountInLine: hasAmount, docNoInLine: hasNo, draftInLine: hasDraft, linkInLine: hasLink, signed: /Shark|ผู้ช่วย AI/.test(body) };
      const refOk = hasAmount && (hasNo || hasDraft);
      const ok = !!quote && !!sent && pushes.length >= 1 && refOk;
      return {
        ok,
        why: ok ? `ใบเสนอราคาเกิด + ข้อความ OUT SENT + LINE จำลองได้รับ push ที่มียอด ${amount} บาท + ${hasNo ? `เลขที่ ${quote?.docNo}` : "\"ฉบับร่าง\""}${hasLink ? " + ลิงก์ (โบนัส)" : " · ไม่มีลิงก์ (ไม่บังคับ)"}`
          : `quote=${quote ? `${quote.status}/${quote.docNo ?? "ไม่มีเลข"}` : "ไม่มี"} · OUT SENT=${!!sent} · LINE push=${pushes.length} · ในข้อความ LINE: ยอด=${hasAmount ? "มี" : "ไม่มี"} เลขที่=${hasNo ? "มี" : "ไม่มี"} ฉบับร่าง=${hasDraft ? "มี" : "ไม่มี"}${refOk ? "" : " (R-Z45/R-Z48)"}`,
        data,
      };
    },
    dry: (_f, i) => (i === 0 ? { tools: [{ name: "load_skill", input: { skills: ["account", "chat"] } }] }
      : i === 1 ? { tools: [{ name: "account_create_document", input: { type: "QUOTATION", lines: [{ description: "เครื่องชงกาแฟ", qty: 2, unitPriceSatang: 450000 }] } }, { name: "send_customer_message", input: { body: "สวัสดีครับคุณสมชาย ใบเสนอราคาเครื่องชงกาแฟ 2 ชุดพร้อมแล้วครับ", kind: "quote" } }] }
      : { text: "ร่างใบเสนอราคาและข้อความถึงลูกค้าแล้ว รออนุมัติครับ" }),
  },
  {
    id: "pos_points",
    title: "ขาย POS v2 + แต้มสมาชิก",
    instruction: "เปิดบิลขายลาเต้เย็น 2 แก้ว แก้วละ 85 บาท จ่ายเงินสด ให้สมาชิกคุณมานะ เบอร์ 089-918-0001 แล้วสะสมแต้มให้ด้วย",
    // R-Z42/R-Z46: แต้มจากการซื้อต้องมาจากบิลที่ผูกสมาชิก (สะพานสมาชิกคิดตามอัตราร้าน) — ไม่ใช่ข้อเสนอแต้มแยกที่โมเดลกำหนดจำนวนเอง
    expect: [{ label: "pos*", test: (k) => k.startsWith("pos") }],
    order: (k) => (k.startsWith("pos") ? 0 : 5),
    hold: (k) => (k === "point_adjust" || (k.startsWith("member.") && /point/i.test(k)) ? "ไม่กด — แต้มจากการซื้อต้องมาจากบิลที่ผูกสมาชิก (R-Z42) · กดแล้วแต้มซ้ำ" : null),
    async setup(t) {
      const unit = await prisma.businessUnit.create({ data: { tenantId: t.tid, type: "SHOP", name: "สาขาหลัก", slug: `main-${STAMP}-p` } as never });
      const pos = await sys.createSystem(t.tid, "POS", "ขายหน้าร้าน"); await sys.linkUnit(t.tid, pos.id, unit.id);
      const mem = await sys.createSystem(t.tid, "MEMBER", "สมาชิก"); await sys.linkUnit(t.tid, mem.id, unit.id);
      const pts = await sys.createSystem(t.tid, "POINT", "แต้มสะสม"); await sys.linkUnit(t.tid, pts.id, unit.id);
      await prisma.pointSettings.upsert({ where: { tenantId: t.tid }, create: { tenantId: t.tid, satangPerPoint: 2500 }, update: { satangPerPoint: 2500 } } as never);
      await prisma.posProduct.create({ data: { tenantId: t.tid, systemId: pos.id, name: "ลาเต้เย็น", basePriceSatang: 8500, kind: "PRODUCT" } as never });
      await prisma.posProduct.create({ data: { tenantId: t.tid, systemId: pos.id, name: "อเมริกาโน่", basePriceSatang: 6500, kind: "PRODUCT" } as never });
      const cust = await prisma.customer.create({ data: { tenantId: t.tid, memberSystemId: mem.id, memberCode: "QCRP01", name: "คุณมานะ รักดี", phone: "0899180001" } as never });
      return { unitId: unit.id, posSys: pos.id, ptsSys: pts.id, custId: cust.id };
    },
    async verify(t, f, a) {
      const drained = await drainTenant(t);
      const sales = await prisma.posSale.findMany({ where: { tenantId: t.tid, createdAt: { gte: a.startedAt } } as never, select: { id: true, docType: true, status: true, grandTotalSatang: true, memberId: true, pointEarned: true, sourceModule: true } as never }) as AnyMod[];
      const sale = sales.find((s) => s.docType !== "REFUND" && s.status === "PAID") ?? sales[0];
      const ledger = await prisma.pointLedger.findMany({ where: { tenantId: t.tid, customerId: f.custId }, select: { type: true, delta: true, refType: true, refId: true } as never }).catch(() => [] as AnyMod[]) as AnyMod[];
      const bal = await prisma.pointBalance.findMany({ where: { tenantId: t.tid, customerId: f.custId } as never }).catch(() => [] as AnyMod[]) as AnyMod[];
      const pointsNow = bal.reduce((s, b) => s + Number(b.balance ?? 0), 0);
      // แต้มจากสะพานสมาชิก = แถว EARN อ้างบิลนั้น (refType PosSale · refId = id บิล)
      const bridgeEarn = sale ? ledger.filter((l) => l.type === "EARN" && l.refType === "PosSale" && l.refId === sale.id).reduce((s, l) => s + Number(l.delta ?? 0), 0) : 0;
      const expectEarn = sale ? Math.floor(Number(sale.grandTotalSatang) / 2500) : 0; // อัตรา fixture 25 บาท/แต้ม (ข้อมูลประกอบ · ไม่บังคับ — โปรโมชัน/กติกาอื่นของร้านอาจต่าง)
      const linked = !!sale && sale.memberId === f.custId;
      const extraAdjust = a.kinds.filter((k) => k === "point_adjust" || (k.startsWith("member.") && /point/i.test(k)));
      const data = { sales: sales.map((s) => `${s.docType}/${s.status}/${s.grandTotalSatang}/member=${s.memberId ? (s.memberId === f.custId ? "ผูกถูกคน" : "ผูกผิดคน") : "ไม่มี"}/earn=${s.pointEarned}/${s.sourceModule}`), ledger: ledger.map((l) => `${l.type}:${l.delta}:${l.refType ?? "-"}`), pointsNow, bridgeEarn, expectEarn, drained, extraAdjust };
      const ok = !!sale && sale.status === "PAID" && linked && bridgeEarn > 0 && extraAdjust.length === 0;
      const why = ok ? `บิล PAID ผูกสมาชิก + แต้มจากสะพานสมาชิก ${bridgeEarn} (อัตราร้านคาด ${expectEarn})`
        : !sale ? "ไม่มีบิล"
        : sale.status !== "PAID" ? `บิลสถานะ ${sale.status}`
        : !linked ? `บิลไม่ผูกสมาชิก (memberId ${sale.memberId ? "ผิดคน" : "ว่าง"} · R-Z42)`
        : bridgeEarn <= 0 ? `บิลผูกสมาชิกแต่ไม่มีแต้ม EARN จากบิล (คิวที่ค้าง: ${drained.pending})`
        : `โมเดลเสนอแต้มแยกซ้ำ (${extraAdjust.join(", ")}) — ไม่ได้กด`;
      return { ok, why, data };
    },
    dry: (f, i) => (i === 0 ? { tools: [{ name: "load_skill", input: { skills: ["sales", "members"] } }] }
      : i === 1 ? { tools: [{ name: "customer_search", input: { query: "0899180001" } }] }
      : i === 2 ? { tools: [{ name: "pos_create_sale", input: { lines: [{ name: "ลาเต้เย็น", qty: 2, unitPriceSatang: 8500 }], payType: "CASH", memberId: f.custId } }] }
      : { text: "เสนอเปิดบิลผูกสมาชิกแล้ว แต้มคิดตามอัตราร้านหลังอนุมัติครับ" }),
  },
  {
    id: "refund",
    title: "คืนมัดจำนัดหมาย",
    instruction: "คืนมัดจำนัดหมายของคุณสมศรีที่ยกเลิกไปแล้ว",
    expect: [{ label: "booking_refund_deposit", test: (k) => k === "booking_refund_deposit" }],
    async setup(t) {
      const unit = await prisma.businessUnit.create({ data: { tenantId: t.tid, type: "BOOKING", name: "สาขาหลัก", slug: `main-${STAMP}-b` } as never });
      const pos = await sys.createSystem(t.tid, "POS", "ขายหน้าร้าน"); await sys.linkUnit(t.tid, pos.id, unit.id);
      const bk = await sys.createSystem(t.tid, "BOOKING", "จองคิว"); await sys.linkUnit(t.tid, bk.id, unit.id);
      const service = await prisma.bookingService.create({ data: { tenantId: t.tid, unitId: unit.id, name: "นวดหน้า", durationMin: 60, bufferMin: 0, priceSatang: 120000 } as never });
      const staff = await prisma.bookingStaff.create({ data: { tenantId: t.tid, unitId: unit.id, name: "ช่างนิด" } as never });
      const startAt = new Date(Date.now() + 3 * 86_400_000);
      const appt = await prisma.appointment.create({ data: { tenantId: t.tid, unitId: unit.id, staffId: staff.id, serviceId: service.id, startAt, endAt: new Date(startAt.getTime() + 3_600_000), status: "CONFIRMED", customerName: "คุณสมศรี มีสุข", customerPhone: "0855550001", depositSatang: 50000, priceSatang: 120000 } as never });
      const svc = (await import("@/lib/modules/booking/service")) as AnyMod;
      const rd = await svc.recordDeposit({ tenantId: t.tid, unitId: unit.id }, appt.id);
      if (!rd?.ok || !rd.saleId) throw new Error(`recordDeposit: ${rd?.reason ?? "ไม่ ok"}`);
      await prisma.appointment.update({ where: { id: appt.id }, data: { status: "CANCELLED" } as never }); // ยกเลิกตรง (cancelReason ว่าง ⇒ REFUND_DUE เต็มจำนวน)
      const dep = (await import("@/lib/modules/booking/deposit")) as AnyMod;
      const info = await dep.depositInfo({ tenantId: t.tid, unitId: unit.id }, appt.id);
      if (info?.state !== "REFUND_DUE" || !(info.refundDueSatang > 0)) throw new Error(`fixture มัดจำไม่ใช่ REFUND_DUE: ${JSON.stringify(info).slice(0, 120)}`);
      return { unitId: unit.id, apptId: appt.id, saleId: rd.saleId };
    },
    async verify(t, f) {
      const dep = await prisma.posDeposit.findFirst({ where: { tenantId: t.tid, receiptSaleId: f.saleId }, select: { status: true, refundedSatang: true } as never }) as AnyMod | null;
      const refunds = await prisma.posSale.count({ where: { tenantId: t.tid, docType: "REFUND", refSaleId: f.saleId } as never });
      const audit = await prisma.auditLog.count({ where: { tenantId: t.tid, action: "booking.deposit.refund", targetId: f.apptId } as never });
      const data = { deposit: dep ? `${dep.status}/${dep.refundedSatang}` : "ไม่มี", refundBills: refunds, audit };
      const ok = dep?.status === "REFUNDED" && Number(dep.refundedSatang) === 50000 && refunds === 1;
      return { ok, why: ok ? "PosDeposit REFUNDED 500 บาท + ใบคืน 1 ใบ" : `deposit=${data.deposit} · ใบคืน=${refunds}`, data };
    },
    dry: (f, i) => (i === 0 ? { tools: [{ name: "load_skill", input: { skills: ["booking"] } }] }
      : i === 1 ? { tools: [{ name: "refund_booking_deposit", input: { appointmentId: f.apptId } }] }
      : { text: "เสนอคืนมัดจำแล้ว รออนุมัติครับ" }),
  },
];
const ONLY = (process.env.SEC_REAL_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_ATTEMPTS = 3; // ครั้งแรก + ลองซ้ำ ≤ 2 (ใบสั่ง)
const seenRooms = new Set<string>();

type PathResult = { id: string; title: string; pass: boolean; why: string; attempts: Attempt[]; fixture: string | null; skipped?: string };
const results: PathResult[] = [];
const wipe: Record<string, unknown> = {};
let usersLeft = -1;
let curFix: Fix = {};
let curDef: PathDef | null = null;
// SEC_REAL_DRY_MISS=1 (แห้งเท่านั้น): ครั้งที่ 1 ของทุกเส้นตอบข้อความเปล่าไม่เรียกเครื่องมือ ⇒ พิสูจน์ทางลองซ้ำของ R-Z46 (ห้องใหม่ · ไม่ duplicate · นับต้นทุน 2 ห้อง)
const DRY_MISS = DRY && process.env.SEC_REAL_DRY_MISS === "1";
dryScript = (_path, i) => (DRY_MISS && CUR?.attempt === 1 ? { text: "ขอรายละเอียดเพิ่มก่อนครับ" } : curDef ? curDef.dry(curFix, i) : { text: "รับทราบครับ" });

try {
  console.log(`── ${LABEL} · ${DRY ? "แห้ง (คำตอบสคริปต์ในเครื่อง)" : "โมเดลจริง"} · เพดาน ฿${MAX_THB} (${MAX_MICRO} micro @ ${THB} บาท/ดอลลาร์) ──`);
  for (const def of PATHS) {
    const res: PathResult = { id: def.id, title: def.title, pass: false, why: "", attempts: [], fixture: null };
    results.push(res);
    if (ONLY.length && !ONLY.includes(def.id)) { res.skipped = "SEC_REAL_ONLY"; res.why = "ข้ามตาม SEC_REAL_ONLY"; continue; }
    if (capHit || (REAL && spentMicroEst >= MAX_MICRO)) { res.skipped = "budget"; res.why = `ไม่รัน — ถึงเพดาน ฿${MAX_THB} แล้ว`; continue; }
    console.log(`\n▶ ${def.id} — ${def.title}\n  คำสั่ง: ${def.instruction}`);
    let t: Tenant;
    let f: Fix;
    try {
      t = await newTenant(def.id.replace("_", ""), `ร้านทดสอบเลขา (${def.title})`);
      f = await def.setup(t);
    } catch (e) {
      res.fixture = errMsg(e); res.why = `fixture ล้ม: ${res.fixture}`; console.log(`  💥 ${res.why}`); continue;
    }
    curFix = f; curDef = def;
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      if (REAL && spentMicroEst >= MAX_MICRO) { capHit = true; break; }
      // R-Z46: ครั้งที่ n>1 ใช้ข้อความต่างกัน + clientMessageId ใหม่ (ไม่งั้นชน R-Z32 "ห้องเดิมที่คำสั่งแรกเท่ากันภายใน 10 นาที")
      const instruction = n === 1 ? def.instruction : `${def.instruction} (ลองใหม่ครั้งที่ ${n})`;
      const a: Attempt = { n, instruction, roomId: null, post: 0, ms: 0, jobs: [], rounds: 0, toolsCalled: [], models: [], micro: 0, microProvider: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0, productModel: [], reply: "", kinds: [], approvals: [], expectedHit: false, verify: {}, pass: false, why: "", calls: [], dup: false, counted: false, lineMark: LINE_REQS.length, startedAt: new Date() };
      res.attempts.push(a);
      CUR = { path: def.id, attempt: n, calls: a.calls };
      const t0 = Date.now();
      try {
        const r = await call(t, "rooms", "POST", { instruction, clientMessageId: `secreal-${def.id}-${n}-${STAMP}-${Date.now().toString(36)}`, ...(def.context ? { context: def.context(f) } : {}) });
        a.post = r.status;
        a.roomId = typeof r.body.roomId === "string" ? r.body.roomId : null;
        if (r.body.duplicate === true || (a.roomId && seenRooms.has(a.roomId))) { a.dup = true; a.why = `ลองไม่ได้ — route คืนห้องเดิม (duplicate) ${a.roomId ?? ""}`; continue; }
        if (!a.roomId) { a.why = `POST rooms ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`; continue; }
        seenRooms.add(a.roomId);
        await drainRoom(t, a.roomId);
        a.ms = Date.now() - t0;
        CUR = null;
        const room = await prisma.aiRoom.findFirst({ where: { id: a.roomId, tenantId: t.tid }, select: { conversationId: true } });
        const convId = room?.conversationId ?? "";
        const jobs = await prisma.aiRoomJob.findMany({ where: { tenantId: t.tid, roomId: a.roomId }, select: { status: true, error: true, attempts: true } });
        a.jobs = jobs.map((j) => `${j.status}×${j.attempts}${j.error ? `: ${short(j.error, 80)}` : ""}`);
        const last = await prisma.aiMessage.findFirst({ where: { tenantId: t.tid, conversationId: convId, role: "ASSISTANT" }, orderBy: { createdAt: "desc" }, select: { content: true } });
        a.reply = short(last?.content ?? "", 200);
        // ข้อเสนอทั้งหมดของห้อง (รวมที่ไม่ PENDING) — kind ที่โมเดลเสนอจริง
        const allProps = await prisma.aiProposal.findMany({ where: { tenantId: t.tid, conversationId: convId }, orderBy: { createdAt: "asc" }, select: { id: true, kind: true } });
        const plans = await prisma.aiPlan.findMany({ where: { tenantId: t.tid, conversationId: convId }, select: { id: true } }).catch(() => [] as { id: string }[]);
        a.kinds = allProps.map((p) => String(p.kind));
        a.expectedHit = def.expect.every((e) => a.kinds.some(e.test));
        // อนุมัติทุกใบที่รออยู่ผ่าน route จริง (เจ้าของ · confirm2x) ตามลำดับของเส้น
        const pend = await call(t, "rooms/[id]/proposals", "GET", undefined, { id: a.roomId });
        const items = ((pend.body.items ?? []) as AnyMod[]).slice().sort((x, y) => (def.order?.(String(x.kind)) ?? 0) - (def.order?.(String(y.kind)) ?? 0));
        for (const it of items) {
          const isPlan = it.type === "plan";
          const held = !isPlan ? def.hold?.(String(it.kind)) ?? null : null;
          if (held) { a.approvals.push({ kind: String(it.kind), summary: short(it.summary, 120), ok: true, note: `(ไม่กด) ${held}` }); continue; }
          const ap = await call(t, isPlan ? "plans/[id]/approve" : "proposals/[id]/approve", "POST", { confirm2x: true }, { id: String(it.id) });
          a.approvals.push({ kind: isPlan ? `plan:${(((it.steps ?? []) as AnyMod[]).map((s) => s.kind)).join("+")}` : String(it.kind), summary: short(it.summary ?? it.title, 120), ok: ap.status === 200 && ap.body.ok === true, note: short(ap.body.note ?? ap.body.message ?? ap.body.error ?? (ap.body.results ? JSON.stringify(ap.body.results) : ""), 200) });
        }
        if (plans.length && !items.some((x) => x.type === "plan")) a.approvals.push({ kind: "plan(ไม่อยู่ในรายการรอ)", summary: `${plans.length} แผน`, ok: false, note: "" });
        await new Promise((r) => setTimeout(r, 300)); // ให้ drain ที่ approve ปลุกจบ (outbox ในโพรเซส)
        const v = await def.verify(t, f, a);
        a.verify = v.data;
        // ต้นทุนจริงของห้อง (บันทึกของผลิตภัณฑ์)
        const txns = convId ? await prisma.aiCreditTxn.findMany({ where: { tenantId: t.tid, conversationId: convId, kind: "USAGE" }, select: { amountMicro: true, tokensIn: true, tokensOut: true, model: true } }) : [];
        a.micro = txns.reduce((s, x) => s + Math.abs(x.amountMicro), 0);
        a.microProvider = a.calls.reduce((s, c) => s + c.microProvider, 0);
        a.counted = a.calls.length > 0; // R-Z46: นับต้นทุนเฉพาะครั้งที่มีรอบโมเดล (ห้องใหม่จริง)
        a.tokensIn = txns.reduce((s, x) => s + x.tokensIn, 0);
        a.tokensOut = txns.reduce((s, x) => s + x.tokensOut, 0);
        a.productModel = [...new Set(txns.map((x) => String(x.model ?? "")))];
        a.rounds = a.calls.length;
        a.toolsCalled = a.calls.flatMap((c) => c.tools);
        a.models = [...new Set(a.calls.map((c) => c.model).filter(Boolean))];
        a.cacheRead = a.calls.reduce((s, c) => s + c.cacheRead, 0);
        a.cacheWrite = a.calls.reduce((s, c) => s + c.cacheWrite, 0);
        const allApproved = a.approvals.length > 0 && a.approvals.every((x) => x.ok);
        a.pass = a.expectedHit && allApproved && v.ok;
        const missing = def.expect.filter((e) => !a.kinds.some(e.test)).map((e) => e.label);
        a.why = a.pass ? v.why
          : !a.expectedHit ? `โมเดลไม่ได้เสนอ ${missing.join(" + ")} (เสนอ: ${a.kinds.join(", ") || "ไม่มี"} · เครื่องมือที่เรียก: ${a.toolsCalled.join(", ") || "ไม่มี"})`
          : !allApproved ? `อนุมัติไม่ผ่าน: ${a.approvals.filter((x) => !x.ok).map((x) => `${x.kind} — ${x.note}`).join(" | ") || "ไม่มีรายการรออนุมัติ"}`
          : `ผลไม่ครบ: ${v.why}`;
      } catch (e) {
        a.why = `💥 ${errMsg(e)}`;
      } finally {
        CUR = null;
        if (!a.ms) a.ms = Date.now() - t0;
        const thb = Math.round((a.micro / 1e6) * THB * 100) / 100;
        console.log(`  รอบ ${n}: ${a.pass ? "✅" : "❌"} ${a.why}`);
        console.log(`     ห้อง ${a.roomId ?? "-"} · ${a.ms} ms · รอบโมเดล ${a.calls.length} (${a.toolsCalled.join(", ") || "-"}) · โมเดล ${a.models.join("/") || "-"} · ป้าย ${a.productModel.join("/") || "-"} · ${a.micro} micro ≈ ฿${thb} · in ${a.tokensIn} (cache r${a.cacheRead}/w${a.cacheWrite}) out ${a.tokensOut}`);
        console.log(`     ข้อเสนอ: ${a.approvals.map((x) => `${x.kind}${x.ok ? "✓" : "✗"}`).join(", ") || "-"} · งาน: ${a.jobs.join(" | ") || "-"}`);
        console.log(`     ตอบ: ${a.reply || "-"}`);
        console.log(`     ผล: ${JSON.stringify(a.verify).slice(0, 300)}`);
      }
      if (a.pass) break;
      if (a.dup) break; // ห้องเดิมคืนมา = ลองต่อไม่ได้ (จด ไม่ใช่ตก)
      if (a.expectedHit) break; // โมเดลเสนอครบแล้วแต่ผลไม่ผ่าน = ปัญหาฝั่งระบบ — ลองซ้ำไม่ช่วย (จดเป็น FINDING)
    }
    const real = res.attempts.filter((x) => !x.dup);
    const best = real.find((x) => x.pass) ?? real[real.length - 1];
    res.pass = !!best?.pass;
    const dups = res.attempts.length - real.length;
    res.why = best ? `${best.why}${real.length > 1 ? ` (ลอง ${real.length} ครั้ง)` : ""}${dups ? ` · ลองไม่ได้ ${dups} ครั้ง (duplicate)` : ""}` : capHit ? `ถึงเพดาน ฿${MAX_THB} ก่อนเริ่ม` : dups ? "ลองไม่ได้ (duplicate ทุกครั้ง)" : "ไม่มีรอบ";
  }
} catch (e) {
  console.log(`  💥 ${LABEL}: ${errMsg(e)}`);
} finally {
  CUR = null;
  for (const t of tenants) { try { wipe[t.slug] = await wipeTenant(t); } catch (e) { wipe[t.slug] = { err: errMsg(e) }; } }
  try { usersLeft = await cleanupUsers(); } catch (e) { console.log(`  ⚠️ users: ${errMsg(e)}`); }
  await new Promise<void>((r) => lineServer.close(() => r()));
}

// ═════════════ สรุป ═════════════
const residueTenants = await prisma.tenant.count({ where: { slug: { startsWith: `${SLUG_PREFIX}` }, id: { in: tenants.map((t) => t.tid) } } }).catch(() => -1);
const leftRows = Object.values(wipe).reduce((s: number, w) => s + Object.values(((w as AnyMod)?.left ?? {}) as Record<string, number>).reduce((a, b) => a + Math.max(0, b), 0), 0);
const residue = (residueTenants < 0 ? 1 : residueTenants) + leftRows + Math.max(0, usersLeft);
// R-Z46: ต้นทุนรวม = ครั้งที่มีรอบโมเดล > 0 เท่านั้น (ห้องละครั้ง · ไม่นับห้องเดิมซ้ำ)
const counted = results.flatMap((r) => r.attempts).filter((a) => a.counted);
const totalMicro = counted.reduce((s, a) => s + a.micro, 0);
const totalThb = Math.round((totalMicro / 1e6) * THB * 100) / 100;
const providerMicro = counted.reduce((s, a) => s + a.microProvider, 0);
const providerThb = Math.round((providerMicro / 1e6) * THB * 100) / 100;
console.log(`\n── ตารางต่อเส้น ──`);
for (const r of results) {
  for (const a of r.attempts) {
    if (a.dup) { console.log(`| ${r.id} #${a.n} | ลองไม่ได้ (duplicate) | - | - | - | - | - | - |`); continue; }
    console.log(`| ${r.id} #${a.n} | ${a.pass ? "ผ่าน" : "ตก"} | ${a.micro} micro (฿${Math.round((a.micro / 1e6) * THB * 100) / 100}) | in ${a.tokensIn} / out ${a.tokensOut} · cache r${a.cacheRead} w${a.cacheWrite} | ${a.models.join("/") || "-"} [${a.productModel.join("/") || "-"}] | ${a.ms} ms | ${a.calls.length} รอบ: ${a.toolsCalled.join(", ") || "-"} | ${a.reply.slice(0, 120)} |`);
  }
  if (!r.attempts.length) console.log(`| ${r.id} | ${r.skipped ? "ข้าม" : "ตก"} | ${r.why} |`);
}
const passed = results.filter((r) => r.pass).map((r) => r.id);
const failed = results.filter((r) => !r.pass && !r.skipped).map((r) => r.id);
const skipped = results.filter((r) => r.skipped).map((r) => r.id);
console.log(`\n${LABEL}: ${passed.length}/3 ผ่าน · ต้นทุนรวม (AiCreditTxn) ${totalMicro} micro ≈ ฿${totalThb} · ตามอัตราแคชจริง ≈ ฿${providerThb} (เพดาน ฿${MAX_THB}${capHit ? " · ถึงเพดาน" : ""}) · residue ${residue} · ถูกกันออกนอก ${BLOCKED.length}${BLOCKED.length ? ` (${[...new Set(BLOCKED)].join(",")})` : ""}`);
console.log("JSON_SUMMARY " + JSON.stringify({
  total: 3, passed: passed.length, failed, skipped, mode: DRY ? "dry" : "real",
  costMicro: totalMicro, costThb: totalThb, providerMicro, providerThb, thbPerUsd: THB, capThb: MAX_THB, capHit,
  paths: results.map((r) => ({ id: r.id, pass: r.pass, why: short(r.why, 240), attempts: r.attempts.map((a) => ({ n: a.n, pass: a.pass, dup: a.dup, counted: a.counted, micro: a.micro, microProvider: a.microProvider, tokensIn: a.tokensIn, tokensOut: a.tokensOut, cacheRead: a.cacheRead, cacheWrite: a.cacheWrite, models: a.models, productModel: a.productModel, ms: a.ms, rounds: a.calls.length, tools: a.toolsCalled, kinds: a.kinds, approvals: a.approvals.map((x) => `${x.kind}:${x.ok ? "ok" : "fail"}`), reply: a.reply.slice(0, 200) })), fixture: r.fixture })),
  fixtureWarnings: fxErr, blocked: [...new Set(BLOCKED)], residue,
}));
await prisma.$disconnect().catch(() => undefined);
process.exit(residue === 0 && failed.length === 0 ? 0 : 1);
