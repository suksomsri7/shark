// QC — B27 งานล้มในห้อง Lekaa (17 พ.ย. 2026) · เจ้าของเห็นบนเครื่องจริง: "ลบแชททั้งหมด" ค้าง "กำลังทำ" 2 นาทีแล้วเงียบเป็น "รอคำสั่งเพิ่ม"
//   (OpenRouter 402 Insufficient credits × 2 + ตอบว่าง × 1 ⇒ FAILED ไม่มีอะไรบอกในห้อง)
// เรียก worker/handler ตรง (แบบ qc-sec-s3a1-s1) บนฐาน QC เลขาเท่านั้น · ผู้ให้บริการ = Scripted ในไฟล์นี้ / MockProvider (SHARK_AI_MOCK=1) — ไม่เรียกโมเดลจริง
//
// กลุ่มข้อ:
//   C  classifyAiProviderError (pure): 401/402/403 = account · 429/500/503/ตอบว่าง/timeout/อื่น ๆ = transient · AiProviderHttpError ข้อความเดิม
//   A  402 ⇒ FAILED ครั้งแรก (provider ถูกเรียก 1 ครั้ง) · ข้อความไทยล้วน (ไม่มี 402/credit/OpenRouter) · OpsEvent ERROR `ai.provider-account` มีสาเหตุจริง ·
//      push ล้มยังอยู่ (static) · ข้อความ "ทำไม่ได้: …"
//   T  transient (503) ⇒ ลองซ้ำครบ 3 ครั้งแล้ว FAILED ERR_GAVE_UP (พฤติกรรมเดิม)
//   D  DTO: GET rooms/[id] `failed` {error, canRetry} เมื่อไม่มีคำตอบตามมา · status เดิม (OPEN) · การ์ดรายการ failed:true ·
//      มีคำตอบเลขาหลังข้อความนั้น ⇒ failed:null/false · งานล่าสุดไม่ล้ม (QUEUED) ⇒ null · ห้องปิด ⇒ null
//   R  POST rooms/[id]/retry: คนนอกร้าน 404 · สมาชิกห้องที่ไม่ใช่ผู้เปิด 403 (canRetry false) · ห้องปิด 409 closed · jobId ไม่ตรง 409 ·
//      ผู้เปิดห้อง 200 (job เดิม · ไม่มีข้อความ USER ซ้ำ · รุ่นถัดไป) → DONE + คำตอบ ⇒ failed หาย · กดซ้ำ 409 not_failed
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-b27-failed.mts
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-sec-b27-failed");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-b27-failed";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
process.env.SHARK_AI_MOCK = "1";
delete process.env.OPS_ALERT_EMAIL; // ไม่ส่งอีเมลจริงระหว่างข้อสอบ (logOps ยังเขียน OpsEvent)
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { prisma } = await import("@/lib/core/db");
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const J = (u: string, method: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://qc.local${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const P = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const jsonOf = async (r: Response) => { try { return (await r.json()) as Record<string, unknown>; } catch { return {}; } };
const mods: Record<string, Record<string, Handler>> = {};
const call = async (p: string, method: string, body: unknown, headers: Record<string, string>, params: Record<string, string> = {}) => {
  const m = (mods[p] ??= (await import(`@/app/api/mobile/secretary/${p}/route`)) as unknown as Record<string, Handler>);
  if (typeof m[method] !== "function") return { status: 0, body: {} as Record<string, unknown> };
  const r = await m[method]!(J(`/api/mobile/secretary/${p}`, method, body, headers), P(params));
  return { status: r.status, body: await jsonOf(r) };
};

const provider = (await import("@/lib/ai/provider")) as AnyMod;
const worker = (await import("@/lib/ai/secretary/worker")) as AnyMod;
const rooms = (await import("@/lib/ai/secretary/rooms")) as AnyMod;
const LEASE = Number(worker.ROOM_JOB_LEASE_MS ?? 120_000);

/** ผู้ให้บริการตามบท: โยน `errs` ตามลำดับก่อน แล้วตอบข้อความ */
class Scripted {
  calls = 0;
  constructor(private errs: unknown[], private reply = "รับทราบครับ") {}
  async chat(): Promise<Record<string, unknown>> {
    this.calls++;
    if (this.errs.length) throw this.errs.shift();
    return { text: this.reply, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}

const U = { owner: "qcb27f-owner", staff: "qcb27f-staff", out: "qcb27f-out" };
let tid = "", tid2 = "";
const cleanup = async () => {
  for (const t of [tid, tid2].filter(Boolean)) {
    for (const m of ["aiActionLog", "aiProposal", "aiPlan", "aiMessage", "aiRoomJob", "aiRoomMember", "aiRoom", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "aiSystemAccess", "aiApprovalRule", "appNotification", "opsEvent", "membership"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: t } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: t } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-b27f-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await (prisma as AnyMod).aiSecretary.deleteMany({ where: { userId: { startsWith: "qcb27f-" } } }); } catch { /* */ }
  try { await prisma.session.deleteMany({ where: { userId: { startsWith: "qcb27f-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcb27f-" } } }); } catch { /* */ }
  try { await (prisma as AnyMod).chatRateBucket.deleteMany({ where: { key: { contains: "qcb27f-" } } }); } catch { /* */ }
};

try {
  console.log("── C: classifyAiProviderError (pure) ──");
  {
    const cl = (e: unknown) => provider.classifyAiProviderError(e) as { kind: string; status: number | null };
    const H = provider.AiProviderHttpError;
    const e402 = new H(402, '{"error":{"message":"Insufficient credits"}}') as Error & { status: number };
    const acc = [cl(e402), cl(new H(401, "bad key")), cl(new H(403, "forbidden")), cl(new Error("AI provider 402: Insufficient credits"))];
    const tr = [cl(new H(429, "rate")), cl(new H(500, "x")), cl(new H(503, "x")), cl(new Error("AI provider ตอบว่าง")), cl(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })), cl("weird"), cl(null)];
    chk("C-1", "401/402/403 (ทั้งชนิด error และข้อความ \"AI provider 402:\") = account", acc.every((x) => x.kind === "account") && acc[0]!.status === 402, JSON.stringify(acc));
    chk("C-2", "429 · 500 · 503 · ตอบว่าง · timeout · ไม่รู้จัก = transient", tr.every((x) => x.kind === "transient"), JSON.stringify(tr));
    chk("C-3", "AiProviderHttpError ข้อความเดิม \"AI provider 402: …\" (log/ข้อสอบเดิมไม่เปลี่ยน) · เป็น Error", e402 instanceof Error && e402.message.startsWith("AI provider 402: ") && e402.status === 402, e402.message);
  }

  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC B27 failed", slug: `qc-sec-b27f-${Date.now().toString(36)}` } }); tid = t.id;
  const t2 = await prisma.tenant.create({ data: { name: "QC SEC B27 failed อื่น", slug: `qc-sec-b27f-o-${Date.now().toString(36)}` } }); tid2 = t2.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `ผู้ใช้ ${k}` } });
  const perms = { "ai.chat.send": true };
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staff, role: "STAFF", unitAccess: ["*"], permissions: perms as never, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid2, userId: U.out, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const OWNER = { tenantId: tid, actor: { kind: "member" as const, tenantId: tid, userId: U.owner, membership: { role: "OWNER", unitAccess: ["*"], permissions: {} } } };
  const auth = (await import("@/lib/mobile/auth")) as AnyMod;
  const tok = async (uid: string) => (await auth.issueMobileToken(uid)).token;
  const H = { authorization: `Bearer ${await tok(U.owner)}`, "x-tenant-id": tid };
  const HS = { authorization: `Bearer ${await tok(U.staff)}`, "x-tenant-id": tid };
  const outTok = await tok(U.out);
  const HO = { authorization: `Bearer ${outTok}`, "x-tenant-id": tid };
  const pushes: string[] = [];
  const post = async (_to: unknown, msg: { body?: string }) => { pushes.push(String(msg?.body ?? "")); return { ok: true }; };
  const newRoom = async (instruction: string) => {
    const r = await rooms.startRoom(OWNER, { instruction });
    if (!r.ok) throw new Error("startRoom: " + JSON.stringify(r));
    return r as { roomId: string; conversationId: string; messageId: string; jobId: string };
  };
  const userMsgs = (conversationId: string) => prisma.aiMessage.count({ where: { tenantId: tid, conversationId, role: "USER" } });

  console.log("── A: 402 ⇒ ล้มทันที ──");
  const a = await newRoom("ลบแชททั้งหมด");
  {
    const p402 = new Scripted([new provider.AiProviderHttpError(402, '{"error":{"message":"Insufficient credits","code":402}}')]);
    const since = new Date(Date.now() - 1000);
    const res = await worker.runRoomJobs({ provider: p402, post, now: new Date(), limit: 1, jobIds: [a.jobId] });
    const j = await prisma.aiRoomJob.findUnique({ where: { id: a.jobId } });
    const err = String(j?.error ?? "");
    chk("A-1", "402 ⇒ FAILED ตั้งแต่ครั้งแรก (provider ถูกเรียก 1 ครั้ง · attempts 1)", j?.status === "FAILED" && j?.attempts === 1 && p402.calls === 1 && res.failed === 1, JSON.stringify({ status: j?.status, attempts: j?.attempts, calls: p402.calls, res }));
    chk("A-2", "ข้อความถึงร้าน = ERR_AI_UNAVAILABLE ไทยล้วน · ไม่มีชื่อผู้ให้บริการ/รหัส HTTP/คำว่าเครดิต", err === worker.ERR_AI_UNAVAILABLE && /ระบบ AI ยังใช้งานไม่ได้ชั่วคราว/.test(err) && !/402|credit|เครดิต|openrouter|anthropic|provider/i.test(err), err);
    const ev = await prisma.opsEvent.findMany({ where: { tenantId: tid, level: "ERROR", source: worker.OPS_SOURCE_PROVIDER_ACCOUNT, createdAt: { gte: since } } });
    const d = ev.map((e) => `${e.message} ${e.detail ?? ""}`).join(" | ");
    chk("A-3", "OpsEvent ERROR แหล่ง ai.provider-account 1 แถว · มีสาเหตุจริง (402 + Insufficient credits) + รหัสงาน", ev.length === 1 && /402/.test(d) && /Insufficient credits/.test(d) && d.includes(a.jobId), `${ev.length} · ${d.slice(0, 200)}`);
    const w = readFileSync(join(ROOT, "src/lib/ai/secretary/worker.ts"), "utf8");
    const branch = w.slice(w.indexOf('pf.kind === "account"'), w.indexOf('pf.kind === "account"') + 700);
    chk("A-4", "push ล้มยังอยู่: ทาง account คืน fail(ERR_AI_UNAVAILABLE) (push ปริยาย true) → runRoomJobs push `ทำไม่ได้: …` (static)", /fail\(ERR_AI_UNAVAILABLE\)/.test(branch) && !/fail\(ERR_AI_UNAVAILABLE,\s*false\)/.test(branch) && /outcome\.push\) await pushRoom\(job, `\$\{PUSH_FAILED_PREFIX\}/.test(w), branch.slice(0, 160));
    chk("A-5", "logOps ERROR ใช้ทางแจ้งเตือนเดิม (OpsAlertState throttle · OPS_ALERT_EMAIL) — ไม่มีช่องทางใหม่ (static)", /level !== "ERROR"/.test(readFileSync(join(ROOT, "src/lib/core/ops.ts"), "utf8")) && /logOps\("ERROR", OPS_SOURCE_PROVIDER_ACCOUNT/.test(w) && !/sendEmail|sendPushToUser\(/.test(branch), "");
  }

  console.log("── T: transient ยังลองซ้ำ 3 ครั้ง ──");
  {
    const b = await newRoom("สรุปยอดวันนี้");
    const p503 = new Scripted([new provider.AiProviderHttpError(503, "upstream"), new provider.AiProviderHttpError(503, "upstream"), new Error("AI provider ตอบว่าง"), new Error("x")]);
    const r1 = await worker.runRoomJobs({ provider: p503, post, now: new Date(), limit: 1, jobIds: [b.jobId] });
    const j1 = await prisma.aiRoomJob.findUnique({ where: { id: b.jobId } });
    for (let i = 1; i <= 2; i++) await worker.runRoomJobs({ provider: p503, post, now: new Date(Date.now() + i * (LEASE + 1000)), limit: 1, jobIds: [b.jobId] });
    const j3 = await prisma.aiRoomJob.findUnique({ where: { id: b.jobId } });
    chk("T-1", "503 ครั้งแรก ⇒ กลับ QUEUED (attempts 1 · ไม่ FAILED)", j1?.status === "QUEUED" && j1?.attempts === 1 && r1.requeued === 1, JSON.stringify({ s: j1?.status, a: j1?.attempts, r1 }));
    chk("T-2", "503 · 503 · ตอบว่าง ⇒ ครบ 3 ครั้งแล้ว FAILED ERR_GAVE_UP (provider 3 ครั้ง)", j3?.status === "FAILED" && j3?.attempts === 3 && p503.calls === 3 && /หลังลอง 3 ครั้ง/.test(String(j3?.error)), JSON.stringify({ s: j3?.status, a: j3?.attempts, calls: p503.calls, e: j3?.error }));
    const ev = await prisma.opsEvent.count({ where: { tenantId: tid, source: worker.OPS_SOURCE_PROVIDER_ACCOUNT } });
    const gt = await call("rooms/[id]", "GET", undefined, H, { id: b.roomId });
    chk("T-4", "ห้องที่ลองครบ ⇒ failed.reason gave_up", (gt.body.failed as AnyMod | null)?.reason === "gave_up", JSON.stringify(gt.body.failed), "MAJOR");
    chk("T-3", "transient ไม่เขียน ERROR ai.provider-account (ยังเป็น 1 แถวจากข้อ A)", ev === 1, String(ev), "MAJOR");
  }

  console.log("── D: room DTO ──");
  {
    const g = await call("rooms/[id]", "GET", undefined, H, { id: a.roomId });
    const f = g.body.failed as AnyMod | null;
    chk("D-1", "GET rooms/[id] ห้องที่ล้ม ⇒ failed {jobId, messageId, error ไทย, reason ai_unavailable, at, canRetry:true} · status คงค่าเดิม (OPEN — แอปรุ่นเก่าไม่พัง)", g.status === 200 && !!f && f.jobId === a.jobId && f.messageId === a.messageId && f.error === worker.ERR_AI_UNAVAILABLE && f.reason === "ai_unavailable" && f.canRetry === true && !!f.at && g.body.status === "OPEN", JSON.stringify({ s: g.status, f, st: g.body.status }).slice(0, 300));
    const l = await call("rooms", "GET", undefined, H);
    const card = ((l.body.items ?? []) as AnyMod[]).find((x) => x.id === a.roomId);
    chk("D-2", "GET rooms: การ์ดห้องที่ล้ม failed:true · status OPEN", card?.failed === true && card?.status === "OPEN", JSON.stringify(card ?? null).slice(0, 200));
    // คำตอบเลขาหลังข้อความที่ล้ม ⇒ ไม่ใช่สถานะล้ม
    const c = await newRoom("ห้องที่มีคำตอบตามมา");
    await worker.runRoomJobs({ provider: new Scripted([new provider.AiProviderHttpError(402, "x")]), post, now: new Date(), limit: 1, jobIds: [c.jobId] });
    const before = (await call("rooms/[id]", "GET", undefined, H, { id: c.roomId })).body.failed;
    await prisma.aiMessage.create({ data: { tenantId: tid, conversationId: c.conversationId, role: "ASSISTANT", content: "ตอบแล้ว", createdAt: new Date(Date.now() + 1000) } });
    const g2 = await call("rooms/[id]", "GET", undefined, H, { id: c.roomId });
    const l2 = await call("rooms", "GET", undefined, H);
    const card2 = ((l2.body.items ?? []) as AnyMod[]).find((x) => x.id === c.roomId);
    chk("D-3", "FAILED แต่มีคำตอบเลขาหลังข้อความนั้น ⇒ failed:null (ห้อง) · failed:false (การ์ด)", !!before && g2.body.failed === null && card2?.failed === false, JSON.stringify({ before: !!before, after: g2.body.failed, card: card2?.failed }));
    // งานล่าสุดไม่ล้ม (ส่งข้อความใหม่ = job QUEUED) ⇒ ไม่ใช่สถานะล้ม
    const d = await newRoom("ห้องสั่งต่อ");
    await worker.runRoomJobs({ provider: new Scripted([new provider.AiProviderHttpError(402, "x")]), post, now: new Date(), limit: 1, jobIds: [d.jobId] });
    const s = await worker.sendRoomMessage(OWNER, d.roomId, { text: "สั่งงานใหม่" });
    const g3 = await call("rooms/[id]", "GET", undefined, H, { id: d.roomId });
    chk("D-4", "งานล่าสุดเป็นงานใหม่ (QUEUED) ⇒ failed:null · status RUNNING", s.ok === true && g3.body.failed === null && g3.body.status === "RUNNING", JSON.stringify({ ok: s.ok, f: g3.body.failed, st: g3.body.status }));
  }

  console.log("── R: POST rooms/[id]/retry ──");
  {
    const msgs0 = await userMsgs(a.conversationId);
    const ro = await call("rooms/[id]/retry", "POST", {}, HO, { id: a.roomId });
    chk("R-1", "คนนอกร้าน ⇒ 404 (ไม่บอกว่ามีห้อง)", ro.status === 404 || ro.status === 403, String(ro.status));
    const rs0 = await call("rooms/[id]/retry", "POST", {}, HS, { id: a.roomId });
    await prisma.aiRoomMember.create({ data: { tenantId: tid, roomId: a.roomId, userId: U.staff, addedById: U.owner, seeHistory: true } });
    const rs = await call("rooms/[id]/retry", "POST", {}, HS, { id: a.roomId });
    const gs = await call("rooms/[id]", "GET", undefined, HS, { id: a.roomId });
    chk("R-2", "พนักงานที่มองไม่เห็นห้อง 404 · สมาชิกห้องที่ไม่ใช่ผู้เปิด 403 + ไทย · GET ของเขา canRetry:false", rs0.status === 404 && rs.status === 403 && /[฀-๿]/.test(String(rs.body.message)) && (gs.body.failed as AnyMod | null)?.canRetry === false, JSON.stringify({ rs0: rs0.status, rs: rs.status, m: rs.body.message, f: gs.body.failed }));
    const rj = await call("rooms/[id]/retry", "POST", { jobId: "not-this-job" }, H, { id: a.roomId });
    chk("R-3", "jobId ไม่ใช่งานที่ล้มล่าสุด ⇒ 409 not_failed", rj.status === 409 && rj.body.error === "not_failed", JSON.stringify(rj));
    const jBefore = await prisma.aiRoomJob.findUnique({ where: { id: a.jobId } });
    const ok = await call("rooms/[id]/retry", "POST", { jobId: a.jobId }, H, { id: a.roomId }); // worker รันต่อทันที (นอกคำขอ = รอจนจบ · MockProvider)
    const jAfter = await prisma.aiRoomJob.findUnique({ where: { id: a.jobId } });
    const msgs1 = await userMsgs(a.conversationId);
    const jobs = await prisma.aiRoomJob.count({ where: { tenantId: tid, roomId: a.roomId } });
    const asst = await prisma.aiMessage.count({ where: { tenantId: tid, conversationId: a.conversationId, role: "ASSISTANT" } });
    chk("R-4", "ผู้เปิดห้อง ⇒ 200 jobId เดิม · ไม่มีข้อความ USER ซ้ำ · ไม่มี job ใหม่ · รุ่นถัดไป (attempts ≥ 100)", ok.status === 200 && ok.body.jobId === a.jobId && msgs1 === msgs0 && jobs === 1 && (jAfter?.attempts ?? 0) >= 100 && (jBefore?.attempts ?? 99) < 100, JSON.stringify({ s: ok.status, b: ok.body, msgs0, msgs1, jobs, att: [jBefore?.attempts, jAfter?.attempts] }));
    const g = await call("rooms/[id]", "GET", undefined, H, { id: a.roomId });
    const l = await call("rooms", "GET", undefined, H);
    const card = ((l.body.items ?? []) as AnyMod[]).find((x) => x.id === a.roomId);
    chk("R-5", "ลองใหม่สำเร็จ ⇒ job DONE · มีคำตอบเลขา · failed:null · การ์ด failed:false", jAfter?.status === "DONE" && asst >= 1 && g.body.failed === null && card?.failed === false, JSON.stringify({ st: jAfter?.status, asst, f: g.body.failed, card: card?.failed }));
    const again = await call("rooms/[id]/retry", "POST", {}, H, { id: a.roomId });
    chk("R-6", "กดซ้ำหลังสำเร็จ ⇒ 409 not_failed (ไม่กลับคิวซ้ำ)", again.status === 409 && again.body.error === "not_failed", JSON.stringify(again));
    // ห้องปิด
    const e = await newRoom("ห้องที่จะปิด");
    await worker.runRoomJobs({ provider: new Scripted([new provider.AiProviderHttpError(402, "x")]), post, now: new Date(), limit: 1, jobIds: [e.jobId] });
    await rooms.closeRoom(OWNER, e.roomId);
    const rc = await call("rooms/[id]/retry", "POST", {}, H, { id: e.roomId });
    const gc = await call("rooms/[id]", "GET", undefined, H, { id: e.roomId });
    const je = await prisma.aiRoomJob.findUnique({ where: { id: e.jobId } });
    chk("R-7", "ห้องปิดแล้ว ⇒ 409 closed · job คง FAILED · GET failed:null", rc.status === 409 && rc.body.error === "closed" && je?.status === "FAILED" && gc.body.failed === null, JSON.stringify({ rc, st: je?.status, f: gc.body.failed }));
    const sr = readFileSync(join(ROOT, "src/app/api/mobile/secretary/rooms/[id]/retry/route.ts"), "utf8");
    chk("R-8", "route retry ใช้ถังเพดานเดียวกับส่งข้อความ (\"send\" 10/นาที) · รัน worker เฉพาะ job นี้ใน after()", /withRateLimit\([^)]*"send",\s*10\)/.test(sr) && /runRoomJobs\(\{\s*jobIds:\s*\[r\.jobId\]/.test(sr), "");
    chk("R-9", "push ล้มถูกส่งตามปกติระหว่างข้อสอบ (ผ่าน post ที่ฉีด · ไม่มีปลายทาง = 0 ใบก็ได้) — ไม่มีข้อความที่มีรหัส HTTP", pushes.every((p) => !/402|credit/i.test(p)), JSON.stringify(pushes.slice(0, 3)), "MAJOR");
  }
} catch (e) {
  const detail = (e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : JSON.stringify(e)).slice(0, 400);
  console.log(`  💥 ${detail}`); chk("CRASH", "ข้อสอบรันจบ", false, detail.slice(0, 200));
} finally { await cleanup(); }

const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน · ${skipped.length} ข้าม`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
await prisma.$disconnect().catch(() => {});
process.exit(failed.length ? 1 : 0);
