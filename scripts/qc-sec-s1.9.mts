// QC — SECRETARY S1.9 · งานประจำรันเป็นผู้ตั้ง (createTask ใหม่ · isDue · claim ก่อนรัน · ห้องใหม่ต่อรอบ · แถวเดิมคงเดิม) · oracle ของผู้คุม
// สัญญา: ledger/secretary-briefs/sec-brief-S1.9.md · RESOLUTIONS R-K5 R-K8b · ต้องการ S1.4 rooms + S1.5 worker
//
// กลุ่มข้อ: T createTask/isDue · R runScheduledTasks (ห้องใหม่ · X5 · owner ถูกถอน · โควตาเต็ม · แถวเดิม) · P dispatch ai_schedule_task · D fitness
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.9.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.9";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const started = /export function isDue/.test(existsSync(join(ROOT, "src/lib/ai/scheduled.ts")) ? readFileSync(join(ROOT, "src/lib/ai/scheduled.ts"), "utf8") : "");
if (!FORCED && !started) { console.log(`⏭️  ${LABEL}: scheduled.ts ยังไม่มี isDue (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`); console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" })); process.exit(0); }
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
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
async function throws(fn: () => Promise<unknown> | unknown): Promise<string | null> { try { await fn(); return null; } catch (e) { return errMsg(e); } }
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import type { AiChatMessage, AiProvider, AiReply, AiToolDef } from "@/lib/ai/provider";
class Scripted implements AiProvider { calls = 0; constructor(private text = "สรุปแล้วครับ", private delayMs = 0) {} async chat(_m: AiChatMessage[], _o?: { tools?: AiToolDef[] }): Promise<AiReply> { this.calls++; if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs)); return { text: this.text, tokensIn: 1, tokensOut: 1, model: "scripted" }; } }

