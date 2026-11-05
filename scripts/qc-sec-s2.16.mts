// QC — SECRETARY S2.16 backoffice เคส (H3/H4) + S2.23 คิวเลขา (G5) — server actions ชั้น libกลับ 24 ชม. · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.7.md · RESOLUTIONS R-K3 R-K3b R-K4 R-S1.8a §B.3 §B.5 · ต้องการ S1.1 ตาราง + S1.4 rooms.ts
//
// กลุ่มข้อ:
//   Q  secretary-ops: listQueue (SUPPORT ok · FINANCE throw) · retryJob FAILED→QUEUED attempts 0 · cancelJob QUEUED→FAILED error 'cancelled' · costByTenant จาก AiCreditTxn USAGE
//   C  platform/support: listCasesForPlatform กรอง source/category/tab · assignCase · urgent เมื่อ billing
//   D  fitness ×2
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s2.16.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s2.16";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const ACT_FILE = join(ROOT, "src/lib/ai/secretary/actions.ts");
const KT_FILE = join(ROOT, "src/lib/ai/kind-tables.ts");
const OPS_FILE = join(ROOT, "src/lib/platform/secretary-ops.ts");
const STARTED = existsSync(OPS_FILE);
if (!FORCED && !STARTED) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/lib/platform/secretary-ops.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
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
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
async function throws(fn: () => Promise<unknown> | unknown): Promise<string | null> { try { await fn(); return null; } catch (e) { return errMsg(e); } }
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { prisma } = await import("@/lib/core/db");
const ops = (await import("@/lib/platform/secretary-ops").catch(() => null)) as AnyMod | null;
const sup = (await import("@/lib/platform/support").catch(() => null)) as AnyMod | null;

