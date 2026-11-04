// QC — SECRETARY S1.7 + S1.8 · กฎอนุมัติ/ผู้อนุมัติ/ทำไมต้องอนุมัติ · บันทึกการกระทำ + ย้อนกลับ 24 ชม. · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.7.md · RESOLUTIONS R-K3 R-K3b R-K4 R-S1.8a §B.3 §B.5 · ต้องการ S1.1 ตาราง + S1.4 rooms.ts
//
// กลุ่มข้อ:
//   C  kind-class pure: classOfKind (destructive/money/customerFacing/fail-closed) · whyApproval ไทยไม่ว่างทุก kind · ALWAYS_APPROVE · RULE_KEYS
//   R  rules: default 3 enabled + limit 500000 · setRule OWNER เท่านั้น · key/limit ผิด throw · บันทึกจริง
//   G  approvalGate ใน executeProposal: ห้อง AiRoom — STAFF ถูกปฏิเสธ (คง PENDING) · MANAGER ผ่าน · ห้องเดิม — STAFF ผ่านเหมือนเดิม
//   L  AiActionLog: execute kanban_create_card ⇒ แถว log (room/user/approver/module/entity/undoableUntil 24h · payload ไม่มีข้อความ) · plan ⇒ log (planId) · listLog สิทธิ์
//   U  undoAction: archive card · undoneAt/undoneById · แถว undo:<kind> · ซ้ำ/เกิน 24 ชม./kind ไม่ undoable/ไม่มีสิทธิ์/มองไม่เห็น ⇒ ปฏิเสธไทย
//   D  fitness ×2
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.7.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.7";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const ACT_FILE = join(ROOT, "src/lib/ai/secretary/actions.ts");
if (!FORCED && !existsSync(ACT_FILE)) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/lib/ai/secretary/actions.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
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
const proposals = await import("@/lib/ai/proposals");
const plans = await import("@/lib/ai/plans");
const sys = await import("@/lib/modules/system/service");
const kanbanSvc = await import("@/lib/modules/kanban/service");
const { ForbiddenError } = await import("@/lib/core/rbac");
const rooms = (await import("@/lib/ai/secretary/rooms").catch(() => null)) as AnyMod | null;
const kc = (await import("@/lib/ai/secretary/kind-class").catch(() => null)) as AnyMod | null;
const gate = (await import("@/lib/ai/secretary/approval-gate").catch(() => null)) as AnyMod | null;
const act = existsSync(ACT_FILE) ? ((await import("@/lib/ai/secretary/actions").catch((e) => { console.log("  ⚠️ import actions.ts: " + errMsg(e)); return null; })) as AnyMod | null) : null;
const hasTables = "aiActionLog" in prisma && "aiApprovalRule" in prisma && "aiRoom" in prisma;

console.log("── C: kind-class ──");
if (!kc) { for (const i of [1, 2, 3, 4]) skip(`C-${i}`, "kind-class", "ไม่มี kind-class.ts"); }
else {
  const c = (k: string) => kc.classOfKind(k);
  chk("C-1", "classOfKind: void_sale destructive+money · kanban.cards.archive destructive · record_expense money · crm_create_lead ไม่มีชั้นใด · kanban_create_card ไม่มีชั้นใด (known)", c("void_sale").destructive && c("void_sale").money && c("kanban.cards.archive").destructive && c("record_expense").money && !c("crm_create_lead").destructive && !c("crm_create_lead").money && !c("crm_create_lead").customerFacing && c("kanban_create_card").known && !c("kanban_create_card").money, JSON.stringify({ v: c("void_sale"), k: c("kanban.cards.archive"), e: c("record_expense"), l: c("crm_create_lead") }).slice(0, 240));
  chk("C-2", "ไม่รู้จัก kind ⇒ fail-closed (known=false · money · customerFacing) · marketing_create_campaign customerFacing", c("nosuch_kind").known === false && c("nosuch_kind").money && c("nosuch_kind").customerFacing && c("marketing_create_campaign").customerFacing, JSON.stringify({ n: c("nosuch_kind"), m: c("marketing_create_campaign") }).slice(0, 200));
  chk("C-3", "ALWAYS_APPROVE = destructive/money/piiExport · RULE_KEYS = chat.send/money.limit/pii.export", JSON.stringify(kc.ALWAYS_APPROVE) === '["destructive","money","piiExport"]' && JSON.stringify(kc.RULE_KEYS) === '["chat.send","money.limit","pii.export"]', `${JSON.stringify(kc.ALWAYS_APPROVE)} ${JSON.stringify(kc.RULE_KEYS)}`);
  const rules = gate?.DEFAULT_RULES ?? { "chat.send": { enabled: true, limitSatang: null }, "money.limit": { enabled: true, limitSatang: 500000 }, "pii.export": { enabled: true, limitSatang: null } };
  const kinds = ["void_sale", "record_expense", "kanban_create_card", "crm_create_lead", "marketing_create_campaign", "open_system", "nosuch_kind", "account.documents.create"];
  const bad = kinds.filter((k) => !thai(kc.whyApproval(k, {}, rules)));
  const big = kc.whyApproval("record_expense", { amountSatang: 900000 }, rules), small = kc.whyApproval("record_expense", { amountSatang: 1000 }, rules);
  chk("C-4", "whyApproval ไทยไม่ว่างทุก kind · void_sale มี '2 ชั้น' · record_expense 9,000 บาท มี 'วงเงิน' · 10 บาท ไม่มี 'วงเงิน'", bad.length === 0 && /2 ชั้น|สองชั้น/.test(kc.whyApproval("void_sale", {}, rules)) && /วงเงิน/.test(big) && !/วงเงิน/.test(small), `ว่าง: ${bad.join(",")} big=${big.slice(0, 60)} small=${small.slice(0, 60)}`);
}

