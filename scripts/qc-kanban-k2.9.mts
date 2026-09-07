// QC — บอร์ดงาน WO K2.9: ตัวสร้างกฎอัตโนมัติของบอร์ด (5 ชนิด: RULE · CARD_BUTTON · BOARD_BUTTON · SCHEDULED · DUE_DATE) · ทดลองรันไม่เขียน DB · AutomationRun · ครบ 8 event + consumer · ภาพ 08
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.9
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/automation.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/automation.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any; resolveKanbanScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null>; dayFromToday: (n: number, h?: number) => Date };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const P = prisma as Any;
let tid = ""; let SYS = ""; let board = "";
const madeCards: string[] = []; const madeRules: string[] = []; const madeLabels: string[] = []; let policyId: string | null = null;
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId; board = E.boards.maint.id; // TENANT: owner ADMIN · thana/pook VIEWER
  const au = (await import("@/lib/modules/kanban/automation" as string)) as Record<string, (...a: Any[]) => Any>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const mv = (await import("@/lib/modules/kanban/moves" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const labels = (await import("@/lib/modules/kanban/labels" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const approval = (await import("@/lib/modules/approval/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string, perms?: Record<string, boolean>) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: perms ?? (m.permissions as Record<string, unknown>) }; };
  const U = { owner: E.users.owner.userId as string, manager: E.users.manager.userId as string, pook: E.users.staff.pook.userId as string, thana: E.users.staff.thana.userId as string };
  const owner = await actorOf(U.owner); const thana = await actorOf(U.thana); const managerKey = await actorOf(U.manager, { "kanban.board.read": true, "kanban.automation.manage": true });
  const ctxOf = (userId: string) => ({ tenantId: tid, systemId: SYS, actorUserId: userId });
  const ctxO = ctxOf(U.owner);
  const NOW = kq.dayFromToday(0, 10); // พุธ 30 ก.ย. 2569 10:00 ไทย
  const cols = await prisma.kanbanColumn.findMany({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const [c0, c1] = [cols[0]!, cols[1]!];
  const lblFin = await labels.createLabel(ctxO, board, { name: `การเงิน-${Date.now() % 10000}`, color: "AMBER" }).catch(async () => prisma.kanbanLabel.create({ data: { tenantId: tid, systemId: SYS, boardId: board, name: `การเงิน-${Date.now() % 10000}`, color: "AMBER" } as Any }));
  const lblUrgent = await labels.createLabel(ctxO, board, { name: `ด่วน-${Date.now() % 10000}`, color: "RED" }).catch(async () => prisma.kanbanLabel.create({ data: { tenantId: tid, systemId: SYS, boardId: board, name: `ด่วน-${Date.now() % 10000}`, color: "RED" } as Any }));
  madeLabels.push(lblFin.id, lblUrgent.id);
  const patongCol = (await prisma.kanbanColumn.findFirst({ where: { boardId: E.boards.patong.id, status: "ACTIVE" } }))!;
  const snapshot = async () => ({ runs: await prisma.automationRun.count({ where: { tenantId: tid } }), cards: await prisma.kanbanCard.count({ where: { tenantId: tid } }), acts: await prisma.kanbanActivity.count({ where: { tenantId: tid } }), notif: await prisma.appNotification.count({ where: { tenantId: tid } }), cl: await prisma.kanbanCardLabel.count({ where: { tenantId: tid } }), ob: await prisma.outboxEvent.count({ where: { tenantId: tid } }), rules: await prisma.automationRule.count({ where: { tenantId: tid } }) });

  // ═══ S1 schema (§4.5 เพิ่มคอลัมน์ล้วน · ของเดิมห้ามลบ) ═══
  const rc = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='AutomationRule'`)).map((c) => c.column_name);
  const rr = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='AutomationRun'`)).map((c) => c.column_name);
  chk("K2.9-S1.1", "AutomationRule เพิ่ม systemId boardId kind conditions actions scheduleCron dueOffsetDays lastRunAt + index [tenantId, boardId, enabled] · ของเดิม minAmountSatang/actionType/actionConfig ยังอยู่", ["systemId", "boardId", "kind", "conditions", "actions", "scheduleCron", "dueOffsetDays", "lastRunAt", "minAmountSatang", "actionType", "actionConfig"].every((c) => rc.includes(c)) && (await q(`select 1 from pg_indexes where tablename='AutomationRule' and indexdef ilike '%"boardId"%' and indexdef ilike '%enabled%'`)).length >= 1, "ครบ", rc.join(","));
  chk("K2.9-S1.2", "AutomationRun เพิ่ม boardId cardId + index [tenantId, ruleId, createdAt]", ["boardId", "cardId"].every((c) => rr.includes(c)) && (await q(`select 1 from pg_indexes where tablename='AutomationRun' and indexdef ilike '%"ruleId"%' and indexdef ilike '%"createdAt"%'`)).length >= 1, "ครบ", rr.join(","));

  // ═══ S2 สร้างกฎ + ตรวจสอบ + ประโยคไทย ═══
  const ruleIn = { boardId: board, name: "ย้ายเข้า c1 + ป้ายการเงิน → ติดด่วน มอบ pook แจ้ง", kind: "RULE", event: "kanban.card.moved", conditions: [{ field: "column", op: "is", value: c1.id }, { field: "label", op: "has", value: lblFin.id }], actions: [{ type: "add_label", params: { labelId: lblUrgent.id } }, { type: "assign", params: { userId: U.pook } }, { type: "notify", params: { to: "assignees", message: "การ์ด {ชื่อการ์ด} รออนุมัติ" } }, { type: "comment", params: { text: "กฎอัตโนมัติ: ส่งต่อให้ปุ๊ก" } }] };
  const rule = await au.createRule(ctxO, owner, ruleIn);
  madeRules.push(rule?.id);
  const row = await prisma.automationRule.findUnique({ where: { id: rule?.id ?? "x" } }) as Any;
  chk("K2.9-S2.1", "createRule(ctx, actor, {boardId, name, kind, event, conditions[], actions[]}) → แถว boardId/systemId/kind RULE/event/conditions/actions/enabled true · actionType เดิม = NOTIFY (placeholder)", !!row && row.boardId === board && row.systemId === SYS && row.kind === "RULE" && row.event === "kanban.card.moved" && row.conditions.length === 2 && row.actions.length === 4 && row.enabled === true, "ครบ", JSON.stringify(row ?? {}).slice(0, 200));
  const desc = au.describeRule(row, { columns: { [c1.id]: c1.name }, labels: { [lblFin.id]: lblFin.name, [lblUrgent.id]: lblUrgent.name }, users: { [U.pook]: "ปุ๊ก" } });
  chk("K2.9-S2.2", "describeRule(rule, names) (pure) → ประโยคไทย 'เมื่อการ์ดถูกย้ายเข้าคอลัมน์ {c1} และถ้าการ์ดมีป้ายกำกับ {การเงิน} ให้ทำ ติดป้าย {ด่วน} และ มอบหมายให้ ปุ๊ก และ แจ้งเตือน… และ เขียนความเห็น…'", typeof desc === "string" && /^เมื่อ/.test(desc) && desc.includes(c1.name) && desc.includes(lblFin.name) && /ให้ทำ/.test(desc) && desc.includes(lblUrgent.name) && /ปุ๊ก/.test(desc) && !/kanban\.card/.test(desc), "ประโยคไทย", String(desc).slice(0, 200));
  const e21 = await fails(() => au.createRule(ctxO, owner, { ...ruleIn, name: "21", actions: Array.from({ length: 21 }, () => ({ type: "add_label", params: { labelId: lblUrgent.id } })) }));
  const eEvt = await fails(() => au.createRule(ctxO, owner, { ...ruleIn, name: "evt", event: "pos.sale.paid" }));
  const eCol = await fails(() => au.createRule(ctxO, owner, { ...ruleIn, name: "col", conditions: [{ field: "column", op: "is", value: patongCol.id }] }));
  const eEmpty = await fails(() => au.createRule(ctxO, owner, { ...ruleIn, name: "empty", actions: [] }));
  chk("K2.9-S2.3", "ตรวจสอบ: 21 การกระทำ → throw ไทย LIMIT_REACHED · event นอก 8 ของบอร์ดงาน → throw · columnId ของบอร์ดอื่น → throw · ไม่มีการกระทำ → throw", !!e21 && /[ก-๙]/.test(e21.message) && /LIMIT_REACHED|20/.test(`${(e21 as Any).code ?? ""} ${e21.message}`) && !!eEvt && !!eCol && !!eEmpty, "throw 4", `${!!e21}/${!!eEvt}/${!!eCol}/${!!eEmpty}`);
  const eT = await fails(() => au.createRule(ctxOf(U.thana), thana, { ...ruleIn, name: "thana" }));
  const eM = await fails(() => au.createRule(ctxOf(U.manager), managerKey, { ...ruleIn, name: "mgr" }));
  chk("K2.9-S2.4", "สิทธิ์ = คีย์ kanban.automation.manage (OWNER โดยนัย) **และ** ADMIN ของบอร์ด: thana (ไม่มีคีย์) → Forbidden · ผู้จัดการมีคีย์แต่เป็น VIEWER บนบอร์ดซ่อม → Forbidden", !!eT && !!eM, "throw ทั้งคู่", `${!!eT}/${!!eM}`);
  const lst = await au.listRules(ctxO, owner, board);
  chk("K2.9-S2.5", "listRules(ctx, actor, boardId) → [{id, name, kind, event, enabled, runsThisMonth, sentence}] มีกฎที่สร้าง · runsThisMonth เป็นตัวเลข · sentence ไทย", Array.isArray(lst) && lst.some((r: Any) => r.id === rule.id && typeof r.runsThisMonth === "number" && /^เมื่อ/.test(r.sentence ?? "")), "มี", JSON.stringify(lst?.[0] ?? null).slice(0, 160));

  // ═══ S3 ทดลองรันย้อนหลัง — ห้ามเขียนอะไรเลย ═══
  const cardA = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c1.id, title: "QC K2.9 ตรงเงื่อนไข", createdById: U.owner });
  const cardB = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c1.id, title: "QC K2.9 ไม่มีป้าย", createdById: U.owner });
  madeCards.push(cardA.id, cardB.id);
  await prisma.kanbanCardLabel.create({ data: { cardId: cardA.id, labelId: lblFin.id, tenantId: tid } });
  const before = await snapshot();
  const dry = await au.dryRun(ctxO, owner, ruleIn, { days: 30, now: NOW });
  const after = await snapshot();
  const expMatched = await prisma.kanbanCard.count({ where: { boardId: board, columnId: c1.id, status: "ACTIVE", cardLabels: { some: { labelId: lblFin.id } } } });
  chk("K2.9-S3.1", "🔴 dryRun(ctx, actor, input, {days, now}) → { matched: [{cardId, cardNo, title, actions: string[] (ไทย)}], total } · การ์ดใน c1 ที่มีป้ายการเงิน (cardA) ตรง · cardB ไม่ตรง · **ไม่มีแถวใหม่ใน DB เลย** (runs/cards/activity/notification/labels/outbox/rules เท่าเดิม)", dry?.total === expMatched && dry.matched.some((m: Any) => m.cardId === cardA.id && m.actions?.length === 4 && /[ก-๙]/.test(m.actions[0])) && !dry.matched.some((m: Any) => m.cardId === cardB.id) && JSON.stringify(before) === JSON.stringify(after), `${expMatched} ใบ · DB เท่าเดิม`, `${dry?.total} · ${JSON.stringify(before)} vs ${JSON.stringify(after)}`);

  // ═══ S4 รันจริงจาก event ═══
  await prisma.appNotification.deleteMany({ where: { tenantId: tid, recipientUserId: U.pook } });
  const evt = { tenantId: tid, type: "kanban.card.moved", payload: { cardId: cardA.id, boardId: board, fromColumnId: c0.id, toColumnId: c1.id, cardNo: cardA.cardNo, title: cardA.title } };
  const fired = await au.runForKanbanEvent(evt);
  const a1 = await prisma.kanbanCard.findUnique({ where: { id: cardA.id }, include: { cardLabels: true, assignees: true, comments: true } });
  const run1 = await prisma.automationRun.findFirst({ where: { tenantId: tid, ruleId: rule.id }, orderBy: { createdAt: "desc" } }) as Any;
  const nP = await prisma.appNotification.count({ where: { tenantId: tid, recipientUserId: U.pook, body: { contains: cardA.title } } });
  chk("K2.9-S4.1", "🔴 runForKanbanEvent({tenantId,type,payload}) → 1 · การ์ด A: ติดป้ายด่วน · มอบหมาย pook · ความเห็นจากกฎ · pook ได้แจ้งเตือน (template {ชื่อการ์ด} แทนค่า) · AutomationRun OK {boardId, cardId} · activity ระบุว่าเป็นอัตโนมัติ (actorUserId null + data.automation ruleId)", fired === 1 && a1!.cardLabels.some((l) => l.labelId === lblUrgent.id) && a1!.assignees.some((x) => x.userId === U.pook) && a1!.comments.some((c) => /กฎอัตโนมัติ/.test(c.body)) && nP === 1 && run1?.status === "OK" && run1.cardId === cardA.id && run1.boardId === board && !!(await prisma.kanbanActivity.findFirst({ where: { cardId: cardA.id, type: "CARD_LABELED", actorUserId: null } })), "ครบ", JSON.stringify({ fired, lbl: a1?.cardLabels.length, asg: a1?.assignees.map((x) => x.userId), cm: a1?.comments.length, nP, run: run1?.status }));
  const fired2 = await au.runForKanbanEvent(evt);
  chk("K2.9-S4.2", "กันวน: กฎเดียวกัน+การ์ดเดียวกันภายใน 60 วิ → ไม่รันซ้ำ (0 · ไม่มี AutomationRun ใหม่)", fired2 === 0 && (await prisma.automationRun.count({ where: { tenantId: tid, ruleId: rule.id } })) === 1, "0", String(fired2));
  const firedB = await au.runForKanbanEvent({ ...evt, payload: { ...evt.payload, cardId: cardB.id } });
  chk("K2.9-S4.3", "การ์ด B ไม่ตรงเงื่อนไข (ไม่มีป้าย) → 0 · ไม่มี AutomationRun (ไม่ตรง = ไม่บันทึก)", firedB === 0 && (await P.automationRun.count({ where: { tenantId: tid, cardId: cardB.id } })) === 0, "0", String(firedB));
  await au.toggleRule(ctxO, owner, rule.id, false);
  const firedOff = await au.runForKanbanEvent({ ...evt, payload: { ...evt.payload, cardId: cardB.id } });
  chk("K2.9-S4.4", "toggleRule(off) → กฎไม่รัน · กฎของบอร์ดอื่น (payload.boardId ต่างกัน) ไม่รัน · legacy runForEvent ข้ามกฎที่มี boardId (โค้ด: where boardId null)", firedOff === 0 && (await au.runForKanbanEvent({ ...evt, payload: { ...evt.payload, boardId: E.boards.patong.id } })) === 0 && /boardId:\s*null/.test(read("src/lib/automation/engine.ts")) && /runForKanbanEvent/.test(read("src/lib/automation/engine.ts")), "0 · engine เชื่อม", `${firedOff}`);
  await au.toggleRule(ctxO, owner, rule.id, true);

  // ═══ S5 การกระทำล้ม → FAILED + หยุด (webhook ผ่าน deps.post) ═══
  const rule2 = await au.createRule(ctxO, owner, { boardId: board, name: "ความเห็นใหม่ → เว็บฮุค แล้วติดป้าย", kind: "RULE", event: "kanban.comment.added", conditions: [], actions: [{ type: "webhook", params: { url: "https://example.invalid/hook" } }, { type: "add_label", params: { labelId: lblFin.id } }] });
  madeRules.push(rule2.id);
  const cardC = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K2.9 เว็บฮุคล้ม", createdById: U.owner });
  madeCards.push(cardC.id);
  const f3 = await au.runForKanbanEvent({ tenantId: tid, type: "kanban.comment.added", payload: { cardId: cardC.id, boardId: board, commentId: "x", authorId: U.owner, mentions: [] } }, { post: async () => { throw new Error("ปลายทางตอบรหัส 500"); } });
  const run2 = await prisma.automationRun.findFirst({ where: { tenantId: tid, ruleId: rule2.id } }) as Any;
  chk("K2.9-S5.1", "runForKanbanEvent(evt, deps?) — deps.post ฉีดได้แบบ engine.ts · เว็บฮุคล้ม → AutomationRun FAILED detail ไทยระบุลำดับการกระทำ · การกระทำถัดไป (ติดป้าย) **ไม่ทำ** (ล้มแล้วหยุด — D21 ไม่มี retry อัตโนมัติ) · ไม่ throw", f3 === 1 && run2?.status === "FAILED" && /[ก-๙]/.test(run2.detail ?? "") && /1|แรก/.test(run2.detail ?? "") && (await prisma.kanbanCardLabel.count({ where: { cardId: cardC.id } })) === 0, "FAILED · ป้ายไม่ติด", JSON.stringify({ f3, st: run2?.status, d: run2?.detail?.slice(0, 80) }));

  // ═══ S6 เปิดคำขออนุมัติแล้วผูกกลับมาที่การ์ด ═══
  const pol = await approval.createPolicy({ tenantId: tid }, { name: "QC K2.9 อนุมัติการ์ด", entityType: "kanban.card", steps: [{ order: 1, approverRole: "OWNER" }] });
  policyId = pol.id;
  const rule3 = await au.createRule(ctxO, owner, { boardId: board, name: "เข้า c1 → ขออนุมัติ", kind: "RULE", event: "kanban.card.moved", conditions: [{ field: "column", op: "is", value: c1.id }], actions: [{ type: "open_approval", params: { amountSatang: 1500000 } }] });
  madeRules.push(rule3.id);
  const cardD = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c1.id, title: "QC K2.9 จัดซื้อถัง", createdById: U.owner });
  madeCards.push(cardD.id);
  const f4 = await au.runForKanbanEvent({ tenantId: tid, type: "kanban.card.moved", payload: { cardId: cardD.id, boardId: board, fromColumnId: c0.id, toColumnId: c1.id } });
  const req = await prisma.approvalRequest.findFirst({ where: { tenantId: tid, entityType: "kanban.card", entityId: cardD.id } });
  const cmD = await prisma.kanbanComment.findFirst({ where: { cardId: cardD.id } });
  chk("K2.9-S6.1", "open_approval → submitForApproval(entityType 'kanban.card', entityId=cardId, systemId, amountSatang, requestedById=createdById) → ApprovalRequest + ความเห็นบนการ์ด 'รออนุมัติ' พร้อมลิงก์ /app/approvals?… (ผูกกลับมาที่การ์ด) · AutomationRun OK", f4 === 1 && !!req && !!cmD && /อนุมัติ/.test(cmD.body) && /\/app\//.test(cmD.body), "มีคำขอ + ความเห็น", JSON.stringify({ f4, req: !!req, cm: cmD?.body?.slice(0, 80) }));

  // ═══ S7 SCHEDULED (รายชั่วโมง · เวลาไทย) ═══
  const rule4 = await au.createRule(ctxO, owner, { boardId: board, name: "ทุกพุธ 08:00 สร้างการ์ดประจำสัปดาห์", kind: "SCHEDULED", scheduleCron: "0 8 * * 3", conditions: [], actions: [{ type: "create_card", params: { boardId: board, columnId: c0.id, title: "QC K2.9 งานประจำสัปดาห์" } }] });
  madeRules.push(rule4.id);
  const eCron = await fails(() => au.createRule(ctxO, owner, { boardId: board, name: "cron ผิด", kind: "SCHEDULED", scheduleCron: "* * * * *", conditions: [], actions: [{ type: "notify", params: { to: "admins", message: "x" } }] }));
  const s1 = await au.sweepScheduledRules(kq.dayFromToday(0, 8)); // พุธ 08:xx ไทย
  const s2 = await au.sweepScheduledRules(new Date(kq.dayFromToday(0, 8).getTime() + 20 * 60_000)); // ชั่วโมงเดียวกัน
  const s3 = await au.sweepScheduledRules(kq.dayFromToday(1, 8)); // พฤหัส
  const s4 = await au.sweepScheduledRules(kq.dayFromToday(7, 8)); // พุธหน้า
  const weekly = await prisma.kanbanCard.findMany({ where: { boardId: board, title: "QC K2.9 งานประจำสัปดาห์" } });
  madeCards.push(...weekly.map((c) => c.id));
  chk("K2.9-S7.1", "🔴 SCHEDULED: scheduleCron subset 'นาที ชั่วโมง * * วัน(0-6 หรือ *)' เวลาไทย · '* * * * *' → throw ไทย · sweepScheduledRules(now): พุธ 08:xx → 1 (การ์ดใหม่ sourceType AUTOMATION · lastRunAt ตั้ง) · ชั่วโมงเดียวกันซ้ำ → 0 · พฤหัส → 0 · พุธหน้า → 1", !!eCron && s1 === 1 && s2 === 0 && s3 === 0 && s4 === 1 && weekly.length === 2 && weekly.every((c) => c.sourceType === "AUTOMATION"), "1/0/0/1 · 2 ใบ", `${!!eCron} · ${s1}/${s2}/${s3}/${s4} · ${weekly.length}`);

  // ═══ S8 DUE_DATE (รายวัน) ═══
  const rule5 = await au.createRule(ctxO, owner, { boardId: board, name: "2 วันก่อนครบกำหนด → เตือน + ป้ายด่วน", kind: "DUE_DATE", dueOffsetDays: -2, conditions: [], actions: [{ type: "notify", params: { to: "assignees", message: "การ์ด {ชื่อการ์ด} ใกล้ครบกำหนด" } }, { type: "add_label", params: { labelId: lblUrgent.id } }] });
  madeRules.push(rule5.id);
  const cardE = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K2.9 ครบกำหนดอีก 2 วัน", dueAt: kq.dayFromToday(2, 18), assigneeUserId: U.pook, createdById: U.owner });
  const cardF = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K2.9 ครบกำหนดวันนี้", dueAt: kq.dayFromToday(0, 18), assigneeUserId: U.pook, createdById: U.owner });
  madeCards.push(cardE.id, cardF.id);
  await prisma.appNotification.deleteMany({ where: { tenantId: tid, recipientUserId: U.pook } });
  const d1 = await au.sweepDueDateRules(NOW);
  const d2 = await au.sweepDueDateRules(kq.dayFromToday(0, 22));
  chk("K2.9-S8.1", "🔴 DUE_DATE dueOffsetDays -2: sweepDueDateRules(now) → การ์ดที่ครบกำหนดอีก 2 วัน (E) โดนกฎ (pook แจ้ง 1 · ป้ายด่วน) · การ์ด F (วันนี้) ไม่โดน · รันซ้ำวันเดียวกัน → 0 (idempotent ต่อ กฎ+การ์ด+วัน)", d1 === 1 && d2 === 0 && (await prisma.appNotification.count({ where: { tenantId: tid, recipientUserId: U.pook, body: { contains: cardE.title } } })) === 1 && (await prisma.kanbanCardLabel.count({ where: { cardId: cardE.id, labelId: lblUrgent.id } })) === 1 && (await prisma.kanbanCardLabel.count({ where: { cardId: cardF.id } })) === 0, "1 แล้ว 0", `${d1}/${d2}`);

  // ═══ S9 ปุ่มบนการ์ด / ปุ่มบนบอร์ด ═══
  const rule6 = await au.createRule(ctxO, owner, { boardId: board, name: "ส่งให้ปุ๊ก", kind: "CARD_BUTTON", conditions: [], actions: [{ type: "assign", params: { userId: U.pook } }, { type: "move_column", params: { columnId: c1.id } }] });
  const rule7 = await au.createRule(ctxO, owner, { boardId: board, name: "เปิดงานตรวจสต็อก", kind: "BOARD_BUTTON", conditions: [], actions: [{ type: "create_card", params: { boardId: board, columnId: c0.id, title: "QC K2.9 ตรวจสต็อก" } }] });
  madeRules.push(rule6.id, rule7.id);
  const cardG = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K2.9 ปุ่ม", createdById: U.owner });
  madeCards.push(cardG.id);
  const b1 = await au.runButton(ctxO, owner, rule6.id, { cardId: cardG.id });
  const g = await prisma.kanbanCard.findUnique({ where: { id: cardG.id }, include: { assignees: true } });
  const b2 = await au.runButton(ctxO, owner, rule7.id, {});
  const stockCard = await prisma.kanbanCard.findFirst({ where: { boardId: board, title: "QC K2.9 ตรวจสต็อก" } });
  if (stockCard) madeCards.push(stockCard.id);
  const eBtn = await fails(() => au.runButton(ctxOf(U.thana), thana, rule6.id, { cardId: cardG.id }));
  chk("K2.9-S9.1", "runButton(ctx, actor, ruleId, {cardId?}) (EDITOR+): CARD_BUTTON → มอบหมาย pook + ย้ายไป c1 (ผ่าน moveCard เดิม · activity มี actorUserId = คนกด) · BOARD_BUTTON → สร้างการ์ด · thana (VIEWER) → Forbidden · AutomationRun OK ทั้งคู่", b1?.ok === true && g!.assignees.some((a) => a.userId === U.pook) && g!.columnId === c1.id && b2?.ok === true && !!stockCard && !!eBtn && (await prisma.automationRun.count({ where: { tenantId: tid, ruleId: { in: [rule6.id, rule7.id] }, status: "OK" } })) === 2 && !!(await prisma.kanbanActivity.findFirst({ where: { cardId: cardG.id, type: "CARD_MOVED", actorUserId: U.owner } })), "ครบ", JSON.stringify({ b1, col: g?.columnId === c1.id, b2, stock: !!stockCard, eBtn: !!eBtn }));

  // ═══ S10 บันทึกการทำงาน + โควตา ═══
  const runs = await au.listRuns(ctxO, owner, board, { take: 50 });
  const usage = await au.usageThisMonth(ctxO, board);
  chk("K2.9-S10.1", "listRuns(ctx, actor, boardId, {take}) → [{id, ruleId, ruleName, status, detail, cardId, cardTitle, createdAt}] ใหม่ก่อน มีทั้ง OK และ FAILED · usageThisMonth(ctx, boardId) → { used, limit: 1000 } (KANBAN_LIMITS.automationRunsPerMonth)", Array.isArray(runs) && runs.some((r: Any) => r.status === "OK" && r.ruleName) && runs.some((r: Any) => r.status === "FAILED") && runs.every((r: Any, i: number) => i === 0 || new Date(runs[i - 1].createdAt) >= new Date(r.createdAt)) && usage?.limit === 1000 && usage.used >= 5 && /automationRunsPerMonth:\s*1000/.test(read("src/lib/modules/kanban/limits.ts")) && /actionsPerRule:\s*20/.test(read("src/lib/modules/kanban/limits.ts")), "ครบ", JSON.stringify({ n: runs?.length, usage }));
  const upd = await au.updateRule(ctxO, owner, rule.id, { name: "ชื่อใหม่", actions: ruleIn.actions.slice(0, 2) });
  await au.deleteRule(ctxO, owner, rule2.id);
  chk("K2.9-S10.2", "updateRule (ADMIN+คีย์) แก้ชื่อ/เงื่อนไข/การกระทำ ตรวจสอบเหมือนสร้าง · deleteRule → หาย · run เก่ายังอยู่ (ประวัติ)", upd?.name === "ชื่อใหม่" && ((await prisma.automationRule.findUnique({ where: { id: rule.id } })) as Any).actions.length === 2 && !(await prisma.automationRule.findUnique({ where: { id: rule2.id } })) && (await prisma.automationRun.count({ where: { ruleId: rule2.id } })) === 1, "ครบ", "ไม่ตรง");

  // ═══ S11 event ครบ 8 + consumer + cron + UI (static) ═══
  const lab = read("src/lib/automation/labels.ts"); const cons = read("src/lib/outbox-consumers.ts");
  const EV8 = ["kanban.card.created", "kanban.card.moved", "kanban.card.assigned", "kanban.card.completed", "kanban.card.due_soon", "kanban.card.overdue", "kanban.checklist.completed", "kanban.comment.added"];
  chk("K2.9-S11.1", "🔴 AUTOMATION_EVENTS มีครบ 8 event ของบอร์ดงาน (§7.2) ป้ายไทย · **ทุกตัวมี consumer ใน outbox-consumers.ts** · KANBAN_AUTOMATION_EVENTS export แยกสำหรับ dropdown ของบอร์ด", EV8.every((e) => new RegExp(`value:\\s*"${e.replace(/\./g, "\\.")}"`).test(lab)) && EV8.every((e) => cons.includes(`"${e}"`)) && /KANBAN_AUTOMATION_EVENTS/.test(lab + read("src/lib/modules/kanban/automation.ts")), "8/8", EV8.filter((e) => !new RegExp(`value:\\s*"${e.replace(/\./g, "\\.")}"`).test(lab) || !cons.includes(`"${e}"`)).join(","));
  chk("K2.9-S11.2", "cron: hourly route เรียก sweepScheduledRules (best-effort) · runDailyCron เรียก sweepDueDateRules ใน try/catch แยก · ไม่แก้ vercel.json · เอนจินไม่มี any", /sweepScheduledRules/.test(read("src/app/api/cron/hourly/route.ts")) && /sweepDueDateRules\(now\)/.test(read("src/lib/platform/cron.ts")) && !/kanban|automation/i.test(read("vercel.json")) && !/:\s*any\b/.test(read("src/lib/modules/kanban/automation.ts")), "ครบ", "ขาด");
  const ui = read("src/components/kanban/AutomationBuilder.tsx"); const page = read("src/app/app/sys/[id]/kanban/automation/page.tsx");
  chk("K2.9-S11.3", "หน้า /kanban/automation?board= (page.tsx: ไม่มีคีย์/ไม่ใช่ ADMIN = 404) + AutomationBuilder.tsx ตามภาพ 08: หัว 'อัตโนมัติ — {บอร์ด}' + ชิป 'ใช้ไป n / 1,000 ครั้งเดือนนี้' testid automation-usage + ปุ่ม 'สร้างกฎใหม่' · ซ้าย 'ประเภทอัตโนมัติ' 5 รายการ+จำนวน testid automation-kinds (รายงานอีเมล = เร็ว ๆ นี้ · คำแนะนำจาก AI = เร็ว ๆ นี้ K3.6) · 'บันทึกการทำงาน'", page.length > 0 && ["automation-usage", "automation-kinds"].every((t) => ui.includes(t)) && /ประเภทอัตโนมัติ/.test(ui) && /ตามวันครบกำหนด/.test(ui) && /ปุ่มบนการ์ด/.test(ui) && /ปุ่มบนบอร์ด/.test(ui) && /ตั้งเวลา/.test(ui) && /บันทึกการทำงาน/.test(ui) && /1,000/.test(ui), "ครบ", "ขาด");
  chk("K2.9-S11.4", "ตัวสร้างกฎ: 'กฎใหม่ — ยังไม่บันทึก' + 'อ่านเป็นประโยคไทยได้ตรง ๆ · เลือกจากรายการ ไม่ต้องเขียนโค้ด' + ป้าย 'ทดลองรันย้อนหลังได้' · แถว เมื่อ/และถ้า/ให้ทำ/และ testid rule-when rule-if rule-then · '+ เพิ่มเงื่อนไข หรือ เพิ่มการกระทำ (สูงสุด 20 การกระทำต่อ 1 กฎ)' · ช่องชื่อกฎ · ปุ่ม ทดลองรัน (rule-dry-run → รายการ 'จะทำอะไรกับใบไหน') / ยกเลิก / บันทึกกฎ (rule-save) · dropdown event ใช้ป้ายไทย บรรทัดรองแสดง code ได้", ["rule-when", "rule-if", "rule-then", "rule-dry-run", "rule-save"].every((t) => ui.includes(t)) && /ยังไม่บันทึก/.test(ui) && /ไม่ต้องเขียนโค้ด/.test(ui) && /ทดลองรันย้อนหลัง/.test(ui) && /สูงสุด 20 การกระทำ/.test(ui), "ครบ", "ขาด");
  chk("K2.9-S11.5", "ตาราง 'กฎที่เปิดใช้อยู่' testid rules-table (ชื่อ · บรรทัดรอง 'เมื่อ {ป้ายไทย} · …' · รันเดือนนี้ · สวิตช์เปิด/ปิด · แก้/ลบ) · 'บันทึกการทำงานล่าสุด' testid runs-log (OK/ล้ม สีต่าง + เวลาไทย + รายละเอียด) · 'คำแนะนำจาก AI' แผงว่างพร้อมข้อความ 'เร็ว ๆ นี้'", ["rules-table", "runs-log"].every((t) => ui.includes(t)) && /กฎที่เปิดใช้อยู่/.test(ui) && /รันเดือนนี้/.test(ui) && /บันทึกการทำงานล่าสุด/.test(ui) && /คำแนะนำจาก AI/.test(ui), "ครบ", "ขาด");
  chk("K2.9-S11.6", "ปุ่มบนการ์ด (CARD_BUTTON) โผล่ในหลังการ์ด testid card-button · ปุ่มบนบอร์ด (BOARD_BUTTON) โผล่ในหัวบอร์ด testid board-button · ตั้งค่าบอร์ด › อัตโนมัติ ลิงก์มาหน้านี้ · nav automation status ready · actions ครบ (createRuleAction updateRuleAction toggleRuleAction deleteRuleAction dryRunAction runButtonAction)", read("src/components/kanban/CardBack.tsx").includes("card-button") && read("src/components/kanban/BoardHeader.tsx").includes("board-button") && /key:\s*"automation"[^}]*status:\s*"ready"/.test(read("src/lib/modules/kanban/nav.ts")) && ["createRuleAction", "updateRuleAction", "toggleRuleAction", "deleteRuleAction", "dryRunAction", "runButtonAction"].every((a) => (read("src/lib/modules/kanban/actions.ts") + read("src/lib/modules/kanban/automation-actions.ts")).includes(a)), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/2.9") ? readdirSync(".qc-shots/kanban/2.9").filter((f) => f.endsWith(".png")) : [];
  chk("K2.9-S11.7", "ภาพจริง ≥ 4 ใบใน .qc-shots/kanban/2.9 (หน้าเต็มเทียบภาพ 08 · หลังกดทดลองรัน · ตารางกฎ+บันทึก · มือถือ)", shots.length >= 4, "≥4", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (tid) {
      const ids = madeCards.filter(Boolean);
      if (policyId) { await prisma.approvalRequest.deleteMany({ where: { tenantId: tid, entityType: "kanban.card" } }).catch(() => null); await prisma.approvalStep.deleteMany({ where: { policyId } }).catch(() => null); await prisma.approvalPolicy.deleteMany({ where: { id: policyId } }).catch(() => null); }
      if (ids.length) { await prisma.kanbanActivity.deleteMany({ where: { cardId: { in: ids } } }); await prisma.kanbanCard.deleteMany({ where: { id: { in: ids } } }); }
      if (madeRules.length) { await prisma.automationRun.deleteMany({ where: { ruleId: { in: madeRules.filter(Boolean) } } }); await prisma.automationRule.deleteMany({ where: { id: { in: madeRules.filter(Boolean) } } }); }
      if (madeLabels.length) await prisma.kanbanLabel.deleteMany({ where: { id: { in: madeLabels } } });
      await prisma.appNotification.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
      await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, type: { startsWith: "kanban." } } }).catch(() => null);
      await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, type: { startsWith: "approval." } } }).catch(() => null);
    }
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.9 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