const U = { owner: "qcs216-owner" };
let tid = ""; const pus: string[] = [];
const cleanup = async () => {
  if (tid) { for (const m of ["aiCreditTxn", "aiRoomJob", "aiRoomMember", "aiRoom", "aiMessage", "aiConversation", "aiJobCounter", "aiUsage", "supportMessage", "supportCase", "membership"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: tid } }); } catch { /* */ } } try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); } }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s216-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.platformUser.deleteMany({ where: { email: { startsWith: "qcs216-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs216-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S2.16", slug: `qc-sec-s216-${Date.now().toString(36)}` } }); tid = t.id;
  await prisma.user.create({ data: { id: U.owner, email: `${U.owner}@example.com`, name: "เจ้าของ" } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const support = await prisma.platformUser.create({ data: { email: `qcs216-support-${Date.now().toString(36)}@example.com`, name: "ทีม QC", role: "SUPPORT" } as never });
  const finance = await prisma.platformUser.create({ data: { email: `qcs216-finance-${Date.now().toString(36)}@example.com`, name: "การเงิน QC", role: "FINANCE" } as never });
  const conv = await prisma.aiConversation.create({ data: { id: `u~${U.owner}~qcs216-${Date.now().toString(36)}`, tenantId: tid, title: "ห้อง qc" } });
  const room = await prisma.aiRoom.create({ data: { tenantId: tid, conversationId: conv.id, startedById: U.owner, title: "ห้อง qc" } as never });
  const mkJob = async (status: string, extra: Record<string, unknown> = {}) => { const m = await prisma.aiMessage.create({ data: { conversationId: conv.id, tenantId: tid, role: "USER", content: "x", authorUserId: U.owner } as never }); return prisma.aiRoomJob.create({ data: { tenantId: tid, roomId: room.id, messageId: m.id, status, ...extra } as never }); };
  const jQueuedOld = await mkJob("QUEUED", { createdAt: new Date(Date.now() - 10 * 60_000) });
  const jRunning = await mkJob("RUNNING", { startedAt: new Date() });
  const jFailed = await mkJob("FAILED", { error: "boom", attempts: 3 });
  await prisma.aiCreditTxn.create({ data: { tenantId: tid, kind: "USAGE", source: "CHAT", balanceAfter: 0, amountMicro: -123_000, ref: "qc-s216" } as never }).catch((e) => console.log("  ⚠️ txn: " + errMsg(e)));

  console.log("── Q: secretary-ops ──");
  if (!ops) { for (const i of [1, 2, 3]) skip(`Q-${i}`, "ops", "ไม่มี secretary-ops.ts"); }
  else {
    const q = await ops.listQueue(support) as { running: number; queued: number; failed: number; costTodayMicro: number; items: { id: string; status: string; tenantId: string }[] };
    const eF = await throws(() => ops.listQueue(finance));
    const ids = q.items.map((i) => i.id);
    chk("Q-1", "listQueue (SUPPORT): running ≥1 · queued ≥1 · failed ≥1 · costTodayMicro ≥ 123000 · items มีงานค้าง/ล้ม (QUEUED >5 นาที + FAILED) · FINANCE ⇒ throw", q.running >= 1 && q.queued >= 1 && q.failed >= 1 && q.costTodayMicro >= 123_000 && ids.includes(jQueuedOld.id) && ids.includes(jFailed.id) && !!eF, JSON.stringify({ q: { r: q.running, qd: q.queued, f: q.failed, c: q.costTodayMicro }, eF }).slice(0, 200));
    await ops.retryJob(support, jFailed.id);
    const jR = await prisma.aiRoomJob.findUnique({ where: { id: jFailed.id } });
    await ops.cancelJob(support, jQueuedOld.id);
    const jC = await prisma.aiRoomJob.findUnique({ where: { id: jQueuedOld.id } });
    const eRun = await throws(() => ops.cancelJob(finance, jRunning.id));
    chk("Q-2", "retryJob: FAILED→QUEUED attempts 0 error null · cancelJob: QUEUED→FAILED error มี 'cancelled' · FINANCE cancel ⇒ throw · RUNNING ไม่ถูกแตะ", jR?.status === "QUEUED" && jR?.attempts === 0 && !jR?.error && jC?.status === "FAILED" && /cancel/i.test(jC?.error ?? "") && !!eRun && (await prisma.aiRoomJob.findUnique({ where: { id: jRunning.id } }))?.status === "RUNNING", JSON.stringify({ jR: jR?.status, jC: jC?.status, err: jC?.error }));
    const cost = await ops.costByTenant(support, 7) as { tenantId: string; costMicro: number; tenantName?: string }[];
    const mine = cost.find((r) => r.tenantId === tid);
    chk("Q-3", "costByTenant(7 วัน) มีร้านทดสอบ costMicro 123000 · เรียงมากไปน้อย · ไม่มีเงินติดลบ", !!mine && mine.costMicro === 123_000 && cost.every((r, i) => i === 0 || cost[i - 1]!.costMicro >= r.costMicro) && cost.every((r) => r.costMicro >= 0), JSON.stringify({ mine, n: cost.length }).slice(0, 160));
  }

  console.log("── C: platform/support ──");
  if (!sup || typeof sup.listCasesForPlatform !== "function") { for (const i of [1, 2]) skip(`C-${i}`, "support", "ไม่มี listCasesForPlatform"); }
  else {
    const mkCase = (subject: string, extra: Record<string, unknown>) => prisma.supportCase.create({ data: { tenantId: tid, openedByUserId: U.owner, subject, ...extra } as never });
    const cApp = await mkCase("เลขาทำผิด", { source: "APP", category: "secretary_wrong", roomId: room.id });
    const cBill = await mkCase("บิลผิด", { source: "APP", category: "billing" });
    const cWeb = await mkCase("จากเว็บ", { source: "WEB", category: "question" });
    const all = await sup.listCasesForPlatform(support, { tab: "new" }) as { id: string; urgent?: boolean; source?: string; category?: string; roomId?: string | null }[];
    const app = await sup.listCasesForPlatform(support, { tab: "new", source: "APP" }) as { id: string }[];
    const sw = await sup.listCasesForPlatform(support, { tab: "new", category: "secretary_wrong" }) as { id: string }[];
    const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
    chk("C-1", "listCasesForPlatform: tab new มี 3 เคส · source=APP = 2 · category=secretary_wrong = 1 (มี roomId) · billing ⇒ urgent", ids(all).includes(cApp.id) && ids(all).includes(cBill.id) && ids(all).includes(cWeb.id) && app.length === 2 && sw.length === 1 && sw[0]!.id === cApp.id && all.find((c) => c.id === cBill.id)?.urgent === true && all.find((c) => c.id === cApp.id)?.roomId === room.id, JSON.stringify({ all: all.length, app: app.length, sw: sw.length }));
    const a1 = await sup.assignCase(support, cApp.id) as { ok: boolean };
    const mine = await sup.listCasesForPlatform(support, { tab: "mine" }) as { id: string }[];
    const eFin = await throws(() => sup.assignCase(finance, cBill.id));
    chk("C-2", "assignCase (SUPPORT) ⇒ ok · tab mine มีเคสนั้น · FINANCE assign ⇒ throw", a1.ok === true && ids(mine).includes(cApp.id) && !!eFin, JSON.stringify({ a1, mine: mine.length, eFin }).slice(0, 160));
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
