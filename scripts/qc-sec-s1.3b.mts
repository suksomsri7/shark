// QC — SECRETARY S1.3b · ปิดช่องจากรีวิวย้อนหลัง S1-2 (อ่านข้ามโมดูลเคารพ OFF · hand tool fail-closed · route คีย์ API ส่ง access · setAccess โหลด membership · แผนตรวจระดับก่อน claim · CRM door · identity) · oracle ของผู้คุม
// สัญญา: ledger/secretary-briefs/sec-brief-S1.3b.md · RESOLUTIONS §I · ต้องการ S1.2/S1.3 merged
//
// กลุ่มข้อ:
//   X  upcoming_schedule: hr OFF ⇒ ไม่มีชื่อพนักงานที่ลา · hr DRAFT ⇒ มี · financial_summary: pos OFF ⇒ ไม่มีตัวเลขรายได้ POS · TOOL_EXTRA_MODULES · HAND_TOOL_CORE ครบ (fail-closed)
//   A  route คีย์ API: ไฟล์ส่ง access เข้า toolVerdict/runTool (static)
//   S  setAccess: membership ปลอม OWNER แต่ DB MANAGER ⇒ Forbidden · DB OWNER ⇒ ok แม้ส่ง hint ผิด · setAccessAsPlatform
//   P  executePlan: ขั้นของโมดูล OFF ⇒ คง PENDING ไม่ทำขั้นแรก · propose_plan ปฏิเสธขั้น OFF · CRM door proposal กับ crm OFF ⇒ note ระดับ (คง PENDING)
//   I  identity: zero-width/RTL ปฏิเสธ · ชื่อไทย 10 grapheme (30 code points) ⇒ ok · identityOf clamp
//   D  fitness ×2
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.3b.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.3b";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const started = /TOOL_EXTRA_MODULES/.test(rd(join(ROOT, "src/lib/ai/secretary/access-rules.ts")));
if (!FORCED && !started) {
  console.log(`⏭️  ${LABEL}: access-rules.ts ยังไม่มี TOOL_EXTRA_MODULES (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
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
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
async function throws(fn: () => Promise<unknown> | unknown): Promise<string | null> { try { await fn(); return null; } catch (e) { return errMsg(e); } }
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { prisma } = await import("@/lib/core/db");
const tools = (await import("@/lib/ai/tools")) as AnyMod;
const toolAccess = (await import("@/lib/ai/tool-access")) as AnyMod;
const rules = (await import("@/lib/ai/secretary/access-rules")) as AnyMod;
const access = (await import("@/lib/ai/secretary/access")) as AnyMod;
const sec = (await import("@/lib/ai/secretary/secretary")) as AnyMod;
const identity = (await import("@/lib/ai/secretary/identity")) as AnyMod;
const proposals = await import("@/lib/ai/proposals");
const plans = await import("@/lib/ai/plans");
const sys = await import("@/lib/modules/system/service");
const { ForbiddenError } = await import("@/lib/core/rbac");

const U = { owner: "qcs13b-owner", mgr: "qcs13b-mgr" };
let tid = "";
const cleanup = async () => {
  if (tid) { for (const m of ["aiSystemAccess", "aiSecretary", "aiProposal", "aiPlan", "aiMessage", "aiConversation", "aiRoom", "hrLeave", "hrEmployee", "posSale", "kanbanCard", "kanbanColumn", "kanbanBoard", "businessUnit", "appSystem", "membership"]) { try { await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* */ } } try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); } }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s13b-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await (prisma as AnyMod).aiSecretary?.deleteMany({ where: { userId: { startsWith: "qcs13b-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs13b-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.3b", slug: `qc-sec-s13b-${Date.now().toString(36)}` } });
  tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: k } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {} as never, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.mgr, role: "MANAGER", unitAccess: ["*"], permissions: {} as never, acceptedAt: new Date() } });
  const M = (role: "OWNER" | "MANAGER") => ({ role, unitAccess: ["*"], permissions: {} });
  const OWNER = { kind: "member" as const, tenantId: tid, userId: U.owner, membership: M("OWNER") };
  const hr = await sys.createSystem(tid, "HR", "พนักงาน");
  const pos = await sys.createSystem(tid, "POS", "ขายหน้าร้าน");
  await sys.createSystem(tid, "KANBAN", "บอร์ดงาน");
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขา", slug: `u-${Date.now().toString(36)}` } });
  const hrSvc = await import("@/lib/modules/hr/service");
  const emp = await hrSvc.createEmployee({ tenantId: tid, systemId: hr.id }, { name: "พนักงานลาQC" });
  const from = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await hrSvc.requestLeave({ tenantId: tid, systemId: hr.id }, { employeeId: emp.id, type: "SICK", fromDate: from, toDate: from, reason: "qc" });
  await prisma.posSale.create({ data: { tenantId: tid, unitId: unit.id, systemId: pos.id, idempotencyKey: "qcs13b-s1", status: "PAID", docType: "SALE", subtotalSatang: 1234500, grandTotalSatang: 1234500 } as never });

  console.log("── X: อ่านข้ามโมดูล ──");
  const setBy = { userId: U.owner, membership: M("OWNER") };
  const base = await access.getAccess(tid);
  const ctxWith = (a: AnyMod) => ({ tenantId: tid, actor: OWNER, access: a });
  const outHrOn = String(await tools.runTool(ctxWith(base), "upcoming_schedule", { days: 7 }) ?? "");
  const accHrOff = await access.setAccess(tid, setBy, "hr", "OFF");
  const outHrOff = String(await tools.runTool(ctxWith(accHrOff), "upcoming_schedule", { days: 7 }) ?? "");
  chk("X-1", "upcoming_schedule: hr DRAFT ⇒ มีชื่อพนักงานที่ลา · hr OFF ⇒ ไม่มีชื่อ + บอกว่าข้ามส่วน (ไทย) · ไม่ใช่ error ทั้ง tool", outHrOn.includes("พนักงานลาQC") && !outHrOff.includes("พนักงานลาQC") && thai(outHrOff) && !/"error"/.test(outHrOff), `on=${outHrOn.slice(0, 80)} off=${outHrOff.slice(0, 120)}`);
  const outFinOn = String(await tools.runTool(ctxWith(accHrOff), "financial_summary", {}) ?? "");
  const accPosOff = await access.setAccess(tid, setBy, "pos", "OFF");
  const outFinOff = String(await tools.runTool(ctxWith(accPosOff), "financial_summary", {}) ?? "");
  chk("X-2", "financial_summary: pos DRAFT ⇒ รายได้ 12345 · pos OFF ⇒ ไม่มีตัวเลขนั้น + บอกว่าข้าม", outFinOn.includes("12345") && !outFinOff.includes("12345") && thai(outFinOff), `on=${outFinOn.slice(0, 80)} off=${outFinOff.slice(0, 100)}`);
  await access.setAccess(tid, setBy, "pos", "DRAFT"); await access.setAccess(tid, setBy, "hr", "DRAFT");
  const extra = rules.TOOL_EXTRA_MODULES as Record<string, readonly string[]> | undefined;
  chk("X-3", "TOOL_EXTRA_MODULES ครอบ upcoming_schedule(booking,hotel,hr) · financial_summary(pos) · growth_recommendations(member,pos) · customer_points(point) · moduleOff(undefined, m) = false", !!extra && ["booking", "hotel", "hr"].every((m) => extra.upcoming_schedule?.includes(m)) && extra.financial_summary?.includes("pos") && ["member", "pos"].every((m) => extra.growth_recommendations?.includes(m)) && extra.customer_points?.includes("point") && rules.moduleOff(undefined, "pos") === false && rules.moduleOff({ pos: "OFF" }, "pos") === true, JSON.stringify(extra ?? null).slice(0, 200));
  const core = toolAccess.HAND_TOOL_CORE as Set<string> | undefined;
  const hand = Object.entries(toolAccess.HAND_TOOL_ACCESS as Record<string, { needs: unknown[] }>).filter(([, r]) => Array.isArray(r.needs) && r.needs.length === 0).map(([n]) => n);
  const modMap = toolAccess.HAND_TOOL_MODULE as Record<string, string> | undefined;
  const unmapped = hand.filter((n) => !(core?.has(n)) && !(modMap && n in modMap));
  const vUnmapped = toolAccess.accessVerdict?.({ pos: "DRAFT" }, "__no_such_hand_tool__");
  chk("X-4", "HAND_TOOL_CORE มี · ทุก hand tool ที่ needs ว่างอยู่ใน CORE หรือ MODULE · tool ที่ไม่รู้จัก ⇒ accessVerdict ปฏิเสธ (fail-closed)", !!core && core.size >= 5 && unmapped.length === 0 && vUnmapped?.ok === false, `unmapped=${unmapped.join(",")} v=${JSON.stringify(vUnmapped ?? null)}`);

  console.log("── A: route คีย์ API (static) ──");
  const r1 = rd(join(ROOT, "src/app/api/v1/ai/tools/[name]/route.ts")), r2 = rd(join(ROOT, "src/app/api/v1/ai/skills/route.ts")), r3 = rd(join(ROOT, "src/app/api/v1/ai/skills/[id]/route.ts"));
  chk("A-1", "route tools/[name]: getAccess + toolVerdict(..., access) + runTool ctx.access · skills routes ส่ง access ให้ toolVerdict", /getAccess\(/.test(r1) && /toolVerdict\([^)]*access/.test(r1) && /runTool\(\s*\{[\s\S]*?access[\s\S]*?\}/.test(r1) && /getAccess\(/.test(r2) && /access/.test(r2.split("toolVerdict(")[1] ?? "") && /getAccess\(/.test(r3) && /access/.test(r3.split("toolVerdict(")[1] ?? ""), `tools=${/getAccess\(/.test(r1)} skills=${/getAccess\(/.test(r2)} skillsId=${/getAccess\(/.test(r3)}`);

  console.log("── S: setAccess โหลด membership เอง ──");
  let fe = false; try { await access.setAccess(tid, { userId: U.mgr, membership: M("OWNER") }, "kb", "OFF"); } catch (e) { fe = e instanceof ForbiddenError; }
  const okHint = await access.setAccess(tid, { userId: U.owner, membership: M("MANAGER") }, "kb", "OFF").then(() => true).catch(() => false);
  let feNo = false; try { await access.setAccess(tid, { userId: "qcs13b-nobody" }, "kb", "OFF"); } catch (e) { feNo = e instanceof ForbiddenError; }
  const plat = typeof access.setAccessAsPlatform === "function" ? await access.setAccessAsPlatform(tid, "kb", "READ", "qcs13b-platform") : null;
  const rowKb = await prisma.aiSystemAccess.findUnique({ where: { tenantId_module: { tenantId: tid, module: "kb" } } });
  chk("S-1", "MANAGER ส่ง hint OWNER ⇒ Forbidden · OWNER ส่ง hint MANAGER ⇒ ok (DB ชนะ) · user ไม่มี membership ⇒ Forbidden · setAccessAsPlatform ⇒ READ · setById ขึ้นต้น platform:", fe && okHint && feNo && plat?.kb === "READ" && rowKb?.level === "READ" && String(rowKb?.setById).startsWith("platform:"), `fe=${fe} okHint=${okHint} feNo=${feNo} plat=${plat?.kb} setBy=${rowKb?.setById}`);
  await access.setAccess(tid, setBy, "kb", "OFF");

  console.log("── P: แผน · propose_plan · CRM door ──");
  const conv = await prisma.aiConversation.create({ data: { id: `u~${U.owner}~qcs13b-${Date.now().toString(36)}`, tenantId: tid, title: "qc" } });
  const plan = await prisma.aiPlan.create({ data: { tenantId: tid, conversationId: conv.id, title: "แผน qc", stepsJson: [{ kind: "kanban_create_card", summary: "การ์ด", payload: { title: "การ์ดจากแผน S1.3b" }, status: "PENDING" }, { kind: "kb_create_article", summary: "บทความ", payload: { title: "x", body: "y" }, status: "PENDING" }] as never, expiresAt: new Date(Date.now() + 3_600_000) } });
  const pr = await plans.executePlan(M("OWNER") as never, { tenantId: tid } as never, plan.id, { userId: U.owner });
  const planAfter = await prisma.aiPlan.findUnique({ where: { id: plan.id } });
  chk("P-1", "executePlan: ขั้น 2 (kb OFF) ⇒ ok:false · note ไทยบอกระดับ · doneCount 0 · แผนคง PENDING · ไม่สร้างการ์ดขั้น 1", pr.ok === false && pr.doneCount === 0 && (pr.results?.[0]?.note ?? "").length > 0 && thai(pr.results?.[0]?.note) && planAfter?.status === "PENDING" && (await prisma.kanbanCard.count({ where: { tenantId: tid, title: "การ์ดจากแผน S1.3b" } })) === 0, JSON.stringify({ pr, st: planAfter?.status }).slice(0, 200));
  const pp = String(await tools.runTool({ tenantId: tid, actor: OWNER, conversationId: conv.id, access: await access.getAccess(tid) }, "propose_plan", { title: "แผนทดสอบ", steps: [{ kind: "kb_create_article", summary: "บทความ", payload: { title: "x", body: "y" } }] }) ?? "");
  const ppOk = String(await tools.runTool({ tenantId: tid, actor: OWNER, conversationId: conv.id, access: await access.getAccess(tid) }, "propose_plan", { title: "แผนทดสอบ 2", steps: [{ kind: "kanban_create_card", summary: "การ์ด", payload: { title: "ok" } }] }) ?? "");
  chk("P-2", "propose_plan: ขั้นของโมดูล OFF ⇒ {error ไทย} ไม่สร้างแผน · ขั้น DRAFT ⇒ สร้างแผน (planId)", /"error"/.test(pp) && thai(pp) && /planId/.test(ppOk) && (await prisma.aiPlan.count({ where: { tenantId: tid, title: "แผนทดสอบ" } })) === 0, `pp=${pp.slice(0, 100)} ok=${ppOk.slice(0, 60)}`);
  await access.setAccess(tid, setBy, "crm", "OFF");
  const crmProp = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: conv.id, kind: "crm.deals.create", summary: "qc", payload: { requestedByUserId: U.owner, input: {} } as never, expiresAt: new Date(Date.now() + 3_600_000) } });
  const exCrm = await proposals.executeProposal(M("OWNER") as never, { tenantId: tid } as never, crmProp.id, { userId: U.owner });
  const crmAfter = await prisma.aiProposal.findUnique({ where: { id: crmProp.id } });
  chk("P-3", "ข้อเสนอประตู CRM (crm.* + requestedByUserId) เมื่อ crm OFF ⇒ ok:false note ระดับ (มี 'ปิด') · คง PENDING", exCrm.ok === false && /ปิด/.test(exCrm.note) && crmAfter?.status === "PENDING", JSON.stringify({ exCrm, st: crmAfter?.status }).slice(0, 160));
  await access.setAccess(tid, setBy, "crm", "DRAFT");

  console.log("── I: identity ──");
  await sec.ensureSecretary(U.owner);
  const e1 = await throws(() => sec.updateSecretary(U.owner, { name: "​​" }));
  const e2 = await throws(() => sec.updateSecretary(U.owner, { name: "‮เลขา" }));
  const e3 = await throws(() => sec.updateSecretary(U.owner, { name: "   ...   " }));
  const okThai = await sec.updateSecretary(U.owner, { name: "ที่".repeat(10) }).then((r: AnyMod) => r.name).catch((e: unknown) => `ERR:${errMsg(e)}`);
  const clamp = identity.identityOf({ name: "ก​ข" + "ย".repeat(60), suffix: "ค่ะ\u0000", tone: "polite", languages: ["th"] });
  chk("I-1", "updateSecretary: zero-width/RTL/ไม่มีตัวอักษร ⇒ throw ไทย · ชื่อไทย 10 grapheme (30 code points) ⇒ ok · identityOf clamp: ตัด zero-width/control + ความยาว", thai(e1) && thai(e2) && thai(e3) && okThai === "ที่".repeat(10) && !clamp.name.includes("​") && !clamp.suffix.includes("\u0000") && [...new (Intl as AnyMod).Segmenter("th", { granularity: "grapheme" }).segment(clamp.name)].length <= 30, JSON.stringify({ e1, e2, e3, okThai, clampLen: clamp.name.length }).slice(0, 200));
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
  const pr = rd(join(ROOT, "src/lib/ai/proposals.ts"));
  chk("D-3", "accessLevelGate ห่อ error เป็นไทย (try/catch ภายใน)", /accessLevelGate[\s\S]{0,600}?try[\s\S]{0,400}?catch/.test(pr), "ไม่พบ try/catch ใน accessLevelGate", "MAJOR");
}
await prisma.$disconnect();
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