const { prisma } = await import("@/lib/core/db");
const sched = (await import("@/lib/ai/scheduled")) as AnyMod;
const proposals = await import("@/lib/ai/proposals");
const pack = (await import("@/lib/ai/secretary/pack")) as AnyMod;
const { dayKeyBangkok } = await import("@/lib/ai/rules");
const U = { owner: "qcs19x-owner", staff: "qcs19x-staff", gone: "qcs19x-gone" };
let tid = "";
const cleanup = async () => {
  if (tid) { for (const m of ["aiScheduledTask", "appNotification", "aiRoomJob", "aiRoomMember", "aiRoom", "aiProposal", "aiMessage", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "appSystem", "membership"]) { try { await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* */ } } try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); } }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s19x-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.pushDevice.deleteMany({ where: { expoToken: { startsWith: "ExponentPushToken[qcs19x-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs19x-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.9", slug: `qc-sec-s19x-${Date.now().toString(36)}` } });
  tid = t.id;
  for (const id of Object.values(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: id } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {} as never, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staff, role: "STAFF", unitAccess: ["*"], permissions: { "ai.chat.send": true } as never, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.gone, role: "STAFF", unitAccess: ["*"], permissions: {} as never, acceptedAt: null } });
  await prisma.pushDevice.create({ data: { userId: U.owner, tenantId: tid, expoToken: `ExponentPushToken[qcs19x-${U.owner}]`, platform: "ios" } });
  const ctx = { tenantId: tid };
  const NOW = new Date("2026-11-10T11:00:00Z"); // 18:00 BKK · อังคาร 10 พ.ย.
  const hourBkk = 18;
  if (!started || typeof sched.isDue !== "function") { for (const id of ["T-1", "T-2", "R-1", "R-2", "R-3", "R-4", "R-5", "P-1"]) skip(id, "scheduled", "ยังไม่มี isDue/ทางใหม่"); }
  else {
    console.log("── T: createTask · isDue ──");
    const eW = await throws(() => sched.createTask(ctx, { instruction: "x", hourBkk, ownerUserId: U.owner, frequency: "WEEKLY", days: [] }));
    const eW2 = await throws(() => sched.createTask(ctx, { instruction: "x", hourBkk, ownerUserId: U.owner, frequency: "WEEKLY", days: [7] }));
    const eM = await throws(() => sched.createTask(ctx, { instruction: "x", hourBkk, ownerUserId: U.owner, frequency: "MONTHLY", days: [0] }));
    const eC = await throws(() => sched.createTask(ctx, { instruction: "x", hourBkk, ownerUserId: U.owner, channels: ["sms"] }));
    const eO = await throws(() => sched.createTask(ctx, { instruction: "x", hourBkk, ownerUserId: U.gone }));
    const eF = await throws(() => sched.createTask(ctx, { instruction: "x", hourBkk, ownerUserId: U.owner, frequency: "HOURLY" }));
    chk("T-1", "createTask ใหม่: WEEKLY days ว่าง/7 · MONTHLY 0 · channels แปลก · owner ไม่ได้เป็นสมาชิก · frequency แปลก ⇒ throw ไทย · ไม่มีแถว", [eW, eW2, eM, eC, eO, eF].every((e) => thai(e)) && (await prisma.aiScheduledTask.count({ where: { tenantId: tid } })) === 0, JSON.stringify({ eW, eW2, eM, eC, eO, eF }).slice(0, 240));
    const okD = await sched.createTask(ctx, { instruction: "สรุปยอดขาย", hourBkk, ownerUserId: U.owner });
    const rowD = await prisma.aiScheduledTask.findUnique({ where: { id: okD.id } });
    const legacy = await sched.createTask(ctx, { instruction: "งานเดิม", hourBkk });
    const rowL = await prisma.aiScheduledTask.findUnique({ where: { id: legacy.id } });
    const okW = await sched.createTask(ctx, { instruction: "ทุกจันทร์", hourBkk, ownerUserId: U.owner, frequency: "WEEKLY", days: [1], channels: ["room"] });
    const rowW = await prisma.aiScheduledTask.findUnique({ where: { id: okW.id } });
    const d = (task: AnyMod, at: string) => sched.isDue(task, new Date(at));
    chk("T-2", "DAILY ปริยาย frequency DAILY days [] channels [push,room] · แถวเดิม ownerUserId null frequency null · isDue: DAILY ชั่วโมงตรง ✓ ชั่วโมงอื่น ✗ lastRunDay วันนี้ ✗ · WEEKLY [1] จันทร์ ✓ อังคาร ✗ · MONTHLY [1] 1 ธ.ค. 00:xx BKK ✓", rowD?.frequency === "DAILY" && JSON.stringify(rowD?.days) === "[]" && JSON.stringify(rowD?.channels) === '["push","room"]' && rowD?.ownerUserId === U.owner && rowL?.ownerUserId === null && rowL?.frequency === null && d(rowD!, "2026-11-10T11:00:00Z") === true && d(rowD!, "2026-11-10T10:00:00Z") === false && d({ ...rowD!, lastRunDay: dayKeyBangkok(new Date("2026-11-10T11:00:00Z")) }, "2026-11-10T11:00:00Z") === false && d(rowW!, "2026-11-09T11:00:00Z") === true && d(rowW!, "2026-11-10T11:00:00Z") === false && d({ ...rowD!, frequency: "MONTHLY", days: [1] }, "2026-11-30T17:30:00Z") === false && d({ ...rowD!, frequency: "MONTHLY", days: [1], hourBkk: 0 }, "2026-11-30T17:30:00Z") === true, JSON.stringify({ rowD: { f: rowD?.frequency, d: rowD?.days, c: rowD?.channels }, rowL: { o: rowL?.ownerUserId, f: rowL?.frequency } }).slice(0, 200));
    await prisma.aiScheduledTask.delete({ where: { id: okW.id } });

    console.log("── R: runScheduledTasks ──");
    const posts: AnyMod[] = [];
    const post = async (msgs: AnyMod[]) => { posts.push(...msgs); return { ok: true, tickets: msgs.map(() => ({ status: "ok" })) }; };
    const p1 = new Scripted("ยอดขายวันนี้ 5,000 บาท");
    const notiBefore = await prisma.appNotification.count({ where: { tenantId: tid } });
    const ran = await sched.runScheduledTasks(NOW, { provider: p1, post });
    const roomsD = await prisma.aiRoom.findMany({ where: { tenantId: tid, startedById: U.owner }, include: { conversation: { include: { messages: { orderBy: { createdAt: "asc" } } } } } });
    const taskD = await prisma.aiScheduledTask.findUnique({ where: { id: okD.id } });
    const taskL = await prisma.aiScheduledTask.findUnique({ where: { id: legacy.id } });
    const counter = await prisma.aiJobCounter.findFirst({ where: { tenantId: tid } });
    chk("R-1", "รัน 18:00 BKK: งานใหม่ ⇒ ห้องใหม่ startedById=owner · USER=instruction authorUserId=owner · ASSISTANT 1 · job DONE · นับงาน 1 · lastRunDay วันนี้ · push ถึง owner (link ห้อง) · แถวเดิมก็รัน (AppNotification +1) · provider เรียก 2 ครั้ง · ran=2", ran === 2 && roomsD.length === 1 && roomsD[0].conversation.id.startsWith(`u~${U.owner}~`) && roomsD[0].conversation.messages.filter((m) => m.role === "USER").length === 1 && roomsD[0].conversation.messages[0].content === "สรุปยอดขาย" && (roomsD[0].conversation.messages[0] as AnyMod).authorUserId === U.owner && roomsD[0].conversation.messages.filter((m) => m.role === "ASSISTANT").length === 1 && (await prisma.aiRoomJob.findFirst({ where: { roomId: roomsD[0].id } }))?.status === "DONE" && counter?.jobs === 1 && taskD?.lastRunDay === dayKeyBangkok(NOW) && posts.some((p) => String(p.to).includes(U.owner) && String(p.data?.link ?? "").includes(roomsD[0].id)) && (await prisma.appNotification.count({ where: { tenantId: tid } })) === notiBefore + 1 && taskL?.lastRunDay === dayKeyBangkok(NOW) && p1.calls === 2, JSON.stringify({ ran, rooms: roomsD.length, msgs: roomsD[0]?.conversation.messages.map((m) => m.role[0]).join(""), counter: counter?.jobs, lastRun: taskD?.lastRunDay, posts: posts.length, calls: p1.calls }).slice(0, 220));
    // X5: สองรอบพร้อมกันวันถัดไป
    const NOW2 = new Date("2026-11-11T11:00:00Z");
    const p2 = new Scripted("ok", 150);
    const [a, b] = await Promise.all([sched.runScheduledTasks(NOW2, { provider: p2, post }), sched.runScheduledTasks(NOW2, { provider: p2, post })]);
    const roomsAfter = await prisma.aiRoom.count({ where: { tenantId: tid, startedById: U.owner } });
    chk("R-2", "X5: สองรอบพร้อมกัน ⇒ งานใหม่สร้างห้องเพิ่ม 1 ห้องพอดี (claim ก่อนรัน) · รวม ran ของงานใหม่ = 1", roomsAfter === 2 && a + b <= 3 && (await prisma.aiJobCounter.findFirst({ where: { tenantId: tid } }))?.jobs === 2, `a=${a} b=${b} rooms=${roomsAfter}`);
    // owner ถูกถอน
    const okG = await sched.createTask(ctx, { instruction: "งานของคนที่ถูกถอน", hourBkk, ownerUserId: U.staff });
    await prisma.membership.updateMany({ where: { tenantId: tid, userId: U.staff }, data: { acceptedAt: null } });
    const NOW3 = new Date("2026-11-12T11:00:00Z");
    const p3 = new Scripted("ok");
    await sched.runScheduledTasks(NOW3, { provider: p3, post });
    const taskG = await prisma.aiScheduledTask.findUnique({ where: { id: okG.id } });
    await prisma.membership.updateMany({ where: { tenantId: tid, userId: U.staff }, data: { acceptedAt: new Date() } });
    chk("R-3", "owner ถูกถอนสิทธิ์ ⇒ ข้าม (ไม่มีห้องของ staff) · lastRunDay ตั้งแล้ว (claim) · ไม่ throw", (await prisma.aiRoom.count({ where: { tenantId: tid, startedById: U.staff } })) === 0 && taskG?.lastRunDay === dayKeyBangkok(NOW3), `lastRun=${taskG?.lastRunDay}`);
    // โควตาเต็ม
    const month = pack.monthKeyBangkok(new Date("2026-11-13T11:00:00Z"));
    await prisma.aiJobCounter.update({ where: { tenantId_month: { tenantId: tid, month } }, data: { jobs: pack.FREE_PACK.jobsPerMonth } });
    const NOW4 = new Date("2026-11-13T11:00:00Z");
    const p4 = new Scripted("ok");
    // ORACLE-EDIT s1.9-R-4: รอบ R-3 งาน DAILY ของ owner ก็ถึงเวลาและเปิดห้องที่ 3 โดยชอบ — เทียบกับจำนวนก่อนรัน ไม่ใช่ค่าคงที่
    const roomsBefore4 = await prisma.aiRoom.count({ where: { tenantId: tid, startedById: U.owner } });
    const ran4 = await sched.runScheduledTasks(NOW4, { provider: p4, post });
    const roomsQ = await prisma.aiRoom.count({ where: { tenantId: tid, startedById: U.owner } });
    chk("R-4", "โควตาเต็ม ⇒ งานใหม่ข้าม (ไม่มีห้องเพิ่ม) · ไม่ throw · แถวเดิมยังรัน (AppNotification)", roomsQ === roomsBefore4 && ran4 >= 1 && (await prisma.appNotification.count({ where: { tenantId: tid } })) >= notiBefore + 2, `ran4=${ran4} rooms=${roomsQ}`);
    await prisma.aiJobCounter.update({ where: { tenantId_month: { tenantId: tid, month } }, data: { jobs: 2 } });
    chk("R-5", "cap งานประจำต่อร้าน = FREE_PACK.scheduledMax (ข้อความไทยบอกเพดาน)", await (async () => { for (let i = 0; i < pack.FREE_PACK.scheduledMax; i++) { try { await sched.createTask(ctx, { instruction: `cap ${i}`, hourBkk: 1, ownerUserId: U.owner }); } catch { /* */ } } const e = await throws(() => sched.createTask(ctx, { instruction: "เกิน", hourBkk: 1, ownerUserId: U.owner })); return thai(e) && new RegExp(String(pack.FREE_PACK.scheduledMax)).test(e ?? ""); })(), "ดูข้อความ cap", "MAJOR");

    console.log("── P: dispatch ai_schedule_task ──");
    await prisma.aiScheduledTask.deleteMany({ where: { tenantId: tid, instruction: { startsWith: "cap " } } });
    const conv = await prisma.aiConversation.create({ data: { id: `u~${U.owner}~qcs19x-${Date.now().toString(36)}`, tenantId: tid, title: "qc" } });
    const prop = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: conv.id, kind: "ai_schedule_task", summary: "qc", payload: { instruction: "ทุกจันทร์สรุป", hourBkk: 9, frequency: "WEEKLY", days: [1] } as never, expiresAt: new Date(Date.now() + 3_600_000) } });
    const ex = await proposals.executeProposal({ role: "OWNER", unitAccess: ["*"], permissions: { "ai.schedule.create": true } } as never, ctx as never, prop.id, { userId: U.owner });
    const made = await prisma.aiScheduledTask.findFirst({ where: { tenantId: tid, instruction: "ทุกจันทร์สรุป" } });
    chk("P-1", "ยืนยันข้อเสนอ ai_schedule_task ⇒ งานมี ownerUserId=คนกด · WEEKLY days [1] · hourBkk 9 · note ไทยบอกความถี่", ex.ok === true && made?.ownerUserId === U.owner && made?.frequency === "WEEKLY" && JSON.stringify(made?.days) === "[1]" && made?.hourBkk === 9 && thai(ex.note), JSON.stringify({ ex, made: { o: made?.ownerUserId, f: made?.frequency, d: made?.days } }).slice(0, 200));
  }
} finally { await cleanup(); }
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
