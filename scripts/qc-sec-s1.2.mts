// QC — SECRETARY S1.2 + S1.3 · ตัวตนเลขา (secretary.ts + persona) · สิทธิ์ต่อระบบ 3 ระดับ (access.ts + ด่านเครื่องมือ) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.2.md · RESOLUTIONS R-K3 R-K4 · ต้องการตาราง S1.1 (AiSecretary · AiSystemAccess) บนฐาน wo-sec-qc
//
// กลุ่มข้อ:
//   P  persona snapshot: ไม่มี secretary ⇒ prompt เท่าเดิมทุกไบต์ (sha256 ของ 5973db2e) · มี secretary ⇒ ชื่อ/ลงท้าย/ภาษา/น้ำเสียงโผล่ถูกที่
//   A  secretary.ts: ensure/secretaryOf/update (validation)/sampleSpeech/secretaryPromptBlock
//   B  access.ts: default DRAFT (chat READ) · setAccess OWNER เท่านั้น · AUTO ปฏิเสธ · toolModuleOf/toolIsWrite/accessVerdict/kindAllowedByAccess · AI_MODULES ครอบทุก module ที่ด่านรู้จัก
//   R  ด่านจริง: toolsOfferedTo/toolVerdict/runTool/sendMessage/executeProposal เคารพระดับ · ไม่ส่ง access = เดิม
//   D  fitness ×2
// ทุกแถวทดสอบอยู่ใต้ tenant ชั่วคราว slug `qc-sec-s12-*` · ผู้ใช้ `qcs12-*` · ลบใน finally
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.2.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.2";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const SEC_FILE = join(ROOT, "src/lib/ai/secretary/secretary.ts");
const ACC_FILE = join(ROOT, "src/lib/ai/secretary/access.ts");
// snapshot ของ buildSystemPrompt @5973db2e (ผู้คุมคำนวณ 4 พ.ย.) — ctx A มีทุกบล็อก · ctx B ว่าง
const SNAP_A = "da1e5f6986e5f850fe1ec73d48dec1fb159275b0b6c67c6e87433cc01d94de49";
const SNAP_B = "a5fab6d7ae96ce77906aeed061f3b895f9f0fb9f36432a28c321e03ea3f26f62";

if (!FORCED && !existsSync(SEC_FILE)) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/lib/ai/secretary/secretary.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); }
  }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
process.env.SHARK_AI_MOCK = "1";

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
async function throws(fn: () => Promise<unknown> | unknown): Promise<string | null> { try { await fn(); return null; } catch (e) { return errMsg(e); } }

import type { AiChatMessage, AiProvider, AiReply, AiToolDef } from "@/lib/ai/provider";
class Scripted implements AiProvider {
  captured: { messages: AiChatMessage[]; tools?: AiToolDef[] }[] = [];
  constructor(private replies: Partial<AiReply>[]) {}
  async chat(messages: AiChatMessage[], opts?: { tools?: AiToolDef[] }): Promise<AiReply> {
    this.captured.push({ messages, tools: opts?.tools });
    const r = this.replies.shift() ?? {};
    return { text: r.text ?? "รับทราบ", toolCalls: r.toolCalls, tokensIn: 1, tokensOut: 1, model: "scripted" };
  }
}

const { prisma } = await import("@/lib/core/db");
const persona = await import("@/lib/ai/persona");
const toolAccess = await import("@/lib/ai/tool-access");
const tools = await import("@/lib/ai/tools");
const proposals = await import("@/lib/ai/proposals");
const service = await import("@/lib/ai/service");
const sys = await import("@/lib/modules/system/service");
const { ForbiddenError } = await import("@/lib/core/rbac");
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const sec: AnyMod | null = existsSync(SEC_FILE) ? ((await import("@/lib/ai/secretary/secretary").catch(() => null)) as AnyMod | null) : null;
const acc: AnyMod | null = existsSync(ACC_FILE) ? ((await import("@/lib/ai/secretary/access").catch(() => null)) as AnyMod | null) : null;
const hasTables = "aiSecretary" in prisma && "aiSystemAccess" in prisma;

