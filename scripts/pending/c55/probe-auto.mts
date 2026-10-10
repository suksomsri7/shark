// C5.5 hunt — F-AUTO: CRM automation rules run every action as OWNER; the rule author's own rights are never checked
// for the action's target (private kanban board · reopen a WON deal · member points). QC3 only, own tenant, cleaned.
// Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c55/probe-auto.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

const fx = await fixture("auto");
const { P, chk, call, mkShop, mkUser, done } = fx;
try {
  const shop = await mkShop("a");
  const { tid, S, ctx, owner, stages } = shop;
  // STAFF who was given only the automation key (+ kanban read + crm activity create to compare the manual door)
  const sid = await mkUser("-staff");
  const staffPerms = { "crm.automation.manage": true, "crm.activity.create": true, "kanban.board.read": true };
  await P.membership.create({ data: { userId: sid, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: staffPerms, acceptedAt: new Date() } });
  const staff = { userId: sid, role: "STAFF", unitAccess: ["*"], permissions: staffPerms };
  const sctx = { tenantId: tid, systemId: S, actorUserId: sid };

  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const K = (await sysSvc.createSystem(tid, "KANBAN", `บอร์ด ${fx.TAG}`)).id as string;
  const board = await P.kanbanBoard.create({ data: { tenantId: tid, systemId: K, name: "ลับ-ผู้บริหาร", visibility: "PRIVATE", createdById: shop.uid } });
  await P.kanbanColumn.create({ data: { tenantId: tid, systemId: K, boardId: board.id, name: "รอทำ", sortOrder: 0, position: "a0" } });

  const contacts = (await import("@/lib/modules/crm/contacts" as string)) as Any;
  const activities = (await import("@/lib/modules/crm/activities" as string)) as Any;
  const deals = (await import("@/lib/modules/crm/deals" as string)) as Any;
  const auto = (await import("@/lib/modules/crm/automation" as string)) as Any;

  const c = await contacts.createContact(ctx, owner, { firstName: "ทดสอบ", lastName: fx.TAG.slice(-6), ownerUserId: sid });
  const contactId = c.contact?.id ?? c.id ?? c.row?.id;
  // ── (a) the manual door refuses the private board for this STAFF ──
  const act = await activities.logActivity(ctx, owner, { type: "TASK", title: "งานทดสอบ", contactId }, { ownerUserId: sid });
  const manual = await call(() => activities.openTaskCard(sctx, staff, { activityId: act.id, boardId: board.id }));
  chk("AUTO-a1", !manual.ok && /NOT_FOUND|ไม่พบบอร์ด/.test(String(manual.err?.code ?? manual.err?.message)), `manual openTaskCard on private board as STAFF → ${manual.ok ? "ALLOWED" : `refused (${manual.err?.code})`}`);
  // ── (a) the automation door accepts it and the card lands on the private board ──
  const r1 = await call(() => auto.createRule(sctx, staff, { name: "เปิดการ์ด", trigger: { event: "crm.contact.updated" }, conditions: { mode: "AND", items: [] }, actions: [{ type: "OPEN_KANBAN_CARD", params: { boardId: board.id, title: "ลูกค้า {ชื่อ}" } }] }));
  const before = await P.kanbanCard.count({ where: { boardId: board.id } });
  if (r1.ok) await auto.runForCrmEvent({ tenantId: tid, systemId: S, type: "crm.contact.updated", payload: { contactId }, id: null });
  const after = await P.kanbanCard.count({ where: { boardId: board.id } });
  chk("AUTO-a2", !(r1.ok && after > before), `STAFF rule OPEN_KANBAN_CARD on the same private board: save=${r1.ok ? "ACCEPTED" : r1.err?.code} · cards on private board ${before}→${after}`);

  // ── (b) reopen a WON deal: manual = manager-only; automation runs as OWNER ──
  const won = stages.find((s: Any) => s.kind === "WON");
  const open0 = stages.find((s: Any) => s.kind === "OPEN");
  const d = await deals.createDeal(ctx, owner, { pipelineId: shop.pipe.id, stageId: open0.id, title: "ดีลทดสอบ", contactId, valueSatang: 100000, ownerUserId: sid });
  await deals.moveDeal(ctx, owner, d.id, { stageId: won.id });
  const sPerms2 = { ...staffPerms, "crm.deal.move": true, "crm.deal.read": true };
  const manualReopen = await call(() => deals.moveDeal(sctx, { ...staff, permissions: sPerms2 }, d.id, { stageId: open0.id, note: "เปิดใหม่ทดสอบ" }));
  chk("AUTO-b1", !manualReopen.ok, `manual reopen of WON deal by STAFF(+deal.move) → ${manualReopen.ok ? "ALLOWED" : `refused (${manualReopen.err?.code})`}`);
  // reopen (closed → OPEN) needs CONFIRM_REQUIRED even for the OWNER actor ⇒ held; closed → other closed kind (WON → LOST) is manager-only by hand
  const lost = stages.find((s: Any) => s.kind === "LOST");
  const manualLost = await call(() => deals.moveDeal(sctx, { ...staff, permissions: sPerms2 }, d.id, { stageId: lost.id }));
  chk("AUTO-b1b", !manualLost.ok, `manual WON→LOST by STAFF(+deal.move) → ${manualLost.ok ? "ALLOWED" : `refused (${manualLost.err?.code})`}`);
  const r2o = await call(() => auto.createRule(sctx, staff, { name: "ย้อนดีล", trigger: { event: "crm.deal.won" }, conditions: { mode: "AND", items: [] }, actions: [{ type: "MOVE_STAGE", params: { stageId: open0.id } }] }));
  if (r2o.ok) await auto.runForCrmEvent({ tenantId: tid, systemId: S, type: "crm.deal.won", payload: { dealId: d.id }, id: null });
  const dMid = await P.crmDeal.findUnique({ where: { id: d.id }, select: { kind: true } });
  chk("AUTO-b2(held)", !(r2o.ok && dMid?.kind === "OPEN"), `STAFF rule crm.deal.won → MOVE_STAGE(open): save=${r2o.ok ? "ACCEPTED" : r2o.err?.code} · deal kind after run=${dMid?.kind}`);
  await P.automationRule.updateMany({ where: { tenantId: tid, name: "ย้อนดีล" }, data: { enabled: false } });
  const r2 = await call(() => auto.createRule(sctx, staff, { name: "ดีลแพ้", trigger: { event: "crm.deal.won" }, conditions: { mode: "AND", items: [] }, actions: [{ type: "MOVE_STAGE", params: { stageId: lost.id } }] }));
  if (r2.ok) await auto.runForCrmEvent({ tenantId: tid, systemId: S, type: "crm.deal.won", payload: { dealId: d.id }, id: null });
  const dAfter = await P.crmDeal.findUnique({ where: { id: d.id }, select: { kind: true } });
  const runs = await P.automationRun.findMany({ where: { tenantId: tid }, select: { status: true, detail: true, payload: true } });
  chk("AUTO-b2", !(r2.ok && dAfter?.kind === "LOST"), `STAFF rule crm.deal.won → MOVE_STAGE(LOST): save=${r2.ok ? "ACCEPTED" : r2.err?.code} · deal kind after run=${dAfter?.kind} · runs=${JSON.stringify(runs.map((r: Any) => [r.status, String(r.detail ?? JSON.stringify(r.payload?.steps ?? r.payload ?? "")).slice(0, 160)]))}`);

  // ── (c) member value: member journeys need member.promo.manage, CRM rule GIVE_POINTS/ISSUE_VOUCHER needs nothing ──
  const M = (await sysSvc.createSystem(tid, "MEMBER", `สมาชิก ${fx.TAG}`)).id as string;
  const journeys = (await import("@/lib/modules/member/journeys" as string)) as Any;
  const j = await call(() => journeys.createJourney({ tenantId: tid, systemId: M, actorUserId: sid }, staff, { name: "แต้ม", trigger: { event: "member.created" }, actions: [{ type: "GIVE_POINTS", params: { points: 100000 } }] }));
  chk("AUTO-c1", !j.ok, `member.createJourney(GIVE_POINTS) as the same STAFF → ${j.ok ? "ALLOWED" : `refused (${j.err?.name})`}`);
  const r3 = await call(() => auto.createRule(sctx, staff, { name: "แจกแต้ม", trigger: { event: "crm.contact.updated" }, conditions: { mode: "AND", items: [] }, actions: [{ type: "GIVE_POINTS", params: { points: 100000 } }, { type: "ISSUE_VOUCHER", params: { templateId: "anything" } }] }));
  chk("AUTO-c2", !r3.ok, `CRM createRule(GIVE_POINTS 100,000 + ISSUE_VOUCHER) as the same STAFF → ${r3.ok ? "ACCEPTED" : `refused (${r3.err?.code})`}`);
} catch (e) {
  chk("AUTO-ERR", false, String((e as Error)?.stack ?? e).slice(0, 800));
} finally {
  await done("probe-auto");
}
