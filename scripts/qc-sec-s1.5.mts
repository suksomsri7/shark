// QC — SECRETARY S1.5 · คิวเบื้องหลัง worker.ts (enqueue · sendRoomMessage · runRoomJobs lease/X5/retry · push · minute job) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.5.md · RESOLUTIONS R-K2 R-K8b R-K20 · ต้องการ S1.1 ตาราง + S1.4 rooms.ts
//
// กลุ่มข้อ:
//   W  enqueue idempotent · sendRoomMessage (visibility/closed/empty · USER+job ใน tx · ไม่เรียกโมเดล · ไม่นับงาน)
//   R  runRoomJobs: DONE + ASSISTANT 1 แถว · USER ไม่ซ้ำ · prompt ไม่มีข้อความซ้ำ · lease (future ข้าม · past claim) · X5 ขนาน 2 รอบ = เรียกโมเดลพอดี · throw ⇒ requeue แล้ว FAILED ที่ครั้งที่ 3 · ผู้สั่งพ้นสมาชิก ⇒ FAILED ไม่เรียกโมเดล · !ok ⇒ FAILED ไม่ retry
//   P  push ถึงผู้เปิดห้อง ∪ สมาชิก · data.link · ไม่กรอง tenant · push ล้มไม่ทำให้ job ล้ม
//   M  minute job "secretary.roomJobs" ลงทะเบียน everyMinutes 1 · crm-cron.mts import · sendMessage ไม่ส่ง userMessageId = เดิม (สร้าง USER)
//   D  fitness ×2
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.5.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.5";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const WORKER_FILE = join(ROOT, "src/lib/ai/secretary/worker.ts");
if (!FORCED && !existsSync(WORKER_FILE)) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/lib/ai/secretary/worker.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
process.env.SHARK_AI_MOCK = "1";
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import type { AiChatMessage, AiProvider, AiReply, AiToolDef } from "@/lib/ai/provider";
class Scripted implements AiProvider {
  captured: { messages: AiChatMessage[]; tools?: AiToolDef[] }[] = []; calls = 0;
  constructor(private reply: string | (() => Partial<AiReply>) = "รับทราบครับ", private delayMs = 0) {}
  async chat(messages: AiChatMessage[], opts?: { tools?: AiToolDef[] }): Promise<AiReply> {
    this.calls++; this.captured.push({ messages, tools: opts?.tools });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const r = typeof this.reply === "function" ? this.reply() : { text: this.reply };
    return { text: r.text ?? "รับทราบครับ", toolCalls: r.toolCalls, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}
const { prisma } = await import("@/lib/core/db");
const service = await import("@/lib/ai/service");
const rooms = (await import("@/lib/ai/secretary/rooms").catch(() => null)) as AnyMod | null;
const worker = existsSync(WORKER_FILE) ? ((await import("@/lib/ai/secretary/worker").catch((e) => { console.log("  ⚠️ import worker.ts: " + errMsg(e)); return null; })) as AnyMod | null) : null;
const mj = (await import("@/lib/platform/minute-jobs")) as AnyMod;
const hasTables = "aiRoom" in prisma && "aiRoomJob" in prisma;

const U = { owner: "qcs15-owner", staff: "qcs15-staff", staff2: "qcs15-staff2", mgr: "qcs15-mgr" };
let tid = "";
const cleanup = async () => {
  if (tid) {
    for (const m of ["aiRoomJob", "aiRoomMember", "aiRoom", "aiProposal", "aiMessage", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "appSystem", "membership"]) { try { await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s15-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.pushDevice.deleteMany({ where: { userId: { startsWith: "qcs15-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs15-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.5", slug: `qc-sec-s15-${Date.now().toString(36)}` } });
  tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `ผู้ใช้ ${k}` } });
  const perms = { "ai.chat.send": true, "kanban.card.read": true };
  const mk = (role: "OWNER" | "MANAGER" | "STAFF", userId: string) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess: ["*"], permissions: role === "STAFF" ? perms : {} as never, acceptedAt: new Date() } });
  await mk("OWNER", U.owner); await mk("MANAGER", U.mgr); await mk("STAFF", U.staff); await mk("STAFF", U.staff2);
  const actor = (userId: string, role: "OWNER" | "MANAGER" | "STAFF") => ({ kind: "member" as const, tenantId: tid, userId, membership: { role, unitAccess: ["*"], permissions: role === "STAFF" ? perms : {} } });
  const OWNER = actor(U.owner, "OWNER"), STAFF = actor(U.staff, "STAFF"), STAFF2 = actor(U.staff2, "STAFF"), MGR = actor(U.mgr, "MANAGER");
  const ctxOf = (a: ReturnType<typeof actor>) => ({ tenantId: tid, actor: a });
  // push devices (ปลอม) ให้ owner/staff/staff2 — sendPushToUser ต้องเจอเครื่อง
  for (const uid of [U.owner, U.staff, U.staff2]) await prisma.pushDevice.create({ data: { userId: uid, tenantId: tid, token: `ExponentPushToken[qcs15-${uid}]`, platform: "ios" } as never }).catch((e) => console.log("  ⚠️ pushDevice: " + errMsg(e)));

