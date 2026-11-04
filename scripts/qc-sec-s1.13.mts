// QC — SECRETARY S1.13 · โควตา 100 งาน/เดือน · canRunAi ด่านเดียว · ensureWallet ไม่แจก GRANT ร้านใหม่ · quotaStatus · GET usage ไม่เขียน · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.13.md · RESOLUTIONS R-K6 R-K7 §B.6 · ต้องการ S1.4 rooms.ts + S0.4 pack.ts
//
// กลุ่มข้อ:
//   Q  quotaStatus อ่านอย่างเดียว · ค่าเริ่ม · หลัง startRoom ×3 · 80/95/100 · resetAt
//   C  canRunAi assist ฟรี · job เต็ม+ไม่มีกระเป๋า ⇒ jobs · job เต็ม+กระเป๋า>0 ⇒ ok และ startRoom นับเกิน limit ได้ · ensureWallet ร้านใหม่ 0/ไม่มี GRANT · ร้านเดิม GRANT $10 · canSpend/canSpendPeek · sendMessage ร้านใหม่ไม่ over_budget และหักเครดิตติดลบได้ · quotaMessage jobs
//   R  GET /api/mobile/usage: ไม่เขียน · ฟิลด์เดิมครบ · + jobs · ร้านเดิมเหมือนเดิม
//   D  fitness ×2 · service.ts ไม่ใช้ canSpend แล้ว
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.13.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.13";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const Q_FILE = join(ROOT, "src/lib/ai/secretary/quota.ts");
if (!FORCED && !existsSync(Q_FILE)) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/lib/ai/secretary/quota.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
process.env.SHARK_AI_MOCK = "1"; delete process.env.SHARK_AI_WELCOME_USD;
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import type { AiChatMessage, AiProvider, AiReply, AiToolDef } from "@/lib/ai/provider";
class Scripted implements AiProvider { calls = 0; async chat(_m: AiChatMessage[], _o?: { tools?: AiToolDef[] }): Promise<AiReply> { this.calls++; return { text: "รับทราบ", tokensIn: 1000, tokensOut: 100, model: "anthropic/claude-haiku-4.5" }; } }
const req = (u: string, headers: Record<string, string>) => new Request(`http://qc.local${u}`, { method: "GET", headers });

