// QC — SECRETARY S3a.1-S1 · แก้ผลนักล่า L2/L3: worker lease/fence · reaper · job ใน tx ของ startRoom · assist cap · refund โควตา · cmid · push key
// สัญญา: ledger/secretary-briefs/sec-brief-S3a.1-S1.md · RESOLUTIONS §Z.1 R-Z1…R-Z12
//
// กลุ่มข้อ:
//   W1 lease จากเวลา claim · W2 fence (รันซ้อน ⇒ ASSISTANT 1) · W3 reaper · W4 job ใน tx (startRoom · createTenantFromApp) · W5 static (ai_disabled requeue · อายุ QUEUED · maxDuration/jobIds · hourly isDue · roomJobs ลำดับแรก)
//   W6 tool idempotent · W7 assist cap (note room-worker) + chat/send ปฏิเสธห้องเลขา + ห้องปิด FAILED · W8 refund โควตา · W9 cmid · W10 static push key/ลำดับต่อห้อง · D fitness
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s3a1-s1.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s3a1-s1";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const ACT_FILE = join(ROOT, "src/lib/ai/secretary/actions.ts");
const KT_FILE = join(ROOT, "src/lib/ai/kind-tables.ts");
const SEC_DIR = join(ROOT, "src/app/api/mobile/secretary");
const STARTED = existsSync(SEC_DIR);
if (!FORCED && !STARTED) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/app/api/mobile/secretary/ (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-sec-s3a1-s1"); // route ของ inbox import lib/env ตอนโหลด (SESSION_SECRET ฯลฯ) — โหลดจาก QC_ENV_FILE (.env.qc-sec) ไม่พิมพ์ค่า
process.env.SHARK_AI_MOCK = "1";
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
async function throws(fn: () => Promise<unknown> | unknown): Promise<string | null> { try { await fn(); return null; } catch (e) { return errMsg(e); } }
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { prisma } = await import("@/lib/core/db");
// (helpers ด้านล่างใช้ existsSync/readFileSync จาก import ด้านบน)
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const J = (u: string, method: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://qc.local${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const route = async (p: string): Promise<Record<string, Handler> | null> => { try { return (await import(p)) as unknown as Record<string, Handler>; } catch { return null; } };
const P = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const jsonOf = async (r: Response) => { try { return (await r.json()) as Record<string, unknown>; } catch { return {}; } };




type Reply = { text?: string; toolCalls?: { id: string; name: string; args: unknown }[] };
class Scripted {
  calls = 0;
  constructor(private queue: Reply[], private delayMs = 0, private throwTimes = 0) {}
  async chat(): Promise<Record<string, unknown>> {
    this.calls++;
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.throwTimes > 0) { this.throwTimes--; throw new Error("provider down (qc)"); }
    const r = this.queue.length > 1 ? this.queue.shift()! : (this.queue[0] ?? { text: "รับทราบครับ" });
    return { text: r.text ?? "", toolCalls: r.toolCalls, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}
const auth = (await import("@/lib/mobile/auth")) as AnyMod;
const worker = (await import("@/lib/ai/secretary/worker")) as AnyMod;
const rooms = (await import("@/lib/ai/secretary/rooms")) as AnyMod;
const service = (await import("@/lib/ai/service")) as AnyMod;
const credit = (await import("@/lib/ai/credit")) as AnyMod;
const tenants = (await import("@/lib/mobile/tenants")) as AnyMod;
const LEASE = Number(worker.ROOM_JOB_LEASE_MS ?? 120_000);
const U = { owner: "qcs3s1-owner", staff: "qcs3s1-staff", maker: "qcs3s1-maker" };
let tid = ""; let tid2 = "";
const cleanup = async () => {
  for (const t of [tid, tid2].filter(Boolean)) {
    for (const m of ["aiActionLog", "aiProposal", "aiPlan", "aiMessage", "aiRoomJob", "aiRoomMember", "aiRoom", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "aiMemory", "aiSystemAccess", "aiApprovalRule", "aiScheduledTask", "chatMessage", "chatConversation", "chatContact", "chatSetting", "membership", "appSystem", "businessUnit"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: t } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: t } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { OR: [{ slug: { startsWith: "qc-sec-s3s1-" } }, { name: "QC S3S1 ร้านใหม่" }], createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await (prisma as AnyMod).aiSecretary.deleteMany({ where: { userId: { startsWith: "qcs3s1-" } } }); } catch { /* */ }
  try { await prisma.session.deleteMany({ where: { userId: { startsWith: "qcs3s1-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs3s1-" } } }); } catch { /* */ }
  try { await (prisma as AnyMod).chatRateBucket.deleteMany({ where: { key: { contains: "qcs3s1" } } }); } catch { /* */ }
};
const actorOf = (userId: string, role: "OWNER" | "STAFF", permissions: Record<string, unknown> = {}) => ({ kind: "member" as const, tenantId: tid, userId, membership: { role, unitAccess: ["*"], permissions } });
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const src = (p: string) => rd(join(ROOT, p));
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S3a1-S1", slug: `qc-sec-s3s1-${Date.now().toString(36)}` } }); tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `คุณ${k}` } });
  const perm = { "ai.chat.send": true, "chat.conversation.read": true, "chat.message.send": true, "kanban.card.read": true };
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } as never });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staff, role: "STAFF", unitAccess: ["*"], permissions: perm, acceptedAt: new Date() } as never });
  const OWNER = { tenantId: tid, actor: actorOf(U.owner, "OWNER") };
  const tok = async (uid: string) => (await auth.issueMobileToken(uid)).token;
  const H = { authorization: `Bearer ${await tok(U.owner)}`, "x-tenant-id": tid };
  const call = async (p: string, meth: string, body?: unknown, headers: Record<string, string> = H, params?: Record<string, string>) => {
    const m = await route(`@/app/api/mobile/${p}/route`); const fn = m?.[meth]; if (!fn) return { status: 0, json: {} as Record<string, unknown> };
    const res = await fn(J(`/api/mobile/${p.replace("[id]", params?.id ?? "")}`, meth, body, headers), params ? P(params) : undefined);
    return { status: res.status, json: await jsonOf(res) };
  };
  const newRoom = async (instruction: string) => { const r = await rooms.startRoom(OWNER, { instruction }); if (!r.ok) throw new Error("startRoom: " + JSON.stringify(r)); let job = await prisma.aiRoomJob.findUnique({ where: { messageId: r.messageId } }); if (!job) job = await worker.enqueueRoomJob(tid, r.roomId, r.messageId, U.owner); return { ...r, jobId: job!.id }; };

  console.log("── W4: job อยู่ใน tx ของ startRoom ──");
  {
    const r = await rooms.startRoom(OWNER, { instruction: "สรุปยอดขาย" });
    const job = r.ok ? await prisma.aiRoomJob.findUnique({ where: { messageId: r.messageId } }) : null;
    chk("W4-1", "startRoom ⇒ มีแถว AiRoomJob ของ messageId ทันที (ไม่ต้อง enqueue แยก) · ผลมี jobId", r.ok === true && !!job && job.status === "QUEUED" && typeof (r as AnyMod).jobId === "string", JSON.stringify({ ok: r.ok, job: job?.status, jobId: (r as AnyMod).jobId }));
    const ct = await tenants.createTenantFromApp(U.maker, { name: "QC S3S1 ร้านใหม่", type: "cafe", systems: ["pos"] });
    tid2 = String(ct?.tenantId ?? ct?.tenant?.id ?? "");
    const room2 = tid2 ? await prisma.aiRoom.findFirst({ where: { tenantId: tid2 } }) : null;
    const jobs2 = room2 ? await prisma.aiRoomJob.count({ where: { roomId: room2.id } }) : -1;
    chk("W4-2", "createTenantFromApp ⇒ ห้องแรกมี AiRoomJob 1 แถว (ไม่ค้างตลอดกาล)", !!tid2 && !!room2 && jobs2 === 1, JSON.stringify({ tid2: !!tid2, room: !!room2, jobs2, ct: JSON.stringify(ct).slice(0, 120) }));
  }

  console.log("── W1/W2: lease · fence ──");
  {
    const a = await newRoom("งาน lease");
    const past = new Date(Date.now() - 200_000);
    const pA = new Scripted([{ text: "ตอบ A" }], 2500);
    const runA = worker.runRoomJobs({ provider: pA, now: past, limit: 1, jobIds: [a.jobId] });
    await new Promise((r) => setTimeout(r, 600));
    const mid = await prisma.aiRoomJob.findUnique({ where: { id: a.jobId } });
    const leaseOk = !!mid?.leaseUntil && mid.leaseUntil.getTime() >= Date.now() + LEASE - 5_000;
    // รอบ B แกล้งว่า lease หมด (now อนาคต) — ต้องไม่ทำให้มี ASSISTANT 2 แถว
    const pB = new Scripted([{ text: "ตอบ B" }], 0);
    const runB = worker.runRoomJobs({ provider: pB, now: new Date(Date.now() + LEASE + 60_000), limit: 1, jobIds: [a.jobId] });
    const [ra, rb] = await Promise.all([runA, runB]);
    const asst = await prisma.aiMessage.count({ where: { conversationId: a.conversationId, role: "ASSISTANT" } });
    const fin = await prisma.aiRoomJob.findUnique({ where: { id: a.jobId } });
    chk("W1-1", "leaseUntil คิดจากเวลา claim จริง (ไม่ใช่ now ต้นรอบ) ≥ now+LEASE-5s ระหว่างทำงาน", leaseOk && mid?.status === "RUNNING", JSON.stringify({ status: mid?.status, lease: mid?.leaseUntil, now: new Date() }));
    chk("W2-1", "รันซ้อน (รอบ B now อนาคต) ⇒ ASSISTANT 1 แถวเท่านั้น · job จบ DONE · provider ถูกเรียกรวมไม่เกิน 2", asst === 1 && fin?.status === "DONE" && pA.calls + pB.calls <= 2, JSON.stringify({ asst, status: fin?.status, calls: [pA.calls, pB.calls], ra, rb }));
  }

  console.log("── W3: reaper ──");
  {
    const r = await newRoom("งานค้าง");
    await prisma.aiRoomJob.update({ where: { id: r.jobId }, data: { status: "RUNNING", attempts: 3, leaseUntil: new Date(Date.now() - 60_000), startedAt: new Date(Date.now() - 600_000) } });
    await worker.runRoomJobs({ provider: new Scripted([{ text: "x" }]), now: new Date(), limit: 5 });
    const j = await prisma.aiRoomJob.findUnique({ where: { id: r.jobId } });
    chk("W3-1", "RUNNING ∧ lease หมด ∧ attempts≥3 ⇒ reaper ตั้ง FAILED + error ไทย (ไม่ค้างตลอดกาล)", j?.status === "FAILED" && thai(j?.error), JSON.stringify({ status: j?.status, error: j?.error?.slice(0, 60) }));
  }

  console.log("── W5: static ──");
  {
    const w = src("src/lib/ai/secretary/worker.ts"), rj = src("src/lib/ai/secretary/room-jobs-job.ts"), rr = src("src/app/api/mobile/secretary/rooms/route.ts"), sr = src("src/app/api/mobile/secretary/rooms/[id]/send/route.ts"), hr = src("src/app/api/cron/hourly/route.ts"), sc = src("src/lib/ai/secretary/scheduled.ts"), mj = src("src/lib/platform/minute-jobs.ts"), pv = src("src/lib/ai/provider.ts");
    chk("W5-1", "worker: ai_disabled ⇒ requeue (ไม่ FAILED) · มี AbortSignal.timeout ที่ provider fetch", /ai_disabled[\s\S]{0,300}(requeue|QUEUED)/.test(w) && /AbortSignal\.timeout\(/.test(pv), JSON.stringify({ requeue: /ai_disabled[\s\S]{0,300}(requeue|QUEUED)/.test(w), abort: /AbortSignal\.timeout\(/.test(pv) }));
    chk("W5-2", "minute job หยิบ QUEUED ที่อายุ ≥45 วิ (createdAt < now-45s) · roomJobs ลงทะเบียนก่อนงาน minute อื่นพร้อมงบของตัวเอง", /45_000|45 \* 1000|45s|minAgeMs/.test(w + rj) && mj.indexOf("secretary.roomJobs") < mj.indexOf("crm.heartbeat"), JSON.stringify({ age: /45_000|45 \* 1000|45s|minAgeMs/.test(w + rj), first: mj.indexOf("secretary.roomJobs") < mj.indexOf("crm.heartbeat") }));
    chk("W5-3", "route rooms/send: `export const maxDuration` + runRoomJobs({ jobIds:[…] , deadline }) · hourly: isDue ใช้ ≥ (ตามหลังได้) และไม่เรียกโมเดล inline", /export const maxDuration/.test(rr) && /export const maxDuration/.test(sr) && /jobIds:\s*\[/.test(rr) && /jobIds:\s*\[/.test(sr) && /deadline/.test(rr) && /hour\s*>=\s*|>=\s*t\.hourBkk|>= task\.hourBkk|hourBkk\s*<=/.test(sc) && !/sendMessage\(/.test(sc.slice(sc.indexOf("async function runOwnedTask"))), JSON.stringify({ rrMax: /export const maxDuration/.test(rr), srMax: /export const maxDuration/.test(sr), jobIds: /jobIds:\s*\[/.test(rr) && /jobIds:\s*\[/.test(sr), isDue: /hour\s*>=\s*|>=\s*t\.hourBkk|>= task\.hourBkk|hourBkk\s*<=/.test(sc), inline: /sendMessage\(/.test(sc.slice(sc.indexOf("async function runOwnedTask"))) }));
  }

  console.log("── W6: tool idempotent ──");
  {
    const r = await newRoom("ส่งข้อความหาลูกค้า");
    const sys = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT", name: "แชท" } as never });
    await prisma.chatSetting.create({ data: { tenantId: tid, systemId: sys.id } as never }).catch(() => null);
    const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: sys.id, channel: "WEBCHAT", externalUserId: `qcs3s1-c-${Date.now().toString(36)}`, displayName: "ลูกค้า", customerId: "qcs3s1-member-1" } as never });
    const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: sys.id, channel: "WEBCHAT", contactId: contact.id, status: "OPEN", lastMessageAt: new Date(), firstCustomerMessageAt: new Date() } as never });
    await (prisma as AnyMod).aiSystemAccess.upsert({ where: { tenantId_module: { tenantId: tid, module: "chat" } }, create: { tenantId: tid, module: "chat", level: "DRAFT", setById: U.owner }, update: { level: "DRAFT" } }).catch(() => null);
    const toolReply = { text: "", toolCalls: [{ id: "tc1", name: "send_customer_message", args: { conversationId: conv.id, body: "สวัสดีครับ" } }] };
    const p = new Scripted([toolReply, { text: "ร่างแล้วครับ" }]);
    const deps = { provider: p, source: "CHAT", userMessageId: r.messageId };
    await service.sendMessage(OWNER, { conversationId: r.conversationId, text: "ส่งข้อความหาลูกค้า" }, deps);
    const p2 = new Scripted([toolReply, { text: "ร่างแล้วครับ" }]);
    await service.sendMessage(OWNER, { conversationId: r.conversationId, text: "ส่งข้อความหาลูกค้า" }, { ...deps, provider: p2 });
    const n = await prisma.aiProposal.count({ where: { tenantId: tid, conversationId: r.conversationId, kind: "chat.send" } });
    chk("W6-1", "sendMessage ซ้ำด้วย userMessageId เดิม + toolCall เดิม ⇒ ข้อเสนอ chat.send 1 ใบ (กุญแจ tc:<messageId>:<i>)", n === 1, JSON.stringify({ n }));
  }

  console.log("── W7: assist cap · ห้องเลขาผ่าน chat/send · ห้องปิด ──");
  {
    const r = await newRoom("ห้องสำหรับ cap");
    await prisma.aiCreditTxn.create({ data: { tenantId: tid, kind: "USAGE", source: "CHAT", balanceAfter: 0, amountMicro: -600_000, model: "scripted", note: "qc non-worker", conversationId: r.conversationId } as never });
    const used1 = await credit.assistUsedMicroOfDay(tid);
    await prisma.aiCreditTxn.create({ data: { tenantId: tid, kind: "USAGE", source: "CHAT", balanceAfter: 0, amountMicro: -700_000, model: "scripted", note: "room-worker:" + r.jobId, conversationId: r.conversationId } as never });
    const used2 = await credit.assistUsedMicroOfDay(tid);
    chk("W7-1", "assistUsedMicroOfDay: แถวในห้องเลขาที่ไม่ใช่ worker ถูกนับ (≥600k) · แถว note room-worker: ไม่ถูกนับ (ไม่เพิ่ม)", used1.usedMicro >= 600_000 && used2.usedMicro === used1.usedMicro, JSON.stringify({ used1: used1.usedMicro, used2: used2.usedMicro }));
    const cs = await call("chat/send", "POST", { conversationId: r.conversationId, text: "แอบส่งผ่านทางเดิม" }, H);
    const lim = []; for (let i = 0; i < 22; i++) lim.push((await call("chat/send", "POST", { conversationId: "nosuch", text: "x" }, H)).status);
    chk("W7-2", "POST /api/mobile/chat/send กับ conversation ของห้องเลขา ⇒ 4xx (ไม่ใช่ 200/SSE) · มี rate-limit (ครั้งที่ ≥21 = 429)", cs.status >= 400 && cs.status < 500 && lim.includes(429), JSON.stringify({ cs: cs.status, lim: lim.slice(-3) }));
    const c = await newRoom("ห้องจะปิด");
    await rooms.closeRoom(OWNER, c.roomId);
    const pc = new Scripted([{ text: "ไม่ควรถูกเรียก" }]);
    await worker.runRoomJobs({ provider: pc, now: new Date(), limit: 5, jobIds: [c.jobId] });
    const cj = await prisma.aiRoomJob.findUnique({ where: { id: c.jobId } });
    chk("W7-3", "ห้องปิดแล้ว job ค้าง ⇒ FAILED โดยไม่เรียกโมเดล", cj?.status === "FAILED" && pc.calls === 0, JSON.stringify({ status: cj?.status, calls: pc.calls }));
  }

  console.log("── W8: คืนโควตาเมื่อ job แรกล้ม ──");
  {
    const before = (await prisma.aiJobCounter.findFirst({ where: { tenantId: tid } }))?.jobs ?? 0;
    const r = await newRoom("งานที่จะล้ม");
    const after1 = (await prisma.aiJobCounter.findFirst({ where: { tenantId: tid } }))?.jobs ?? 0;
    const pf = new Scripted([{ text: "x" }], 0, 9);
    for (let i = 0; i < 4; i++) await worker.runRoomJobs({ provider: pf, now: new Date(Date.now() + i * (LEASE + 1000)), limit: 5, jobIds: [r.jobId] });
    const j = await prisma.aiRoomJob.findUnique({ where: { id: r.jobId } });
    const room = await prisma.aiRoom.findUnique({ where: { id: r.roomId } });
    const after2 = (await prisma.aiJobCounter.findFirst({ where: { tenantId: tid } }))?.jobs ?? 0;
    chk("W8-1", "startRoom นับ +1 · job แรกล้ม 3 ครั้ง ⇒ FAILED และคืนโควตา (jobsCounted 0 · ตัวนับกลับเท่าเดิม) · คืนครั้งเดียว", after1 === before + 1 && j?.status === "FAILED" && room?.jobsCounted === 0 && after2 === before, JSON.stringify({ before, after1, after2, status: j?.status, counted: room?.jobsCounted }));
    const se = src("src/lib/ai/secretary/rooms.ts");
    chk("W8-2", "startRoom ปฏิเสธเมื่อ !aiEnabled() (static)", /aiEnabled\(\)/.test(se), "grep aiEnabled ใน rooms.ts");
  }

  console.log("── W9: cmid ──");
  {
    const r = await newRoom("ห้อง cmid");
    const bad = await call("secretary/rooms/[id]/send", "POST", { text: "x", clientMessageId: "a:b" }, H, { id: r.roomId });
    const s1 = await call("secretary/rooms/[id]/send", "POST", { text: "ข้อความ", clientMessageId: "qcs3s1-cm-1" }, H, { id: r.roomId });
    const s2 = await call("secretary/rooms/[id]/send", "POST", { text: "ข้อความ", clientMessageId: "qcs3s1-cm-1" }, H, { id: r.roomId });
    chk("W9-1", "send: cmid มี ':' ⇒ 400 · ส่งซ้ำ ⇒ duplicate:true พร้อม messageId เดิม", bad.status === 400 && s1.status === 200 && s2.status === 200 && s2.json.duplicate === true && typeof s2.json.messageId === "string" && s2.json.messageId === s1.json.messageId, JSON.stringify({ bad: bad.status, s1: [s1.status, s1.json.messageId], s2: [s2.status, s2.json.duplicate, s2.json.messageId] }));
    const sh = src("src/app/api/mobile/secretary/_shared.ts"), sa = src("src/lib/ai/secretary/server-actions.ts");
    chk("W9-2", "claim helpers ไม่กลืน error (ไม่มี .catch(() => {}) ใน release/remember) · กุญแจ send มี userId · secStartRoomAction รับ clientMessageId", !/release[\s\S]{0,200}\.catch\(\(\) => \{\}\)/.test(sh) && !/remember[\s\S]{0,200}\.catch\(\(\) => \{\}\)/.test(sh) && /sec:cmid:\$\{tenantId\}:\$\{roomId\}:\$\{userId\}/.test(sh) && /clientMessageId/.test(sa), JSON.stringify({ userKey: /sec:cmid:\$\{tenantId\}:\$\{roomId\}:\$\{userId\}/.test(sh), action: /clientMessageId/.test(sa) }));
  }

  console.log("── W10: static push key · ลำดับต่อห้อง ──");
  {
    const w = src("src/lib/ai/secretary/worker.ts");
    chk("W10-1", "push ห้อง: กุญแจกันสแปมรวม jobId/messageId · claim ข้ามห้องที่มี RUNNING ที่ lease ยังไม่หมด", /(jobId|messageId)[^\n]{0,80}(dedupe|key|link)|(dedupe|key|link)[^\n]{0,80}(jobId|messageId)/.test(w) && /RUNNING[\s\S]{0,400}(roomId|notIn|NOT)/.test(w), "grep worker.ts");
  }
} catch (e) {
  const detail = (e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : JSON.stringify(e)).slice(0, 400);
  console.log(`  💥 ${detail}`); chk("CRASH", "ข้อสอบรันจบ", false, detail.slice(0, 200));
} finally { await cleanup(); }

console.log("── D: fitness ──");
for (const i of [1, 2]) { const r = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: process.env, timeout: 600_000 }); chk(`D-${i}`, `pnpm fitness ครั้งที่ ${i} = 0`, r.status === 0, (r.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | ")); }
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน · ${skipped.length} ข้าม`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.length ? 1 : 0);