  if (!worker || !rooms || !hasTables) {
    for (const id of ["W-1", "W-2", "W-3", "R-1", "R-2", "R-3", "R-4", "R-5", "R-6", "P-1", "P-2", "M-1", "M-2", "M-3"]) skip(id, "worker", !worker ? "ไม่มี worker.ts" : !rooms ? "ไม่มี rooms.ts (S1.4)" : "ไม่มีตาราง S1.1");
  } else {
    console.log("── W: enqueue · sendRoomMessage ──");
    const r1 = await rooms.startRoom(ctxOf(STAFF), { instruction: "สรุปยอดขายเมื่อวาน" });
    const roomId = r1.roomId as string, convId = r1.conversationId as string;
    const firstMsg = await prisma.aiMessage.findFirst({ where: { conversationId: convId, role: "USER" } });
    const j1 = await worker.enqueueRoomJob(tid, roomId, firstMsg!.id, U.staff);
    const j1b = await worker.enqueueRoomJob(tid, roomId, firstMsg!.id, U.staff);
    chk("W-1", "enqueueRoomJob: สร้าง QUEUED (tenantId · authorUserId) · เรียกซ้ำ messageId เดิม = แถวเดิม", j1?.status === "QUEUED" && j1?.tenantId === tid && j1?.authorUserId === U.staff && j1b?.id === j1?.id && (await prisma.aiRoomJob.count({ where: { roomId } })) === 1, JSON.stringify(j1).slice(0, 160));
    await prisma.aiRoomMember.create({ data: { tenantId: tid, roomId, userId: U.staff2, addedById: U.staff } });
    const s1 = await worker.sendRoomMessage(ctxOf(STAFF2), roomId, { text: "เพิ่ม: ของใกล้หมดด้วย" });
    const sM = await worker.sendRoomMessage(ctxOf(MGR), roomId, { text: "แอบส่ง" });
    const sE = await worker.sendRoomMessage(ctxOf(STAFF), roomId, { text: "  " });
    const msgS1 = s1.ok ? await prisma.aiMessage.findUnique({ where: { id: s1.messageId } }) : null;
    chk("W-2", "sendRoomMessage: สมาชิก staff2 ⇒ USER msg(authorUserId=staff2)+job QUEUED · MANAGER ⇒ not_found · ว่าง ⇒ empty · ไม่เรียกโมเดล (ไม่มี ASSISTANT) · ไม่นับงาน", s1.ok === true && msgS1?.role === "USER" && (msgS1 as AnyMod)?.authorUserId === U.staff2 && (await prisma.aiRoomJob.findUnique({ where: { messageId: s1.messageId } }))?.status === "QUEUED" && sM.ok === false && sM.error === "not_found" && sE.ok === false && sE.error === "empty" && (await prisma.aiMessage.count({ where: { conversationId: convId, role: "ASSISTANT" } })) === 0 && ((await prisma.aiJobCounter.findFirst({ where: { tenantId: tid } }))?.jobs ?? 0) === 1, JSON.stringify({ s1, sM, sE }).slice(0, 200));
    await prisma.aiRoom.update({ where: { id: roomId }, data: { closedAt: new Date() } });
    const sC = await worker.sendRoomMessage(ctxOf(STAFF), roomId, { text: "ห้องปิดแล้ว" });
    await prisma.aiRoom.update({ where: { id: roomId }, data: { closedAt: null } });
    chk("W-3", "ห้องที่ปิดแล้ว ⇒ error closed (ข้อความไทย)", sC.ok === false && sC.error === "closed" && /[฀-๿]/.test(sC.message ?? ""), JSON.stringify(sC).slice(0, 120));

    console.log("── R: runRoomJobs ──");
    const posts: { to: string; title: string; body: string; data: Record<string, unknown> }[] = [];
    const post = async (msgs: AnyMod[]) => { for (const m of msgs) posts.push({ to: String(m.to), title: String(m.title), body: String(m.body), data: (m.data ?? {}) as Record<string, unknown> }); return { ok: true, tickets: msgs.map(() => ({ status: "ok" })) }; };
    const p1 = new Scripted("ยอดขายเมื่อวาน 1,200 บาท ของใกล้หมด 3 รายการ");
    const run1 = await worker.runRoomJobs({ provider: p1, post, now: new Date() });
    const jobsAfter = await prisma.aiRoomJob.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } });
    const msgsAfter = await prisma.aiMessage.findMany({ where: { conversationId: convId }, orderBy: { createdAt: "asc" } });
    chk("R-1", "runRoomJobs: 2 job DONE · ASSISTANT 2 แถว · USER ยัง 2 แถว (ไม่ซ้ำ) · finishedAt/error null · claimed=2 done=2", run1.claimed === 2 && run1.done === 2 && jobsAfter.every((j) => j.status === "DONE" && j.finishedAt && !j.error) && msgsAfter.filter((m) => m.role === "USER").length === 2 && msgsAfter.filter((m) => m.role === "ASSISTANT").length === 2, `${JSON.stringify(run1)} jobs=${jobsAfter.map((j) => j.status).join(",")} msgs=${msgsAfter.map((m) => m.role[0]).join("")}`);
    const firstPrompt = p1.captured[0]?.messages ?? [];
    const userTurns = firstPrompt.filter((m) => m.role === "user").map((m) => m.content);
    chk("R-2", "prompt ของ job แรก: เทิร์น user สุดท้าย = คำสั่ง · คำสั่งนั้นไม่ปรากฏซ้ำสองครั้ง · provider ถูกเรียก 2 ครั้ง", userTurns[userTurns.length - 1] === "สรุปยอดขายเมื่อวาน" && userTurns.filter((c) => c === "สรุปยอดขายเมื่อวาน").length === 1 && p1.calls === 2, `userTurns=${JSON.stringify(userTurns).slice(0, 160)} calls=${p1.calls}`);
    // lease
    const s2 = await worker.sendRoomMessage(ctxOf(STAFF), roomId, { text: "งานที่ 3" });
    await prisma.aiRoomJob.update({ where: { messageId: s2.messageId }, data: { status: "RUNNING", leaseUntil: new Date(Date.now() + 60_000), attempts: 1 } });
    const p2 = new Scripted("ตอบ 3");
    const runL1 = await worker.runRoomJobs({ provider: p2, post, now: new Date() });
    const stillRunning = (await prisma.aiRoomJob.findUnique({ where: { messageId: s2.messageId } }))?.status === "RUNNING";
    await prisma.aiRoomJob.update({ where: { messageId: s2.messageId }, data: { leaseUntil: new Date(Date.now() - 1_000) } });
    const runL2 = await worker.runRoomJobs({ provider: p2, post, now: new Date() });
    const jL = await prisma.aiRoomJob.findUnique({ where: { messageId: s2.messageId } });
    chk("R-3", "lease: RUNNING+leaseUntil อนาคต ⇒ ไม่แตะ (claimed 0) · leaseUntil หมด ⇒ claim ใหม่ attempts 2 ⇒ DONE", runL1.claimed === 0 && stillRunning && p2.calls === 1 && runL2.claimed === 1 && jL?.status === "DONE" && jL?.attempts === 2, `${JSON.stringify(runL1)} ${JSON.stringify(runL2)} attempts=${jL?.attempts} status=${jL?.status}`);
    // X5: 5 jobs · 2 รอบขนาน
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) { const s = await worker.sendRoomMessage(ctxOf(STAFF), roomId, { text: `ขนาน ${i}` }); ids.push(s.messageId); }
    const pX = new Scripted("ok", 150);
    const [ra, rb] = await Promise.all([worker.runRoomJobs({ provider: pX, post, now: new Date(), limit: 10 }), worker.runRoomJobs({ provider: pX, post, now: new Date(), limit: 10 })]);
    const jX = await prisma.aiRoomJob.findMany({ where: { messageId: { in: ids } } });
    chk("R-4", "X5: 5 job · runRoomJobs 2 รอบพร้อมกัน ⇒ โมเดลถูกเรียก 5 ครั้งพอดี · claimed รวม 5 · ทุก job DONE attempts 1 · ASSISTANT เพิ่ม 5", pX.calls === 5 && ra.claimed + rb.claimed === 5 && jX.every((j) => j.status === "DONE" && j.attempts === 1) && (await prisma.aiMessage.count({ where: { conversationId: convId, role: "ASSISTANT" } })) === 3 + 5, `calls=${pX.calls} a=${JSON.stringify(ra)} b=${JSON.stringify(rb)} st=${jX.map((j) => `${j.status}/${j.attempts}`).join(",")}`);
    // throw ⇒ requeue ×2 แล้ว FAILED
    const sT = await worker.sendRoomMessage(ctxOf(STAFF), roomId, { text: "งานพัง" });
    const pT = new Scripted(() => { throw new Error("provider down"); });
    const t1 = await worker.runRoomJobs({ provider: pT, post, now: new Date() });
    const jT1 = await prisma.aiRoomJob.findUnique({ where: { messageId: sT.messageId } });
    await worker.runRoomJobs({ provider: pT, post, now: new Date() });
    const t3 = await worker.runRoomJobs({ provider: pT, post, now: new Date() });
    const jT3 = await prisma.aiRoomJob.findUnique({ where: { messageId: sT.messageId } });
    const t4 = await worker.runRoomJobs({ provider: pT, post, now: new Date() });
    chk("R-5", "throw: ครั้ง 1 ⇒ กลับ QUEUED attempts 1 error มีข้อความ · ครั้ง 3 ⇒ FAILED · ครั้ง 4 ไม่ claim อีก · ไม่มี ASSISTANT ของงานนี้ · runRoomJobs ไม่ throw", t1.requeued === 1 && jT1?.status === "QUEUED" && jT1?.attempts === 1 && !!jT1?.error && t3.failed === 1 && jT3?.status === "FAILED" && jT3?.attempts === 3 && t4.claimed === 0 && (await prisma.aiMessage.count({ where: { conversationId: convId, role: "ASSISTANT" } })) === 8, `t1=${JSON.stringify(t1)} j1=${jT1?.status}/${jT1?.attempts} t3=${JSON.stringify(t3)} j3=${jT3?.status}/${jT3?.attempts} t4=${JSON.stringify(t4)}`);
    // ผู้สั่งพ้นสมาชิก
    const sR = await worker.sendRoomMessage(ctxOf(STAFF2), roomId, { text: "งานของคนที่ถูกถอน" });
    await prisma.membership.updateMany({ where: { tenantId: tid, userId: U.staff2 }, data: { acceptedAt: null } });
    const pR = new Scripted("ไม่ควรถูกเรียก");
    const rr = await worker.runRoomJobs({ provider: pR, post, now: new Date() });
    const jR = await prisma.aiRoomJob.findUnique({ where: { messageId: sR.messageId } });
    await prisma.membership.updateMany({ where: { tenantId: tid, userId: U.staff2 }, data: { acceptedAt: new Date() } });
    chk("R-6", "ผู้สั่งถูกถอนสิทธิ์ (acceptedAt null) ⇒ FAILED ข้อความไทย · ไม่เรียกโมเดล · ไม่ retry", rr.failed === 1 && jR?.status === "FAILED" && /[฀-๿]/.test(jR?.error ?? "") && pR.calls === 0 && (await worker.runRoomJobs({ provider: pR, post, now: new Date() })).claimed === 0, `${JSON.stringify(rr)} ${jR?.status} ${jR?.error}`);

    console.log("── P: push ──");
    const firstDonePush = posts.filter((p) => p.data?.roomId === roomId && p.data?.kind === "room");
    const recipients = new Set(firstDonePush.map((p) => p.to));
    chk("P-1", "push หลัง DONE: ถึงผู้เปิดห้อง (staff) และสมาชิก (staff2) · data.link=/secretary/room/<id> · data.conversationId · ไม่ถึง owner/manager (ไม่ใช่สมาชิกห้อง)", firstDonePush.length > 0 && [...recipients].some((t) => t.includes(U.staff + "]")) && [...recipients].some((t) => t.includes(U.staff2 + "]")) && ![...recipients].some((t) => t.includes(U.owner + "]") || t.includes(U.mgr + "]")) && firstDonePush.every((p) => p.data.link === `/secretary/room/${roomId}` && p.data.conversationId === convId && p.title.length > 0 && p.body.length > 0 && p.body.length <= 160), `n=${firstDonePush.length} to=${[...recipients].join(",").slice(0, 120)} link=${firstDonePush[0]?.data?.link}`);
    const sP = await worker.sendRoomMessage(ctxOf(STAFF), roomId, { text: "push พัง" });
    const pP = new Scripted("ตอบได้");
    const rp = await worker.runRoomJobs({ provider: pP, post: async () => { throw new Error("expo down"); }, now: new Date() });
    chk("P-2", "push ล้ม ⇒ job ยัง DONE (ไม่ throw · ไม่ retry)", rp.done === 1 && (await prisma.aiRoomJob.findUnique({ where: { messageId: sP.messageId } }))?.status === "DONE", JSON.stringify(rp));

    console.log("── M: minute job + sendMessage เดิม ──");
    await import("@/lib/ai/secretary/room-jobs-job").catch((e) => console.log("  ⚠️ import room-jobs-job: " + errMsg(e)));
    const st = await mj.getMinuteJobStatus(["secretary.roomJobs"]);
    chk("M-1", "minute job 'secretary.roomJobs' ลงทะเบียน everyMinutes 1 (import room-jobs-job.ts)", Array.isArray(st) && st.length === 1 && st[0].everyMinutes === 1, JSON.stringify(st).slice(0, 160));
    const cron = rd(join(ROOT, "scripts/crm-cron.mts"));
    chk("M-2", "scripts/crm-cron.mts import room-jobs-job (ราง VPS) · worker.ts ไม่ถูก import จาก rooms.ts (ไม่วงกลม)", /room-jobs-job/.test(cron) && !/worker"/.test(rd(join(ROOT, "src/lib/ai/secretary/rooms.ts"))), "ตรวจไฟล์");
    const pm = new Scripted("โอเค");
    const before = await prisma.aiMessage.count({ where: { conversationId: convId, role: "USER" } });
    const res = await service.sendMessage(ctxOf(STAFF), { conversationId: convId, text: "ทางเดิม" }, { provider: pm });
    chk("M-3", "sendMessage ไม่ส่ง userMessageId ⇒ สร้าง USER เอง (เดิม)", res.ok === true && (await prisma.aiMessage.count({ where: { conversationId: convId, role: "USER" } })) === before + 1, JSON.stringify(res).slice(0, 100));
  }
} finally {
  await cleanup();
}
console.log("── D: fitness ──");
{
  const f1 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-1", "pnpm fitness (มี env) exit 0", f1.status === 0, (f1.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  const env2 = { ...process.env }; delete env2.DATABASE_URL; delete env2.DIRECT_URL;
  const f2 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: env2, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-2", "pnpm fitness (ไม่มี env) exit 0", f2.status === 0, (f2.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
}
await prisma.$disconnect();
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