const U = { owner: "qcs17-owner", mgr: "qcs17-mgr", staff: "qcs17-staff", staff2: "qcs17-staff2" };
let tid = "";
const cleanup = async () => {
  if (tid) {
    for (const m of ["aiActionLog", "aiApprovalRule", "aiRoomMember", "aiRoomJob", "aiRoom", "aiProposal", "aiPlan", "aiMessage", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "kanbanCard", "kanbanColumn", "kanbanBoard", "appSystem", "membership"]) { try { await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s17-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs17-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.7", slug: `qc-sec-s17-${Date.now().toString(36)}` } });
  tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `ผู้ใช้ ${k}` } });
  const kperm = { "kanban.card.create": true, "kanban.card.read": true, "kanban.card.archive": true, "ai.chat.send": true };
  const mk = (role: "OWNER" | "MANAGER" | "STAFF", userId: string, permissions: Record<string, unknown> = {}) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess: ["*"], permissions: permissions as never, acceptedAt: new Date() } });
  await mk("OWNER", U.owner); await mk("MANAGER", U.mgr); await mk("STAFF", U.staff, kperm); await mk("STAFF", U.staff2, { "ai.chat.send": true });
  const M = (role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, unknown> = {}) => ({ role, unitAccess: ["*"], permissions });
  const actor = (userId: string, role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, unknown> = {}) => ({ kind: "member" as const, tenantId: tid, userId, membership: M(role, permissions) });
  const OWNER = actor(U.owner, "OWNER"), MGR = actor(U.mgr, "MANAGER"), STAFF = actor(U.staff, "STAFF", kperm), STAFF2 = actor(U.staff2, "STAFF", { "ai.chat.send": true });
  const ctxOf = (a: ReturnType<typeof actor>) => ({ tenantId: tid, actor: a });
  const kb = await sys.createSystem(tid, "KANBAN", "บอร์ดงาน");
  const board = await kanbanSvc.createBoard({ tenantId: tid, systemId: kb.id, name: "บอร์ด QC", visibility: "TENANT" as never });
  const ctxT = { tenantId: tid };
  const mkProp = (convId: string, kind: string, payload: Record<string, unknown>, risk = "NORMAL") => prisma.aiProposal.create({ data: { tenantId: tid, conversationId: convId, kind, summary: `qc ${kind}`, payload: payload as never, risk, expiresAt: new Date(Date.now() + 3_600_000) } });

  console.log("── R: rules ──");
  if (!gate || !hasTables) { for (const i of [1, 2, 3]) skip(`R-${i}`, "rules", gate ? "ไม่มีตาราง" : "ไม่มี approval-gate.ts"); }
  else {
    const r0 = await gate.listRules(tid);
    chk("R-1", "listRules ร้านใหม่: 3 กฎ enabled · money.limit 500000 · ไม่เขียนแถว", r0["chat.send"]?.enabled === true && r0["money.limit"]?.enabled === true && r0["money.limit"]?.limitSatang === 500000 && r0["pii.export"]?.enabled === true && (await prisma.aiApprovalRule.count({ where: { tenantId: tid } })) === 0, JSON.stringify(r0).slice(0, 200));
    let fe = false; try { await gate.setRule(tid, { userId: U.mgr, membership: M("MANAGER") }, "chat.send", { enabled: false }); } catch (e) { fe = e instanceof ForbiddenError; }
    const eK = await throws(() => gate.setRule(tid, { userId: U.owner, membership: M("OWNER") }, "nosuch", { enabled: false }));
    const eL = await throws(() => gate.setRule(tid, { userId: U.owner, membership: M("OWNER") }, "money.limit", { limitSatang: -5 }));
    const eL2 = await throws(() => gate.setRule(tid, { userId: U.owner, membership: M("OWNER") }, "money.limit", { limitSatang: 1.5 }));
    chk("R-2", "setRule: MANAGER ⇒ ForbiddenError · key ไม่รู้จัก/limit ติดลบ/ทศนิยม ⇒ throw ไทย · ยังไม่เขียน", fe && thai(eK) && thai(eL) && thai(eL2) && (await prisma.aiApprovalRule.count({ where: { tenantId: tid } })) === 0, `fe=${fe} k=${eK} l=${eL} l2=${eL2}`);
    const r1 = await gate.setRule(tid, { userId: U.owner, membership: M("OWNER") }, "chat.send", { enabled: false });
    const r2 = await gate.setRule(tid, { userId: U.owner, membership: M("OWNER") }, "money.limit", { limitSatang: 100000 });
    const rows = await prisma.aiApprovalRule.findMany({ where: { tenantId: tid } });
    chk("R-3", "setRule OWNER: chat.send ปิด · money.limit 100000 · บันทึก 2 แถว setById=owner · listRules สะท้อน", r1["chat.send"].enabled === false && r2["money.limit"].limitSatang === 100000 && r2["chat.send"].enabled === false && rows.length === 2 && rows.every((r) => r.setById === U.owner) && (await gate.listRules(tid))["money.limit"].limitSatang === 100000, JSON.stringify({ r2, rows }).slice(0, 240));
    await gate.setRule(tid, { userId: U.owner, membership: M("OWNER") }, "chat.send", { enabled: true });
  }

  console.log("── G: approvalGate ใน executeProposal ──");
  if (!gate || !rooms || !hasTables) { for (const i of [1, 2, 3]) skip(`G-${i}`, "gate", "ไม่มี approval-gate.ts/rooms.ts/ตาราง"); }
  else {
    const rS = await rooms.startRoom(ctxOf(STAFF), { instruction: "สร้างการ์ด" });
    const pStaff = await mkProp(rS.conversationId, "kanban_create_card", { title: "การ์ดจากห้องเลขา" });
    const exS = await proposals.executeProposal(M("STAFF", kperm) as never, ctxT as never, pStaff.id, { userId: U.staff });
    const st1 = await prisma.aiProposal.findUnique({ where: { id: pStaff.id } });
    chk("G-1", "ห้อง AiRoom: STAFF (มีคีย์) กดอนุมัติ ⇒ ok:false note มี 'เจ้าของ' หรือ 'ผู้จัดการ' · คง PENDING · ไม่สร้างการ์ด", exS.ok === false && /เจ้าของ|ผู้จัดการ/.test(exS.note) && st1?.status === "PENDING" && (await prisma.kanbanCard.count({ where: { tenantId: tid, title: "การ์ดจากห้องเลขา" } })) === 0, `${JSON.stringify(exS)} st=${st1?.status}`);
    const exM = await proposals.executeProposal(M("MANAGER") as never, ctxT as never, pStaff.id, { userId: U.mgr });
    const card1 = await prisma.kanbanCard.findFirst({ where: { tenantId: tid, title: "การ์ดจากห้องเลขา" } });
    chk("G-2", "ห้อง AiRoom: MANAGER กด ⇒ ok · การ์ดถูกสร้าง · EXECUTED", exM.ok === true && !!card1 && (await prisma.aiProposal.findUnique({ where: { id: pStaff.id } }))?.status === "EXECUTED", JSON.stringify(exM).slice(0, 160));
    const legacyConv = await prisma.aiConversation.create({ data: { id: `u~${U.staff}~qcs17-${Date.now().toString(36)}`, tenantId: tid, title: "ห้องเดิม" } });
    const pLegacy = await mkProp(legacyConv.id, "kanban_create_card", { title: "การ์ดจากห้องเดิม" });
    const exL = await proposals.executeProposal(M("STAFF", kperm) as never, ctxT as never, pLegacy.id, { userId: U.staff });
    chk("G-3", "ห้องเดิม (ไม่มี AiRoom): STAFF มีคีย์กด ⇒ ok เหมือนเดิม (baseline qc-ai-proposals)", exL.ok === true && (await prisma.kanbanCard.count({ where: { tenantId: tid, title: "การ์ดจากห้องเดิม" } })) === 1, JSON.stringify(exL).slice(0, 160));

    console.log("── L: AiActionLog ──");
    if (!act) { for (const i of [1, 2, 3, 4]) skip(`L-${i}`, "actions", "ไม่มี actions.ts"); for (const i of [1, 2, 3, 4, 5]) skip(`U-${i}`, "undo", "ไม่มี actions.ts"); }
    else {
      const room = await prisma.aiRoom.findUnique({ where: { conversationId: rS.conversationId } });
      const logs = await prisma.aiActionLog.findMany({ where: { tenantId: tid }, orderBy: { createdAt: "asc" } });
      const l1 = logs.find((l) => l.proposalId === pStaff.id), l2 = logs.find((l) => l.proposalId === pLegacy.id);
      const exec1 = (await prisma.aiProposal.findUnique({ where: { id: pStaff.id } }))?.executedAt;
      chk("L-1", "log ของข้อเสนอห้องเลขา: roomId=ห้อง · userId=staff (ผู้สั่ง) · approverId=mgr · module kanban · kind · entityType kanban.card entityId=การ์ด · undoableUntil = executedAt+24h", !!l1 && l1.roomId === room?.id && l1.userId === U.staff && l1.approverId === U.mgr && l1.module === "kanban" && l1.kind === "kanban_create_card" && l1.entityType === "kanban.card" && l1.entityId === card1?.id && !!l1.undoableUntil && !!exec1 && Math.abs(l1.undoableUntil.getTime() - (exec1.getTime() + 86_400_000)) < 60_000, JSON.stringify(l1).slice(0, 260));
      chk("L-2", "log ของห้องเดิม: roomId null · userId=staff · approverId=staff · payload มีแต่ id (ไม่มี 'การ์ดจาก')", !!l2 && l2.roomId === null && l2.userId === U.staff && l2.approverId === U.staff && !JSON.stringify(l2.payload).includes("การ์ดจาก") && !JSON.stringify(l1?.payload ?? {}).includes("การ์ดจาก"), JSON.stringify(l2).slice(0, 200));
      // แผน
      const plan = await prisma.aiPlan.create({ data: { tenantId: tid, conversationId: rS.conversationId, title: "แผน qc", stepsJson: [{ kind: "kanban_create_card", summary: "การ์ดจากแผน", payload: { title: "การ์ดจากแผน" }, status: "PENDING" }] as never, expiresAt: new Date(Date.now() + 3_600_000) } });
      const pr = await plans.executePlan(M("OWNER") as never, ctxT as never, plan.id, { userId: U.owner });
      const lp = await prisma.aiActionLog.findFirst({ where: { tenantId: tid, proposalId: null, kind: "kanban_create_card" } });
      chk("L-3", "แผน (executePlan OWNER): รัน 1 ขั้นสำเร็จ · log แถว (proposalId null · payload.planId · approverId=owner · userId=staff ผู้สร้างห้อง · entity)", pr.ok === true && pr.doneCount === 1 && !!lp && JSON.stringify(lp.payload).includes(plan.id) && lp.approverId === U.owner && lp.userId === U.staff && !!lp.entityId, `${JSON.stringify(pr).slice(0, 120)} lp=${JSON.stringify(lp).slice(0, 200)}`, "MAJOR");
      const lo = await act.listLog(ctxOf(OWNER), { take: 50 }), ls = await act.listLog(ctxOf(STAFF), { take: 50 }), ls2 = await act.listLog(ctxOf(STAFF2), { take: 50 }), lm = await act.listLog(ctxOf(OWNER), { module: "kanban", take: 50 }), lx = await act.listLog(ctxOf(OWNER), { module: "pos", take: 50 });
      chk("L-4", "listLog: OWNER เห็นทุกแถว (≥3) · staff เห็นแถวของห้องตัวเอง+ของตัวเอง (≥2) · staff2 ไม่เห็น (0) · module=kanban = ทั้งหมด · module=pos ว่าง · เรียงใหม่→เก่า", lo.length >= 3 && ls.length >= 2 && ls2.length === 0 && lm.length === lo.length && lx.length === 0 && lo.every((r: AnyMod, i: number) => i === 0 || lo[i - 1].createdAt >= r.createdAt), `o=${lo.length} s=${ls.length} s2=${ls2.length} m=${lm.length} x=${lx.length}`);

      console.log("── U: undoAction ──");
      const u0 = await act.undoAction(ctxOf(STAFF2), l1!.id);
      const uN = await act.undoAction(ctxOf(STAFF), "nosuch");
      chk("U-1", "staff2 (ไม่ใช่สมาชิกห้อง) ⇒ ไม่พบรายการ · id ไม่มี ⇒ ไม่พบ", u0.ok === false && /ไม่พบ/.test(u0.note) && uN.ok === false && /ไม่พบ/.test(uN.note), JSON.stringify({ u0, uN }).slice(0, 160));
      const uK = await act.undoAction(ctxOf(actor(U.staff2, "STAFF", { "ai.chat.send": true })), l2!.id); // ห้องเดิมของ staff · staff2 มองไม่เห็น
      const uP = await act.undoAction({ tenantId: tid, actor: actor(U.staff, "STAFF", { "ai.chat.send": true }) }, l2!.id); // ผู้สร้าง แต่ไม่มีคีย์ kanban
      chk("U-2", "ห้องเดิมของ staff: staff2 ⇒ ไม่พบ · staff ไม่มีคีย์ kanban ⇒ ปฏิเสธด้วยเหตุผลสิทธิ์ (ไทย) · การ์ดยังอยู่", uK.ok === false && uP.ok === false && thai(uP.note) && !/ไม่พบ/.test(uP.note) && (await prisma.kanbanCard.findFirst({ where: { tenantId: tid, title: "การ์ดจากห้องเดิม" } }))?.archivedAt === null, JSON.stringify({ uK, uP }).slice(0, 200));
      const u1 = await act.undoAction(ctxOf(MGR), l1!.id);
      const cardAfter = await prisma.kanbanCard.findUnique({ where: { id: card1!.id } });
      const l1After = await prisma.aiActionLog.findUnique({ where: { id: l1!.id } });
      const undoRow = await prisma.aiActionLog.findFirst({ where: { tenantId: tid, kind: `undo:kanban_create_card`, proposalId: pStaff.id } });
      chk("U-3", "MANAGER ย้อน ⇒ ok · การ์ดถูกเก็บ (archivedAt) · undoneAt/undoneById=mgr · แถว undo:kanban_create_card (undoableUntil null)", u1.ok === true && !!cardAfter?.archivedAt && !!l1After?.undoneAt && l1After?.undoneById === U.mgr && !!undoRow && undoRow.undoableUntil === null, `${JSON.stringify(u1)} archived=${!!cardAfter?.archivedAt} undone=${l1After?.undoneById}`);
      const u2 = await act.undoAction(ctxOf(OWNER), l1!.id);
      await prisma.aiActionLog.update({ where: { id: l2!.id }, data: { undoableUntil: new Date(Date.now() - 1000) } });
      const u3 = await act.undoAction(ctxOf(STAFF), l2!.id);
      const u4 = await act.undoAction(ctxOf(OWNER), undoRow!.id);
      chk("U-4", "ย้อนซ้ำ ⇒ ปฏิเสธ 'ย้อนไปแล้ว' · เกิน 24 ชม. ⇒ ปฏิเสธมี '24' · แถว undo:* ⇒ 'ย้อนไม่ได้'", u2.ok === false && /แล้ว/.test(u2.note) && u3.ok === false && /24/.test(u3.note) && u4.ok === false && /ไม่ได้/.test(u4.note), JSON.stringify({ u2, u3, u4 }).slice(0, 240));
      const reg = act.UNDOABLE_KINDS as Record<string, unknown>;
      chk("U-5", "UNDOABLE_KINDS มี kanban_create_card · kanban.cards.create · kanban.cards.move · crm.deals.move · booking_create_appointment และไม่มี void_sale/record_expense/chat.send", ["kanban_create_card", "kanban.cards.create", "kanban.cards.move", "crm.deals.move", "booking_create_appointment"].every((k) => k in reg) && !("void_sale" in reg) && !("record_expense" in reg) && !("chat.send" in reg), Object.keys(reg).join(","));
    }
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
  const kcSrc = existsSync(join(ROOT, "src/lib/ai/secretary/kind-class.ts")) ? readFileSync(join(ROOT, "src/lib/ai/secretary/kind-class.ts"), "utf8") : "";
  chk("D-3", "kind-class.ts pure (ไม่ import prisma/core/db)", !kcSrc || !/@\/lib\/core\/db|from "@prisma\/client"/.test(kcSrc), "พบ import ฐานข้อมูล", "MAJOR");
}
await prisma.$disconnect();
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