const { prisma } = await import("@/lib/core/db");
const credit = (await import("@/lib/ai/credit")) as AnyMod;
const usage = (await import("@/lib/ai/usage")) as AnyMod;
const pack = (await import("@/lib/ai/secretary/pack")) as AnyMod;
const service = await import("@/lib/ai/service");
const rooms = (await import("@/lib/ai/secretary/rooms").catch(() => null)) as AnyMod | null;
const quota = existsSync(Q_FILE) ? ((await import("@/lib/ai/secretary/quota").catch((e) => { console.log("  ⚠️ import quota.ts: " + errMsg(e)); return null; })) as AnyMod | null) : null;
const hasTables = "aiJobCounter" in prisma && "aiRoom" in prisma;
const NOW = new Date("2026-11-10T03:00:00Z");
const month = pack.monthKeyBangkok(NOW) as string;
const limit = pack.FREE_PACK.jobsPerMonth as number;
const LAUNCH = new Date(pack.SECRETARY_LAUNCH_AT as string);
const U = { owner: "qcs13-owner" };
const tids: string[] = [];
const cleanup = async () => {
  for (const tid of tids) { for (const m of ["aiRoomMember", "aiRoomJob", "aiRoom", "aiProposal", "aiMessage", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "session", "appSystem", "membership"]) { try { await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* */ } } try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup ${tid}: ${errMsg(e)}`); } }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s13-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.session.deleteMany({ where: { userId: { startsWith: "qcs13-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs13-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  await prisma.user.create({ data: { id: U.owner, email: `${U.owner}@example.com`, name: "เจ้าของ" } });
  const mkTenant = async (tag: string, createdAt: Date) => { const t = await prisma.tenant.create({ data: { name: `QC SEC S1.13 ${tag}`, slug: `qc-sec-s13-${tag}-${Date.now().toString(36)}`, createdAt } }); tids.push(t.id); await prisma.membership.create({ data: { tenantId: t.id, userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {} as never, acceptedAt: new Date() } }); return t.id; };
  const NEW = await mkTenant("new", new Date(LAUNCH.getTime() + 60_000)); // ร้านใหม่หลังเปิดเลขา
  const OLD = await mkTenant("old", new Date(LAUNCH.getTime() - 86_400_000)); // ร้านเดิมก่อนเปิดเลขา
  const actor = (tid: string) => ({ kind: "member" as const, tenantId: tid, userId: U.owner, membership: { role: "OWNER" as const, unitAccess: ["*"], permissions: {} } });
  if (!quota || !rooms || !hasTables || typeof credit.canRunAi !== "function") { for (const id of ["Q-1", "Q-2", "C-1", "C-2", "C-3", "C-4", "C-5", "R-1", "R-2"]) skip(id, "quota", !quota ? "ไม่มี quota.ts" : !rooms ? "ไม่มี rooms.ts" : typeof credit.canRunAi !== "function" ? "credit.ts ไม่มี canRunAi" : "ไม่มีตาราง"); }
  else {
    console.log("── Q: quotaStatus ──");
    const q0 = await quota.quotaStatus(NEW, NOW);
    chk("Q-1", "ร้านใหม่: jobsUsed 0 · limit 100 · left 100 · pct 0 · level ok · text null · resetAt 1 ธ.ค. 00:00 BKK · balanceMicro null · blocked null · ไม่สร้างกระเป๋า/ตัวนับ", q0.month === month && q0.jobsUsed === 0 && q0.jobsLimit === limit && q0.jobsLeft === limit && q0.pct === 0 && q0.level === "ok" && q0.text === null && new Date(q0.resetAt).toISOString() === "2026-11-30T17:00:00.000Z" && q0.balanceMicro === null && q0.blocked === null && (await prisma.aiCreditWallet.count({ where: { tenantId: NEW } })) === 0 && (await prisma.aiJobCounter.count({ where: { tenantId: NEW } })) === 0, JSON.stringify(q0).slice(0, 240));
    for (let i = 0; i < 3; i++) await rooms.startRoom({ tenantId: NEW, actor: actor(NEW) }, { instruction: `งาน ${i}` }, NOW);
    const q3 = await quota.quotaStatus(NEW, NOW);
    await prisma.aiJobCounter.update({ where: { tenantId_month: { tenantId: NEW, month } }, data: { jobs: 80 } });
    const q80 = await quota.quotaStatus(NEW, NOW);
    await prisma.aiJobCounter.update({ where: { tenantId_month: { tenantId: NEW, month } }, data: { jobs: limit } });
    const q100 = await quota.quotaStatus(NEW, NOW);
    chk("Q-2", "หลัง startRoom ×3 ⇒ used 3 left 97 · 80 ⇒ warn80 text ไทยมี 80 · 100 ⇒ exhausted left 0 blocked jobs text มี 'หมด' · jobsLeft() ตรงกัน", q3.jobsUsed === 3 && q3.jobsLeft === limit - 3 && q80.level === "warn80" && thai(q80.text) && /80/.test(q80.text) && q100.level === "exhausted" && q100.jobsLeft === 0 && q100.blocked === "jobs" && /หมด/.test(q100.text ?? "") && (await quota.jobsLeft(NEW, NOW)) === 0, JSON.stringify({ q3: q3.jobsUsed, q80: q80.level, q100 }).slice(0, 240));

    console.log("── C: canRunAi · ensureWallet · canSpend · sendMessage ──");
    const a1 = await credit.canRunAi(NEW, { scope: "assist", now: NOW });
    const j1 = await credit.canRunAi(NEW, { scope: "job", now: NOW });
    const rQ = await rooms.startRoom({ tenantId: NEW, actor: actor(NEW) }, { instruction: "เกินโควตา" }, NOW);
    chk("C-1", "ร้านใหม่ 100/100 ไม่มีกระเป๋า: assist ⇒ ok (ฟรี) · job ⇒ {ok:false, reason:jobs, resetAt, message ไทย} · startRoom ⇒ error quota", a1.ok === true && j1.ok === false && j1.reason === "jobs" && new Date(j1.resetAt).toISOString() === "2026-11-30T17:00:00.000Z" && thai(j1.message) && rQ.ok === false && rQ.error === "quota" && (await prisma.aiCreditWallet.count({ where: { tenantId: NEW } })) === 0, JSON.stringify({ a1, j1, rQ }).slice(0, 240));
    const wNew = await credit.ensureWallet(NEW);
    const wOld = await credit.ensureWallet(OLD);
    const txNew = await prisma.aiCreditTxn.count({ where: { tenantId: NEW } }), txOld = await prisma.aiCreditTxn.findMany({ where: { tenantId: OLD } });
    chk("C-2", "ensureWallet: ร้านใหม่ ⇒ balance 0 · grantedAt null · ไม่มีแถว GRANT · ร้านเดิม ⇒ $10 (10,000,000 µ) + แถว GRANT ref welcome-grant (เดิม) · เรียกซ้ำได้ (idempotent)", wNew.balanceMicro === 0 && wNew.grantedAt === null && txNew === 0 && wOld.balanceMicro === 10_000_000 && txOld.length === 1 && txOld[0].kind === "GRANT" && txOld[0].ref === "welcome-grant" && (await credit.ensureWallet(NEW)).balanceMicro === 0 && (await prisma.aiCreditTxn.count({ where: { tenantId: OLD } })) === 1, JSON.stringify({ wNew, wOld: wOld.balanceMicro, txNew, txOld: txOld.length }).slice(0, 200));
    // กระเป๋า > 0 ⇒ job ต่อได้เกิน limit (Q4)
    await prisma.aiCreditWallet.update({ where: { tenantId: NEW }, data: { balanceMicro: 1_000_000 } });
    const j2 = await credit.canRunAi(NEW, { scope: "job", now: NOW });
    const rOver = await rooms.startRoom({ tenantId: NEW, actor: actor(NEW) }, { instruction: "ใช้กระเป๋าต่อ" }, NOW);
    const cnt = (await prisma.aiJobCounter.findUnique({ where: { tenantId_month: { tenantId: NEW, month } } }))?.jobs;
    const qOver = await quota.quotaStatus(NEW, NOW);
    await prisma.aiCreditWallet.update({ where: { tenantId: NEW }, data: { balanceMicro: 0 } });
    const rStop = await rooms.startRoom({ tenantId: NEW, actor: actor(NEW) }, { instruction: "หยุด" }, NOW);
    chk("C-3", "100/100 + กระเป๋า $1 ⇒ job ok · startRoom ok · ตัวนับ 101 · quotaStatus blocked null (มีเงิน) · กระเป๋า 0 ⇒ startRoom quota อีกครั้ง", j2.ok === true && rOver.ok === true && cnt === limit + 1 && qOver.blocked === null && qOver.jobsLeft === 0 && rStop.ok === false && rStop.error === "quota", JSON.stringify({ j2, rOver: rOver.ok, cnt, qOver: { b: qOver.blocked, l: qOver.jobsLeft }, rStop }).slice(0, 200));
    const NEW2 = await mkTenant("new2", new Date(LAUNCH.getTime() + 120_000));
    const cs = await credit.canSpend(NEW2), csp = await credit.canSpendPeek(NEW2);
    const noWallet = (await prisma.aiCreditWallet.count({ where: { tenantId: NEW2 } })) === 0;
    const p = new Scripted();
    const sm = await service.sendMessage({ tenantId: NEW2, actor: actor(NEW2) }, { text: "สวัสดี" }, { provider: p });
    const w2 = await prisma.aiCreditWallet.findUnique({ where: { tenantId: NEW2 } });
    const tx2 = await prisma.aiCreditTxn.findMany({ where: { tenantId: NEW2 } });
    chk("C-4", "ร้านใหม่ไม่มีกระเป๋า: canSpend true · canSpendPeek true (ไม่สร้างกระเป๋า) · sendMessage ⇒ ok (ไม่ over_budget) · หักค่าใช้จ่ายแล้วยอดติดลบ · ไม่มีแถว GRANT", cs === true && csp === true && noWallet && sm.ok === true && !!w2 && w2.balanceMicro < 0 && w2.grantedAt === null && tx2.length >= 1 && !tx2.some((t) => t.kind === "GRANT"), JSON.stringify({ cs, csp, noWallet, sm: sm.ok, w2: w2?.balanceMicro, kinds: tx2.map((t) => t.kind) }).slice(0, 200));
    const m = usage.quotaMessage("jobs", new Date("2026-11-30T17:00:00Z"));
    chk("C-5", "usage.quotaMessage('jobs', resetAt) ไทย · มี 'งาน' · มีวันที่ (ธ.ค./1) · scope credit/day เดิมไม่เปลี่ยน", thai(m) && /งาน/.test(m) && /ธ\.ค\.|1/.test(m) && /เครดิต/.test(usage.quotaMessage("credit")) && /วันนี้/.test(usage.quotaMessage("day")), m.slice(0, 120));
    // R-S1.13b: เพดานต้นทุน assist ต่อวัน (วันไทยของ now)
    const capMicro = Number(pack.FREE_PACK.assistDailyMicro);
    await prisma.aiCreditTxn.create({ data: { tenantId: OLD, kind: "USAGE", amountMicro: -(capMicro - 1), ref: "qc-s113-cap", createdAt: new Date(NOW.getTime() - 60_000) } as never }).catch((e: unknown) => console.log("  ⚠️ txn cap: " + errMsg(e)));
    const aUnder = await credit.canRunAi(OLD, { scope: "assist", now: NOW });
    await prisma.aiCreditTxn.create({ data: { tenantId: OLD, kind: "USAGE", amountMicro: -1, ref: "qc-s113-cap2", createdAt: new Date(NOW.getTime() - 30_000) } as never }).catch(() => null);
    const aOver = await credit.canRunAi(OLD, { scope: "assist", now: NOW });
    const aNext = await credit.canRunAi(OLD, { scope: "assist", now: new Date(NOW.getTime() + 86_400_000) });
    const jOver = await credit.canRunAi(OLD, { scope: "job", now: NOW });
    const qCap = await quota.quotaStatus(OLD, NOW) as { assist?: { usedMicro: number; capMicro: number } };
    chk("C-6", "R-S1.13b: assistDailyMicro=500000 · ใช้ไป cap−1 ⇒ assist ok · ถึง cap ⇒ ok:false reason credit resetAt message ไทยมี 'วันนี้' · วันถัดไป ok · job ไม่ติดเพดานนี้ · quotaStatus.assist {usedMicro=cap, capMicro}", capMicro === 500_000 && aUnder.ok === true && aOver.ok === false && aOver.reason === "credit" && aOver.resetAt instanceof Date && /วันนี้/.test(aOver.message ?? "") && aNext.ok === true && jOver.ok === true && qCap.assist?.usedMicro === capMicro && qCap.assist?.capMicro === capMicro, JSON.stringify({ aUnder, aOver, aNext: aNext.ok, jOver: jOver.ok, q: qCap.assist }).slice(0, 240));

    console.log("── R: GET /api/mobile/usage ──");
    const route = (await import("@/app/api/mobile/usage/route")) as AnyMod;
    const { issueMobileToken } = await import("@/lib/mobile/auth");
    const tk = await issueMobileToken(U.owner, { userAgent: "qc" });
    const NEW3 = await mkTenant("new3", new Date(LAUNCH.getTime() + 180_000));
    const r1 = await route.GET(req("/api/mobile/usage", { authorization: `Bearer ${tk.token}`, "x-tenant-id": NEW3 }));
    const b1 = (await r1.json()) as AnyMod;
    const walletsAfter = await prisma.aiCreditWallet.count({ where: { tenantId: NEW3 } });
    chk("R-1", "ร้านใหม่: 200 · ไม่สร้างกระเป๋า (GET ไม่เขียน) · ฟิลด์เดิมครบ (scope used limit pct warn degraded blocked resetAt balanceMicro) · blocked null · + jobs {jobsUsed 0, jobsLimit 100, jobsLeft 100, resetAt}", r1.status === 200 && walletsAfter === 0 && ["scope", "used", "limit", "pct", "warn", "degraded", "blocked", "resetAt", "balanceMicro"].every((k) => k in b1) && b1.blocked === null && b1.degraded === false && b1.jobs?.jobsUsed === 0 && b1.jobs?.jobsLimit === limit && b1.jobs?.jobsLeft === limit && typeof b1.jobs?.resetAt === "string", JSON.stringify(b1).slice(0, 240));
    const r2 = await route.GET(req("/api/mobile/usage", { authorization: `Bearer ${tk.token}`, "x-tenant-id": OLD }));
    const b2 = (await r2.json()) as AnyMod;
    chk("R-2", "ร้านเดิม (กระเป๋า $10): scope credit · limit 10,000,000 · used 0 · pct 0 · balanceMicro 10,000,000 · degraded false (เหมือนเดิม) · jobs ด้วย", r2.status === 200 && b2.scope === "credit" && b2.limit === 10_000_000 && b2.used === 0 && b2.pct === 0 && b2.balanceMicro === 10_000_000 && b2.degraded === false && b2.jobs?.jobsLimit === limit, JSON.stringify(b2).slice(0, 200));
  }
} finally {
  await cleanup();
}
console.log("── D: fitness · static ──");
{
  const f1 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-1", "pnpm fitness (มี env) exit 0", f1.status === 0, (f1.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  const env2 = { ...process.env }; delete env2.DATABASE_URL; delete env2.DIRECT_URL;
  const f2 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: env2, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-2", "pnpm fitness (ไม่มี env) exit 0", f2.status === 0, (f2.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  const svc = readFileSync(join(ROOT, "src/lib/ai/service.ts"), "utf8"), rt = readFileSync(join(ROOT, "src/app/api/mobile/usage/route.ts"), "utf8");
  chk("D-3", "service.ts ใช้ canRunAi (ไม่เรียก canSpend) · usage/route.ts ไม่เรียก ensureWallet (GET ไม่เขียน)", /canRunAi\(/.test(svc) && !/\bcanSpend\(/.test(svc) && !/ensureWallet/.test(rt), "ตรวจไฟล์", "MAJOR");
}
await prisma.$disconnect();
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