// ═══════════════ P. persona snapshot ═══════════════
console.log("── P: persona ──");
{
  const ctxA = { tenantName: "QC Sec Café", systems: [{ type: "POS", name: "ขายหน้าร้าน" }, { type: "ACCOUNT", name: "บัญชี" }], dna: "- เปิด 9 โมง", memories: "- ลูกค้าประจำชื่อสมชาย", promptTweaks: "- ตอบสั้น" };
  const ctxB = { tenantName: "QC Sec Café", systems: [] as { type: string; name: string }[] };
  chk("P-1", "ไม่มี secretary ⇒ buildSystemPrompt เท่า snapshot 5973db2e ทุกไบต์ (ctx เต็ม + ctx ว่าง)", sha(persona.buildSystemPrompt(ctxA)) === SNAP_A && sha(persona.buildSystemPrompt(ctxB)) === SNAP_B, `A=${sha(persona.buildSystemPrompt(ctxA)).slice(0, 8)} B=${sha(persona.buildSystemPrompt(ctxB)).slice(0, 8)}`);
  const id = { name: "น้องปลา", suffix: "ค่ะ", tone: "friendly", languages: ["th", "en"] };
  const p = persona.buildSystemPrompt({ ...ctxA, secretary: id } as never);
  chk("P-2", "มี secretary ⇒ บรรทัดแรก = คุณคือ \"น้องปลา\" เลขา AI ประจำกิจการ \"QC Sec Café\" …", p.split("\n")[0].startsWith('คุณคือ "น้องปลา" เลขา AI ประจำกิจการ "QC Sec Café"'), p.split("\n")[0].slice(0, 90));
  chk("P-3", "มี secretary ⇒ มีบรรทัดลงท้าย \"ค่ะ\" และไม่มี 'ตอบภาษาไทยเสมอ' เมื่อ languages มี en · ยังมีกติกาเดิม (ask_clarify · propose_plan · remember_fact · support_open_case)", /ลงท้าย[^\n]*"ค่ะ"/.test(p) && !p.includes("ตอบภาษาไทยเสมอ") && /อังกฤษ/.test(p) && ["ask_clarify", "propose_plan", "remember_fact", "support_open_case", ...(ctxA.systems.some((s) => s.type === "ACCOUNT") ? ["งานบัญชีของร้านนี้"] : [])].every((k) => p.includes(k)), "ดู prompt");
  const pTh = persona.buildSystemPrompt({ ...ctxB, secretary: { ...id, languages: ["th"], suffix: "" } } as never);
  chk("P-4", "languages=[th] ⇒ ยังมี 'ตอบภาษาไทยเสมอ' · suffix ว่าง ⇒ ไม่มีบรรทัดลงท้าย · DNA/ความจำ/tweak ยังอยู่ครบใน ctx เต็ม", pTh.includes("ตอบภาษาไทยเสมอ") && !/ลงท้ายประโยค/.test(pTh) && ["- เปิด 9 โมง", "- ลูกค้าประจำชื่อสมชาย", "- ตอบสั้น"].every((k) => p.includes(k)), "ดู prompt");
  const pAcc = persona.buildSystemPrompt({ ...ctxA, secretary: id, access: { pos: "OFF", crm: "READ", member: "DRAFT", chat: "READ" } } as never);
  chk("P-5", "access ใน ctx ⇒ prompt บอกระบบที่ปิด (pos) และดูอย่างเดียว (crm) · chat READ ค่าเริ่มต้นไม่ถูกพูดถึง", /ปิด[^\n]*(POS|ขายหน้าร้าน|pos)/i.test(pAcc) && /ดูได้อย่างเดียว[^\n]*(CRM|crm)/i.test(pAcc) && !/ดูได้อย่างเดียว[^\n]*(chat|แชท)/i.test(pAcc), "ดู prompt", "MAJOR");
}

