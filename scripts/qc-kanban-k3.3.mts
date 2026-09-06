// QC — บอร์ดงาน WO K3.3: การ์ดเกิดจากที่อื่น (inbound bridges §9.2) — ฟอร์ม/อนุมัติ/เอกสารบัญชี/ใบลา/บิลยกเลิก/แชทค้าง · สวิตช์รายร้าน (ปริยายปิด) · idempotent · event ใหม่ hr.leave.submitted มี consumer
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K3.3 · เกณฑ์ §9.2/§13 K3.3 · ต้องมี K3.1 + K3.2 (integrations) ก่อน
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/platform/kanban-bridges.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/platform/kanban-bridges.ts)");
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
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
let tid = ""; let SYS = ""; let settingsBackup: unknown = null;
const made = { cards: [] as string[], systems: [] as string[], forms: [] as string[], policies: [] as string[], convs: [] as string[], contacts: [] as string[], sales: [] as string[], employees: [] as string[] };
const evt = (type: string, payload: Any, systemId: string | null = null) => ({ id: `qc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tenantId: tid, type, payload, systemId, unitId: null });
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId;
  const integ = (await import("@/lib/modules/kanban/integrations" as string)) as Record<string, (...a: Any[]) => Any>;
  const br = (await import("@/lib/platform/kanban-bridges" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const oc = (await import("@/lib/outbox-consumers" as string)) as { consumers: Record<string, (e: Any) => Promise<void>> };
  const hr = (await import("@/lib/modules/hr/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const approval = (await import("@/lib/modules/approval/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const U = { owner: E.users.owner.userId as string, manager: E.users.manager.userId as string };
  const owner = await actorOf(U.owner); const ctxO = { tenantId: tid, systemId: SYS, actorUserId: U.owner };
  const board = E.boards.maint.id as string; const patong = E.boards.patong.id as string;
  const cols = await prisma.kanbanColumn.findMany({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const c0 = cols[0]!; const done = cols.find((c) => c.isDoneColumn)!;
  const patongUnit = (await prisma.kanbanBoard.findUnique({ where: { id: patong }, select: { unitId: true } }))!.unitId!;
  settingsBackup = (await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } }))?.settings ?? {};
  const NOW = kq.dayFromToday(0, 10);
  const cardsBySource = (prefix: string) => prisma.kanbanCard.findMany({ where: { tenantId: tid, sourceKey: { startsWith: prefix } } as Any });
  const fire = async (type: string, payload: Any, systemId: string | null = null, times = 3) => { for (let i = 0; i < times; i++) await oc.consumers[type]!(evt(type, payload, systemId)); };

  // ═══ S1 event ใหม่ + ทะเบียน ═══
  const hrSys = await prisma.appSystem.create({ data: { tenantId: tid, type: "HR" as Any, name: "HR QC K3.3" } }); made.systems.push(hrSys.id);
  await prisma.appSystemUnit.create({ data: { systemId: hrSys.id, unitId: patongUnit } as Any }).catch(() => null);
  const emp = await prisma.hrEmployee.create({ data: { tenantId: tid, systemId: hrSys.id, name: "พี่ก้อง ช่างซ่อม" } }); made.employees.push(emp.id);
  await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, type: "hr.leave.submitted" } });
  const leave = await hr.requestLeave({ tenantId: tid, systemId: hrSys.id }, { employeeId: emp.id, type: "SICK", fromDate: kq.dayFromToday(3), toDate: kq.dayFromToday(4), reason: "ไข้" });
  const ob = await prisma.outboxEvent.findFirst({ where: { tenantId: tid, type: "hr.leave.submitted" } }) as Any;
  chk("K3.3-S1.1", "hr.requestLeave ยิง outbox hr.leave.submitted (key hr.leave.submitted#{leaveId} · payload {leaveId, employeeId, fromDate, toDate, type} · systemId) · ลงทะเบียน consumer + AUTOMATION_EVENTS/WEBHOOK_EVENTS ป้ายไทย", !!ob && ob.payload.leaveId === leave.id && ob.payload.employeeId === emp.id && ob.systemId === hrSys.id && typeof oc.consumers["hr.leave.submitted"] === "function" && /hr\.leave\.submitted/.test(read("src/lib/automation/labels.ts") + read("src/lib/webhooks/labels.ts")), "ครบ", `ob=${!!ob} consumer=${typeof oc.consumers["hr.leave.submitted"]}`);
  chk("K3.3-S1.2", "ทุก event ที่ bridge ฟัง มี consumer: forms.submission.received · approval.request.submitted/approved/rejected · account.document.approved · account.invoice.paid · hr.leave.submitted · pos.sale.voided · chat.message.received", ["forms.submission.received", "approval.request.submitted", "approval.request.approved", "approval.request.rejected", "account.document.approved", "account.invoice.paid", "hr.leave.submitted", "pos.sale.voided", "chat.message.received"].every((t) => typeof oc.consumers[t] === "function"), "ครบ", "ขาด");

  // ═══ S2 ปิดสวิตช์ = ไม่เกิดอะไร (early return) ═══
  const form = await prisma.formDef.create({ data: { tenantId: tid, name: "ฟอร์มจองทริป QC", publicToken: `qc-k33-${Date.now()}`, fieldsJson: [{ key: "name", label: "ชื่อ", type: "text" }, { key: "phone", label: "โทร", type: "phone" }, { key: "note", label: "รายละเอียด", type: "textarea" }] } }); made.forms.push(form.id);
  const sub = await prisma.formSubmission.create({ data: { tenantId: tid, formId: form.id, answersJson: { name: "คุณนิด", phone: "0899999999", note: "อยากไปสิมิลัน 5 คน" } } });
  const beforeAll = await prisma.kanbanCard.count({ where: { tenantId: tid } });
  await fire("forms.submission.received", { formId: form.id, submissionId: sub.id, crmContactId: null });
  chk("K3.3-S2.1", "สวิตช์ปริยายปิด: ยิง forms.submission.received 3 ครั้ง → ไม่มีการ์ดใหม่ (consumer เดิม notify ยังทำงานตามปกติ)", (await prisma.kanbanCard.count({ where: { tenantId: tid } })) === beforeAll, "0 ใหม่", String((await prisma.kanbanCard.count({ where: { tenantId: tid } })) - beforeAll));
  const brSrc = read("src/lib/platform/kanban-bridges.ts").replace(/\s+/g, " ");
  chk("K3.3-S2.2", "โค้ด bridge ทุกตัวอ่าน getIntegrations ก่อน แล้ว return ทันทีเมื่อปิด (ไม่มี prisma query ก่อนด่านสวิตช์) — ตรวจ: ในแต่ละ handler `getIntegrations` มาก่อน `prisma.` ตัวแรก", (() => { const fns = brSrc.split(/export (?:const|async function) /).slice(1); const handlers = fns.filter((f) => /getIntegrations|integrationsFor/.test(f)); return handlers.length >= 6 && handlers.every((f) => { const g = f.search(/getIntegrations|integrationsFor/); const p = f.search(/prisma\./); return p === -1 || g < p; }); })(), "สวิตช์ก่อน query", "ผิดลำดับ");

  // เปิดทุกสวิตช์
  await integ.setIntegrations(ctxO, owner, { cardFromForm: { enabled: true, boardId: board, columnId: c0.id }, cardFromApproval: { enabled: true, boardId: board }, closeCardOnDocApproved: { enabled: true }, cardOnLeave: { enabled: true, boardId: patong }, cardOnVoidedSale: { enabled: true, boardId: board, minSatang: 100000 }, openTaskFromChat: { enabled: true, boardId: board, columnId: c0.id, unassignedMinutes: 30 } });

  // ═══ S3 ฟอร์ม ═══
  await fire("forms.submission.received", { formId: form.id, submissionId: sub.id, crmContactId: null });
  const fc = await cardsBySource(`form:${sub.id}`); made.cards.push(...fc.map((c) => c.id));
  const fLinks = fc[0] ? await P.kanbanCardLink.findMany({ where: { cardId: fc[0].id } }) : [];
  chk("K3.3-S3.1", "🔴 ยิง forms.submission.received ซ้ำ 3 ครั้ง → การ์ด 1 ใบ (sourceKey form:{submissionId} · sourceType FORM) ในบอร์ด/คอลัมน์ที่ตั้ง · ชื่อ 'ฟอร์ม: {ชื่อฟอร์ม} — {ชื่อผู้กรอก}' · รายละเอียด = คำตอบทุกข้อ (label: ค่า · sanitize) · ลิงก์ FORM_SUBMISSION", fc.length === 1 && fc[0]!.boardId === board && fc[0]!.columnId === c0.id && fc[0]!.sourceType === "FORM" && /ฟอร์ม: ฟอร์มจองทริป QC/.test(fc[0]!.title) && /คุณนิด/.test(fc[0]!.title) && /สิมิลัน/.test(fc[0]!.description ?? "") && /0899999999/.test(fc[0]!.description ?? "") && fLinks.some((l: Any) => l.linkType === "FORM_SUBMISSION" && l.linkId === sub.id), "1 ใบ", JSON.stringify({ n: fc.length, t: fc[0]?.title, links: fLinks.map((l: Any) => l.linkType) }));

  // ═══ S4 อนุมัติ → การ์ดติดตาม → ผลอนุมัติเป็นกิจกรรม ═══
  const pol = await approval.createPolicy({ tenantId: tid }, { name: "QC K3.3 จัดซื้อ", entityType: "qc.purchase", steps: [{ order: 1, approverRole: "OWNER" }] }); made.policies.push(pol.id);
  const subm = await approval.submitForApproval({ tenantId: tid }, { entityType: "qc.purchase", entityId: `po-${Date.now()}`, requestedById: U.manager, amountSatang: 2500000 });
  const reqId = (subm as Any).requestId as string;
  await fire("approval.request.submitted", { requestId: reqId, entityType: "qc.purchase", entityId: "po-x" });
  const ac = await cardsBySource(`approval:${reqId}`); made.cards.push(...ac.map((c) => c.id));
  chk("K3.3-S4.1", "approval.request.submitted ×3 → การ์ดติดตาม 1 ใบ (sourceKey approval:{requestId}) ชื่อ 'คำขออนุมัติ: {ชนิด} ฿25,000' · ลิงก์ APPROVAL_REQUEST · ผู้รับผิดชอบ = ผู้ยื่น (manager)", ac.length === 1 && /คำขออนุมัติ/.test(ac[0]!.title) && /25,000/.test(ac[0]!.title) && (await P.kanbanCardLink.count({ where: { cardId: ac[0]!.id, linkType: "APPROVAL_REQUEST", linkId: reqId } })) === 1 && (await prisma.kanbanCardAssignee.count({ where: { cardId: ac[0]!.id, userId: U.manager } })) === 1, "1 ใบ", JSON.stringify({ n: ac.length, t: ac[0]?.title }));
  await fire("approval.request.approved", { requestId: reqId, entityType: "qc.purchase", entityId: "po-x" });
  const acRow = await prisma.kanbanCard.findUnique({ where: { id: ac[0]?.id ?? "x" } });
  const acActs = await prisma.kanbanActivity.findMany({ where: { cardId: ac[0]?.id ?? "x" }, orderBy: { createdAt: "asc" } });
  chk("K3.3-S4.2", "approval.request.approved ×3 → ไม่สร้างการ์ดใหม่ · การ์ดเดิมได้ความเห็นระบบ 'ผลอนุมัติ: อนุมัติแล้ว' **1 ครั้ง** (idempotent ต่อ requestId+status) + ย้ายเข้าคอลัมน์เสร็จแรกของบอร์ด (completedAt ตั้ง)", (await cardsBySource(`approval:${reqId}`)).length === 1 && (await prisma.kanbanComment.count({ where: { cardId: ac[0]?.id ?? "x", body: { contains: "อนุมัติแล้ว" } } })) === 1 && acRow?.columnId === done.id && acRow.completedAt !== null && acActs.filter((a) => a.type === "CARD_MOVED").length === 1, "1 ความเห็น · เสร็จ", JSON.stringify({ cm: await prisma.kanbanComment.count({ where: { cardId: ac[0]?.id ?? "x" } }), col: acRow?.columnId === done.id }));

  // ═══ S5 เอกสารบัญชีอนุมัติ → ปิดการ์ดที่ผูก ═══
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const docCard = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K3.3 ตามใบแจ้งหนี้", createdById: U.owner }); made.cards.push(docCard.id);
  const docId = `qc-doc-${Date.now()}`;
  await P.kanbanCardLink.create({ data: { tenantId: tid, systemId: SYS, cardId: docCard.id, linkType: "ACCOUNT_DOC", linkId: docId, role: "RELATED", label: "INV-QC" } });
  await fire("account.document.approved", { documentId: docId, docType: "INVOICE", approvedById: U.owner });
  const dc = await prisma.kanbanCard.findUnique({ where: { id: docCard.id } });
  chk("K3.3-S5.1", "account.document.approved ×3 → การ์ดที่ผูก ACCOUNT_DOC นั้นย้ายเข้าคอลัมน์เสร็จแรก + completedAt · activity CARD_MOVED 1 ครั้ง · ความเห็นระบบ 'เอกสาร … อนุมัติแล้ว' 1 ครั้ง · **ไม่แตะเอกสารบัญชี** (bridge ไม่ import account หรือเขียนตาราง Account*)", dc?.columnId === done.id && dc.completedAt !== null && (await prisma.kanbanActivity.count({ where: { cardId: docCard.id, type: "CARD_MOVED" } })) === 1 && (await prisma.kanbanComment.count({ where: { cardId: docCard.id } })) === 1 && !/prisma\.account[A-Z]\w*\.(update|create|delete)/.test(brSrc), "ปิด 1 ครั้ง", JSON.stringify({ col: dc?.columnId === done.id, moved: await prisma.kanbanActivity.count({ where: { cardId: docCard.id, type: "CARD_MOVED" } }) }));
  const patCol = (await prisma.kanbanColumn.findFirst({ where: { boardId: patong, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  const noDoneCard = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: patCol.id, title: "QC K3.3 บอร์ดไม่มีคอลัมน์เสร็จ", createdById: U.owner }); made.cards.push(noDoneCard.id);
  await P.kanbanCardLink.create({ data: { tenantId: tid, systemId: SYS, cardId: noDoneCard.id, linkType: "ACCOUNT_DOC", linkId: `${docId}-b`, role: "RELATED" } });
  await fire("account.invoice.paid", { documentId: `${docId}-b` }, null, 1);
  const nd = await prisma.kanbanCard.findUnique({ where: { id: noDoneCard.id } });
  chk("K3.3-S5.2", "บอร์ดที่ไม่มีคอลัมน์ isDoneColumn → ไม่ย้าย (คงที่) แต่มีความเห็นระบบ · ไม่ throw (consumer หลักไม่ล้ม)", nd?.columnId === patCol.id && (await prisma.kanbanComment.count({ where: { cardId: noDoneCard.id } })) === 1, "คงที่ + ความเห็น", JSON.stringify({ col: nd?.columnId === patCol.id, cm: await prisma.kanbanComment.count({ where: { cardId: noDoneCard.id } }) }), "MAJOR");

  // ═══ S6 ใบลา → การ์ดหาคนแทน ═══
  await fire("hr.leave.submitted", ob.payload, hrSys.id);
  const lc = await cardsBySource(`hrleave:${leave.id}`); made.cards.push(...lc.map((c) => c.id));
  chk("K3.3-S6.1", "hr.leave.submitted ×3 → การ์ด 1 ใบในบอร์ดที่ตั้ง (ป่าตอง) ชื่อ 'หาคนแทน: พี่ก้อง ช่างซ่อม ลาป่วย {วันไทย}–{วันไทย}' · dueAt = วันก่อนเริ่มลา 09:00 ไทย · ลิงก์ HR_LEAVE · มอบหมายผู้จัดการสาขาของระบบ HR (patong manager) · sourceType AUTOMATION", lc.length === 1 && /หาคนแทน/.test(lc[0]!.title) && /พี่ก้อง/.test(lc[0]!.title) && /ลาป่วย/.test(lc[0]!.title) && lc[0]!.boardId === patong && (await P.kanbanCardLink.count({ where: { cardId: lc[0]!.id, linkType: "HR_LEAVE", linkId: leave.id } })) === 1 && (await prisma.kanbanCardAssignee.count({ where: { cardId: lc[0]!.id, userId: U.manager } })) === 1 && lc[0]!.dueAt && new Date(lc[0]!.dueAt.getTime() + 7 * 3600_000).toISOString().slice(0, 13) === new Date(kq.dayFromToday(2, 9).getTime() + 7 * 3600_000).toISOString().slice(0, 13), "1 ใบ · manager", JSON.stringify({ n: lc.length, t: lc[0]?.title, due: lc[0]?.dueAt }));

  // ═══ S7 บิลยกเลิกยอดเกิน ═══
  const posSys = await prisma.appSystem.create({ data: { tenantId: tid, type: "POS" as Any, name: "POS QC K3.3" } }); made.systems.push(posSys.id);
  const mk = async (satang: number) => { const s = await prisma.posSale.create({ data: { tenantId: tid, unitId: patongUnit, systemId: posSys.id, idempotencyKey: `qc-k33-${satang}-${Date.now()}`, receiptNo: `R-${satang}`, status: "VOIDED", subtotalSatang: satang, grandTotalSatang: satang } }); made.sales.push(s.id); return s; };
  const big = await mk(250000); const small = await mk(50000);
  await fire("pos.sale.voided", { saleId: big.id }, posSys.id); await fire("pos.sale.voided", { saleId: small.id }, posSys.id);
  const bc = await cardsBySource(`possale:${big.id}`); const sc = await cardsBySource(`possale:${small.id}`); made.cards.push(...bc.map((c) => c.id), ...sc.map((c) => c.id));
  chk("K3.3-S7.1", "pos.sale.voided ×3: ยอด ≥ minSatang (฿2,500 ≥ ฿1,000) → การ์ดตรวจสอบ 1 ใบ 'ตรวจสอบบิลยกเลิก R-250000 ฿2,500' + ลิงก์ POS_SALE · ยอดต่ำกว่า → ไม่สร้าง", bc.length === 1 && /ตรวจสอบบิลยกเลิก/.test(bc[0]!.title) && /2,500/.test(bc[0]!.title) && (await P.kanbanCardLink.count({ where: { cardId: bc[0]!.id, linkType: "POS_SALE", linkId: big.id } })) === 1 && sc.length === 0, "1 / 0", `${bc.length} / ${sc.length}`);

  // ═══ S8 แชทค้างไม่มีคนรับ (sweep รายชั่วโมง) ═══
  const chatSys = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT" as Any, name: "แชท QC K3.3" } }); made.systems.push(chatSys.id);
  const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", externalUserId: `qc-k33-${Date.now()}`, displayName: "ลูกค้ารอคำตอบ" } }); made.contacts.push(contact.id);
  const stale = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", contactId: contact.id, status: "OPEN", lastMessageAt: new Date(NOW.getTime() - 45 * 60_000), lastMessageDirection: "IN" } }); made.convs.push(stale.id);
  const staleMsg = await prisma.chatMessage.create({ data: { tenantId: tid, systemId: chatSys.id, conversationId: stale.id, direction: "IN", type: "TEXT", body: "ขอราคาคอร์สหน่อยครับ", createdAt: new Date(NOW.getTime() - 45 * 60_000) } });
  const fresh = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", contactId: contact.id, status: "OPEN", lastMessageAt: new Date(NOW.getTime() - 5 * 60_000), lastMessageDirection: "IN" } }); made.convs.push(fresh.id);
  await prisma.chatMessage.create({ data: { tenantId: tid, systemId: chatSys.id, conversationId: fresh.id, direction: "IN", type: "TEXT", body: "เพิ่งทัก", createdAt: new Date(NOW.getTime() - 5 * 60_000) } });
  const assigned = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", contactId: contact.id, status: "OPEN", assigneeUserId: U.owner, lastMessageAt: new Date(NOW.getTime() - 90 * 60_000), lastMessageDirection: "IN" } }); made.convs.push(assigned.id);
  await prisma.chatMessage.create({ data: { tenantId: tid, systemId: chatSys.id, conversationId: assigned.id, direction: "IN", type: "TEXT", body: "มีคนรับแล้ว", createdAt: new Date(NOW.getTime() - 90 * 60_000) } });
  const s1 = await br.sweepUnattendedChats(NOW); const s2 = await br.sweepUnattendedChats(NOW);
  const cc = await cardsBySource(`chat:${staleMsg.id}`); made.cards.push(...cc.map((c) => c.id));
  chk("K3.3-S8.1", "🔴 sweepUnattendedChats(now) (hourly · composition root): ห้อง OPEN ไม่มีผู้รับ · ข้อความลูกค้าล่าสุดค้าง > unassignedMinutes (30) → การ์ด 1 ใบ 'ลูกค้ารอคำตอบ: {ชื่อ}' (sourceKey chat:{messageId} · sourceType CHAT · ลิงก์ CHAT_CONVERSATION) · ห้องเพิ่งทัก (5 นาที) / ห้องมีคนรับ → ไม่สร้าง · รันซ้ำ → 0", s1 === 1 && s2 === 0 && cc.length === 1 && /ลูกค้ารอคำตอบ/.test(cc[0]!.title) && cc[0]!.sourceType === "CHAT" && (await P.kanbanCardLink.count({ where: { cardId: cc[0]!.id, linkType: "CHAT_CONVERSATION", linkId: stale.id } })) === 1 && (await prisma.kanbanCard.count({ where: { tenantId: tid, sourceType: "CHAT", createdAt: { gte: new Date(Date.now() - 5 * 60_000) } } })) === 1, "1 แล้ว 0", `${s1}/${s2} · ${cc.length}`);
  chk("K3.3-S8.2", "hourly route เรียก sweepUnattendedChats (best-effort) · bridges ไม่ import จาก modules/kanban/service ตรง — ใช้ facade links.createCardFromExternal + integrations · ไม่มี any", /sweepUnattendedChats/.test(read("src/app/api/cron/hourly/route.ts")) && /kanban\/links/.test(brSrc) && /kanban\/integrations/.test(brSrc) && !/:\s*any\b/.test(read("src/lib/platform/kanban-bridges.ts")), "ครบ", "ขาด");

  // ═══ S9 UI ตั้งค่า (static) ═══
  const st = read("src/components/kanban/IntegrationsSettings.tsx");
  chk("K3.3-S9.1", "ตั้งค่า › การเชื่อมต่อ (kanban-integrations) มีสวิตช์ครบ 6: สร้างงานจากแชท (+นาทีที่ค้าง) · การ์ดจากฟอร์ม · การ์ดติดตามคำขออนุมัติ · ปิดการ์ดเมื่อเอกสารบัญชีอนุมัติ/จ่ายแล้ว · การ์ดหาคนแทนเมื่อมีใบลา · การ์ดตรวจสอบบิลยกเลิก (+ยอดขั้นต่ำ) · แต่ละตัวเลือกบอร์ด/คอลัมน์ · คำอธิบายภาษาคน · ปริยายปิด", /ฟอร์ม/.test(st) && /อนุมัติ/.test(st) && /ใบลา/.test(st) && /บิลยกเลิก/.test(st) && /เอกสาร/.test(st) && /นาที/.test(st) && /ยอดขั้นต่ำ|ขั้นต่ำ/.test(st) && st.includes("kanban-integrations"), "ครบ 6", "ขาด");
  const shots = existsSync(".qc-shots/kanban/3.3") ? require("node:fs").readdirSync(".qc-shots/kanban/3.3").filter((f: string) => f.endsWith(".png")) : [];
  chk("K3.3-S9.2", "ภาพจริง ≥ 2 ใบใน .qc-shots/kanban/3.3 (หน้าตั้งค่าการเชื่อมต่อ · การ์ดที่เกิดจากฟอร์มบนบอร์ดพร้อมชิปที่มา)", shots.length >= 2, "≥2", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (tid) {
      const ids = [...new Set(made.cards.filter(Boolean))];
      if (ids.length) { await P.kanbanCardLink.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null); await prisma.kanbanComment.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null); await prisma.kanbanActivity.deleteMany({ where: { cardId: { in: ids } } }); await prisma.kanbanCard.deleteMany({ where: { id: { in: ids } } }); }
      await prisma.kanbanCard.deleteMany({ where: { tenantId: tid, sourceKey: { not: null }, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } as Any }).catch(() => null);
      for (const id of made.convs) { await prisma.chatMessage.deleteMany({ where: { conversationId: id } }).catch(() => null); await prisma.chatConversation.deleteMany({ where: { id } }).catch(() => null); }
      if (made.contacts.length) await prisma.chatContact.deleteMany({ where: { id: { in: made.contacts } } }).catch(() => null);
      if (made.sales.length) await prisma.posSale.deleteMany({ where: { id: { in: made.sales } } }).catch(() => null);
      await prisma.hrLeave.deleteMany({ where: { tenantId: tid, employeeId: { in: made.employees } } }).catch(() => null);
      if (made.employees.length) await prisma.hrEmployee.deleteMany({ where: { id: { in: made.employees } } }).catch(() => null);
      await prisma.approvalRequest.deleteMany({ where: { tenantId: tid, entityType: "qc.purchase" } }).catch(() => null);
      for (const pid of made.policies) { await prisma.approvalStep.deleteMany({ where: { policyId: pid } }).catch(() => null); await prisma.approvalPolicy.deleteMany({ where: { id: pid } }).catch(() => null); }
      if (made.forms.length) { await prisma.formSubmission.deleteMany({ where: { formId: { in: made.forms } } }).catch(() => null); await prisma.formDef.deleteMany({ where: { id: { in: made.forms } } }).catch(() => null); }
      for (const sid of made.systems) { await prisma.appSystemUnit.deleteMany({ where: { systemId: sid } }).catch(() => null); await prisma.appSystem.deleteMany({ where: { id: sid } }).catch(() => null); }
      if (settingsBackup !== null) await prisma.appSystem.update({ where: { id: SYS }, data: { settings: settingsBackup as Any } }).catch(() => null);
      await prisma.appNotification.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
      await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } }).catch(() => null);
    }
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K3.3 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