// ═══════════════ A. secretary.ts ═══════════════
console.log("── A: secretary.ts ──");
const U = { owner: "qcs12-owner", staff: "qcs12-staff", mgr: "qcs12-mgr" };
let tid = "";
const cleanup = async () => {
  if (tid) {
    for (const m of ["aiTrainingSample", "aiLesson", "aiRoom", "aiProposal", "aiMessage", "aiConversation", "aiSystemAccess", "aiUsage", "aiCreditTxn", "aiCreditWallet", "appSystem", "membership"]) {
      try { await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* ไม่มีโมเดล/คอลัมน์ */ }
    }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { if ("aiSecretary" in prisma) await (prisma as AnyMod).aiSecretary.deleteMany({ where: { userId: { startsWith: "qcs12-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs12-" } } }); } catch { /* */ }
};
try {
  await cleanup(); // ของค้างจากรอบก่อน
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.2", slug: `qc-sec-s12-${Date.now().toString(36)}` } });
  tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: k } });
  const mk = (role: "OWNER" | "MANAGER" | "STAFF", userId: string, permissions: Record<string, unknown> = {}) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess: ["*"], permissions: permissions as never, acceptedAt: new Date() } });
  await mk("OWNER", U.owner); await mk("MANAGER", U.mgr); await mk("STAFF", U.staff, { "pos.sale.read": true, "pos.sale.create": true, "kanban.card.create": true, "kanban.card.read": true });
  await sys.createSystem(tid, "POS", "ขายหน้าร้าน"); await sys.createSystem(tid, "KANBAN", "บอร์ดงาน"); await sys.createSystem(tid, "CRM", "ลูกค้า");
  const actor = (userId: string, role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, unknown> = {}) => ({ kind: "member" as const, tenantId: tid, userId, membership: { role, unitAccess: ["*"], permissions } });
  const OWNER = actor(U.owner, "OWNER"), MGR = actor(U.mgr, "MANAGER"), STAFF = actor(U.staff, "STAFF", { "pos.sale.read": true, "pos.sale.create": true, "kanban.card.create": true, "kanban.card.read": true });

  if (!sec || !hasTables) { for (const i of [1, 2, 3, 4, 5, 6]) skip(`A-${i}`, "secretary.ts", sec ? "ไม่มีตาราง AiSecretary (S1.1 ยังไม่ merge)" : "ไม่มีไฟล์/import ไม่ได้"); }
  else {
    const s1 = await sec.ensureSecretary(U.owner);
    chk("A-1", "ensureSecretary สร้างค่าเริ่มต้น Shark/ครับ/polite/[th]", s1?.name === "Shark" && s1?.suffix === "ครับ" && s1?.tone === "polite" && JSON.stringify(s1?.languages) === '["th"]', JSON.stringify(s1).slice(0, 160));
    const s2 = await sec.ensureSecretary(U.owner);
    chk("A-2", "ensureSecretary ซ้ำ = แถวเดิม (idempotent) · secretaryOf คืนแถว · secretaryOf ผู้ใช้ไม่มีแถว = null", s2?.id === s1?.id && (await sec.secretaryOf(U.owner))?.id === s1?.id && (await sec.secretaryOf(U.staff)) === null && (await prisma.aiSecretary.count({ where: { userId: U.staff } })) === 0, "ดู id/null");
    const u = await sec.updateSecretary(U.owner, { name: "  น้องปลา ", suffix: "ค่ะ", tone: "friendly", languages: ["th", "en", "th"] });
    chk("A-3", "updateSecretary: trim ชื่อ · ตัดภาษาซ้ำ · บันทึกจริง", u?.name === "น้องปลา" && u?.suffix === "ค่ะ" && u?.tone === "friendly" && JSON.stringify(u?.languages) === '["th","en"]' && (await prisma.aiSecretary.findUnique({ where: { userId: U.owner } }))?.name === "น้องปลา", JSON.stringify(u).slice(0, 160));
    const bad = [
      ["ชื่อว่าง", await throws(() => sec.updateSecretary(U.owner, { name: "   " }))],
      ["ชื่อ 31 ตัว", await throws(() => sec.updateSecretary(U.owner, { name: "ก".repeat(31) }))],
      ["ชื่อมีบรรทัดใหม่", await throws(() => sec.updateSecretary(U.owner, { name: "a\nb" }))],
      ["tone ผิด", await throws(() => sec.updateSecretary(U.owner, { tone: "angry" }))],
      ["languages ว่าง", await throws(() => sec.updateSecretary(U.owner, { languages: [] }))],
      ["languages ไม่รู้จัก", await throws(() => sec.updateSecretary(U.owner, { languages: ["th", "xx"] }))],
      ["suffix 11 ตัว", await throws(() => sec.updateSecretary(U.owner, { suffix: "ค".repeat(11) }))],
    ] as const;
    const notThrown = bad.filter(([, e]) => e === null).map(([n]) => n);
    const notThai = bad.filter(([, e]) => e !== null && !/[฀-๿]/.test(e)).map(([n]) => n);
    chk("A-4", "updateSecretary ปฏิเสธค่าผิด 7 แบบ ด้วยข้อความไทย", notThrown.length === 0 && notThai.length === 0, `ไม่โยน: ${notThrown.join(",")} · ไม่ไทย: ${notThai.join(",")}`);
    const after = await prisma.aiSecretary.findUnique({ where: { userId: U.owner } });
    chk("A-5", "ค่าผิดไม่ถูกเขียนลงฐาน (ยังเป็น น้องปลา/ค่ะ/friendly)", after?.name === "น้องปลา" && after?.suffix === "ค่ะ" && after?.tone === "friendly", JSON.stringify(after).slice(0, 120));
    const sp = sec.sampleSpeech({ name: "น้องปลา", suffix: "ค่ะ", tone: "polite", languages: ["th"] });
    const sp2 = sec.sampleSpeech({ name: "น้องปลา", suffix: "ค่ะ", tone: "brief", languages: ["th"] });
    const blk = sec.secretaryPromptBlock({ name: "น้องปลา", suffix: "ค่ะ", tone: "polite", languages: ["th"] });
    chk("A-6", "sampleSpeech มีชื่อ+ลงท้าย · ต่างกันตาม tone · secretaryPromptBlock มีชื่อ+ลงท้าย (pure)", typeof sp === "string" && sp.includes("น้องปลา") && sp.includes("ค่ะ") && sp !== sp2 && typeof blk === "string" && blk.includes("น้องปลา") && blk.includes("ค่ะ"), `sp=${String(sp).slice(0, 60)}`);
  }

  // ═══════════════ B. access.ts ═══════════════
  console.log("── B: access.ts ──");
  if (!acc || !hasTables) { for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) skip(`B-${i}`, "access.ts", acc ? "ไม่มีตาราง AiSystemAccess" : "ไม่มีไฟล์/import ไม่ได้"); }
  else {
    const mods = new Set<string>([...(acc.AI_MODULES as string[]), ...(acc.ALWAYS_ON as string[])]);
    const seen = new Set<string>();
    for (const r of Object.values(toolAccess.HAND_TOOL_ACCESS as unknown as Record<string, { needs: readonly { module: string }[] }>)) for (const n of r.needs) seen.add(n.module);
    for (const k of Object.keys(toolAccess.HAND_ACTION_KIND)) { const q = proposals.kindAccessOf((toolAccess.HAND_ACTION_KIND as Record<string, string>)[k]); if (q) seen.add(q.module); }
    for (const t of tools.toolRegistry()) { const m = acc.toolModuleOf(t.def.name); if (m) seen.add(m); }
    const unknown = [...seen].filter((m) => !mods.has(m));
    chk("B-0", "AI_MODULES ∪ ALWAYS_ON ครอบทุก module ที่ด่านเครื่องมือ/kind รู้จัก", unknown.length === 0, `ไม่อยู่ในรายการ: ${unknown.join(", ")}`);
    const a0 = await acc.getAccess(tid);
    chk("B-1", "getAccess ร้านใหม่: ทุกโมดูล DRAFT ยกเว้น chat READ · ครบทุก AI_MODULES", (acc.AI_MODULES as string[]).every((m) => a0[m] === (m === "chat" ? "READ" : "DRAFT")) && Object.keys(a0).length === (acc.AI_MODULES as string[]).length, JSON.stringify(a0).slice(0, 160));
    const e1 = await throws(() => acc.setAccess(tid, { userId: U.mgr, membership: MGR.membership }, "pos", "OFF"));
    const e2 = await throws(() => acc.setAccess(tid, { userId: U.staff, membership: STAFF.membership }, "pos", "OFF"));
    let fe = false; try { await acc.setAccess(tid, { userId: U.mgr, membership: MGR.membership }, "pos", "OFF"); } catch (e) { fe = e instanceof ForbiddenError; }
    chk("B-2", "setAccess: MANAGER/STAFF ⇒ ForbiddenError · ไม่เขียน", e1 !== null && e2 !== null && fe && (await prisma.aiSystemAccess.count({ where: { tenantId: tid } })) === 0, `mgr=${e1} staff=${e2} forbidden=${fe}`);
    const e3 = await throws(() => acc.setAccess(tid, { userId: U.owner, membership: OWNER.membership }, "pos", "AUTO"));
    const e4 = await throws(() => acc.setAccess(tid, { userId: U.owner, membership: OWNER.membership }, "nosuch", "OFF"));
    const e5 = await throws(() => acc.setAccess(tid, { userId: U.owner, membership: OWNER.membership }, "pos", "MAYBE"));
    chk("B-3", "setAccess: AUTO ⇒ ปฏิเสธ (ข้อความมี 'รุ่นแรก') · module ไม่รู้จัก ⇒ ปฏิเสธ · level ไม่รู้จัก ⇒ ปฏิเสธ · ไม่เขียน", e3 !== null && /รุ่นแรก/.test(e3) && e4 !== null && e5 !== null && (await prisma.aiSystemAccess.count({ where: { tenantId: tid } })) === 0, `auto=${e3} mod=${e4} lvl=${e5}`);
    const a1 = await acc.setAccess(tid, { userId: U.owner, membership: OWNER.membership }, "pos", "OFF");
    await acc.setAccess(tid, { userId: U.owner, membership: OWNER.membership }, "kanban", "READ");
    const a2 = await acc.setAccess(tid, { userId: U.owner, membership: OWNER.membership }, "crm", "DRAFT");
    const row = await prisma.aiSystemAccess.findUnique({ where: { tenantId_module: { tenantId: tid, module: "pos" } } }).catch(() => null);
    chk("B-4", "setAccess OWNER: pos OFF · kanban READ · crm DRAFT บันทึก (setById = owner) · คืน map ครบ · ตั้งซ้ำไม่เพิ่มแถว", a1.pos === "OFF" && a2.pos === "OFF" && a2.kanban === "READ" && a2.crm === "DRAFT" && row?.setById === U.owner && (await prisma.aiSystemAccess.count({ where: { tenantId: tid } })) === 3, JSON.stringify({ a2, row }).slice(0, 200));
    const tm = (n: string) => acc.toolModuleOf(n);
    chk("B-5", "toolModuleOf: sales_summary/pos_create_sale→pos · kanban_create_card→kanban · crm tool→crm · ask_clarify/list_systems/propose_plan→null", tm("sales_summary") === "pos" && tm("pos_create_sale") === "pos" && tm("kanban_create_card") === "kanban" && tm("ask_clarify") === null && tm("list_systems") === null && tm("propose_plan") === null && tools.toolRegistry().filter((t) => tm(t.def.name) === "crm").length > 0, `${tm("sales_summary")} ${tm("pos_create_sale")} ${tm("kanban_create_card")} ${tm("ask_clarify")} ${tm("propose_plan")}`);
    const w = (n: string) => acc.toolIsWrite(n);
    chk("B-6", "toolIsWrite: sales_summary=false · pos_create_sale=true · void_sale=true · kanban_create_card=true · list_systems=false", w("sales_summary") === false && w("pos_create_sale") === true && w("void_sale") === true && w("kanban_create_card") === true && w("list_systems") === false, `${w("sales_summary")} ${w("pos_create_sale")} ${w("void_sale")} ${w("kanban_create_card")}`);
    const A = { ...a2 } as Record<string, string>;
    const v1 = acc.accessVerdict(A, "sales_summary"), v2 = acc.accessVerdict(A, "kanban_create_card"), v4 = acc.accessVerdict(A, "ask_clarify"), v5 = acc.accessVerdict({ ...A, pos: "DRAFT" }, "sales_summary");
    const kanbanRead = tools.toolRegistry().map((t) => t.def.name).find((n) => tm(n) === "kanban" && !w(n));
    const v3b = kanbanRead ? acc.accessVerdict(A, kanbanRead) : { ok: true };
    chk("B-7", "accessVerdict: pos OFF ⇒ sales_summary ปฏิเสธ (ไทย) · kanban READ ⇒ kanban_create_card ปฏิเสธ แต่ tool อ่านของ kanban ผ่าน · แกนกลางผ่าน · DRAFT ผ่าน · kindAllowedByAccess(kanban_create_card) ปฏิเสธ / crm kind ผ่าน", !v1.ok && /[฀-๿]/.test(v1.reason ?? "") && !v2.ok && v3b.ok && v4.ok && v5.ok && !acc.kindAllowedByAccess(A, "kanban_create_card").ok && acc.kindAllowedByAccess(A, "crm_create_lead").ok, JSON.stringify({ v1, v2, v3b, v4, v5 }).slice(0, 240));
  }

  // ═══════════════ R. ด่านจริง ═══════════════
  console.log("── R: ด่านจริง (toolsOfferedTo · runTool · sendMessage · executeProposal) ──");
  if (!acc || !sec || !hasTables) { for (const i of [1, 2, 3, 4, 5, 6]) skip(`R-${i}`, "ด่านจริง", "ไม่มี access.ts/secretary.ts หรือตาราง"); }
  else {
    const A = await acc.getAccess(tid); // pos OFF · kanban READ · crm DRAFT · chat READ
    const names = tools.toolRegistry().map((t) => t.def.name);
    const base = toolAccess.toolsOfferedTo(OWNER, names);
    const gated = toolAccess.toolsOfferedTo(OWNER, names, A);
    chk("R-1", "toolsOfferedTo ไม่ส่ง access = เดิม (มี sales_summary, pos_create_sale, kanban_create_card) · ส่ง access ⇒ ไม่มี tool ของ pos เลย · ไม่มี kanban_create_card · ยังมี tool อ่านของ kanban + crm + แกนกลาง", ["sales_summary", "pos_create_sale", "kanban_create_card"].every((n) => base.includes(n)) && !gated.some((n) => acc.toolModuleOf(n) === "pos") && !gated.includes("kanban_create_card") && gated.includes("ask_clarify") && gated.includes("list_systems") && gated.some((n) => acc.toolModuleOf(n) === "kanban") && gated.some((n) => acc.toolModuleOf(n) === "crm"), `base=${base.length} gated=${gated.length} pos=${gated.filter((n) => acc.toolModuleOf(n) === "pos").length}`);
    const vd = toolAccess.toolVerdict(OWNER, "sales_summary", { access: A });
    const vs = toolAccess.toolVerdict(STAFF, "pos_create_sale", { access: { ...A, pos: "DRAFT" } });
    const vs2 = toolAccess.toolVerdict(actor(U.staff, "STAFF", {}), "sales_summary", { access: { ...A, pos: "DRAFT" } });
    chk("R-2", "toolVerdict: membership ∩ ระดับ — OWNER+pos OFF ปฏิเสธ · STAFF มีคีย์+DRAFT ผ่าน · STAFF ไม่มีคีย์+DRAFT ปฏิเสธด้วยเหตุผลสิทธิ์ (ไม่ใช่เหตุผลระดับ)", !vd.ok && vs.ok && !vs2.ok && !/ปิดไม่ให้|อย่างเดียว/.test(vs2.reason ?? ""), JSON.stringify({ vd, vs, vs2 }).slice(0, 200));
    const r1 = await tools.runTool({ tenantId: tid, actor: OWNER, access: A } as never, "sales_summary", {});
    const r2 = await tools.runTool({ tenantId: tid, actor: OWNER } as never, "sales_summary", {});
    chk("R-3", "runTool: ctx.access pos OFF ⇒ {error} ไทย · ไม่ส่ง access ⇒ ทำงานตามเดิม (ไม่มี error สิทธิ์)", /"error"/.test(r1) && /[฀-๿]/.test(r1) && !/ปิดไม่ให้|อย่างเดียว/.test(r2), `r1=${r1.slice(0, 80)} r2=${r2.slice(0, 80)}`);
    // sendMessage: secretary identity + access ในระบบ prompt และชุดเครื่องมือที่ยื่น
    await sec.updateSecretary(U.owner, { name: "น้องปลา", suffix: "ค่ะ", tone: "polite", languages: ["th"] });
    const p1 = new Scripted([{ text: "โอเค" }]);
    const res1 = await service.sendMessage({ tenantId: tid, actor: OWNER }, { text: "สรุปยอดขายเมื่อวาน" }, { provider: p1 });
    const sys1 = p1.captured[0]?.messages.find((m) => m.role === "system")?.content ?? "";
    const offered1 = (p1.captured[0]?.tools ?? []).map((t) => t.name);
    chk("R-4", "sendMessage (OWNER มี AiSecretary): system prompt มี 'น้องปลา' + ลงท้าย 'ค่ะ' + บอก pos ปิด · เครื่องมือที่ยื่นไม่มีของ pos", res1.ok === true && sys1.includes('"น้องปลา"') && /ลงท้าย[^\n]*"ค่ะ"/.test(sys1) && /ปิด/.test(sys1) && !offered1.some((n) => acc.toolModuleOf(n) === "pos"), `ok=${String(res1.ok)} name=${sys1.includes("น้องปลา")} tools=${offered1.slice(0, 8).join(",")}`);
    const p2 = new Scripted([{ text: "โอเค" }]);
    const res2 = await service.sendMessage({ tenantId: tid, actor: STAFF }, { text: "สวัสดี" }, { provider: p2 });
    const sys2 = p2.captured[0]?.messages.find((m) => m.role === "system")?.content ?? "";
    chk("R-5", "sendMessage (STAFF ไม่มี AiSecretary): prompt ขึ้นต้น 'คุณคือผู้ช่วย AI ประจำกิจการ' แบบเดิม · ไม่มีชื่อเลขา · ไม่มีการสร้างแถว AiSecretary ให้ staff", res2.ok === true && sys2.startsWith("คุณคือผู้ช่วย AI ประจำกิจการ") && !sys2.includes("น้องปลา") && (await prisma.aiSecretary.count({ where: { userId: U.staff } })) === 0, `ok=${String(res2.ok)} head=${sys2.slice(0, 60)}`);
    // executeProposal: kanban READ ⇒ kind kanban_create_card ถูกปฏิเสธ คง PENDING · crm DRAFT ⇒ ไม่ติดด่านระดับ
    const conv = await prisma.aiConversation.create({ data: { id: `u~${U.owner}~qcs12-${Date.now().toString(36)}`, tenantId: tid, title: "qc" } });
    const prop = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: conv.id, kind: "kanban_create_card", summary: "qc", payload: { title: "x" }, expiresAt: new Date(Date.now() + 3_600_000) } });
    const ex = await proposals.executeProposal(OWNER.membership as never, { tenantId: tid } as never, prop.id, { userId: U.owner });
    const st = await prisma.aiProposal.findUnique({ where: { id: prop.id } });
    const prop2 = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: conv.id, kind: "crm_create_lead", summary: "qc", payload: {}, expiresAt: new Date(Date.now() + 3_600_000) } });
    const ex2 = await proposals.executeProposal(OWNER.membership as never, { tenantId: tid } as never, prop2.id, { userId: U.owner });
    chk("R-6", "executeProposal: kanban READ ⇒ ok:false เหตุผลระดับ (ไทย) · คง PENDING · crm DRAFT ⇒ ไม่ใช่เหตุผลระดับ", ex.ok === false && /อย่างเดียว|ปิด/.test(ex.note) && st?.status === "PENDING" && !/อย่างเดียว|ปิดไม่ให้/.test(ex2.note), `ex=${JSON.stringify(ex).slice(0, 120)} st=${st?.status} ex2=${ex2.note.slice(0, 80)}`);
  }
} finally {
  await cleanup();
}

// ═══════════════ D. fitness ═══════════════
console.log("── D: fitness ──");
{
  const f1 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-1", "pnpm fitness (มี env) exit 0", f1.status === 0, (f1.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  const env2 = { ...process.env }; delete env2.DATABASE_URL; delete env2.DIRECT_URL;
  const f2 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: env2, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-2", "pnpm fitness (ไม่มี env) exit 0", f2.status === 0, (f2.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  const ta = rd(join(ROOT, "src/lib/ai/tool-access.ts"));
  chk("D-3", "tool-access.ts ยัง pure (ไม่ import prisma/core/db)", !/@\/lib\/core\/db|from "@prisma/.test(ta), "พบ import ฐานข้อมูล", "MAJOR");
}
await prisma.$disconnect();
const passed = cks.filter((c) => c.res === "PASS").length;
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
